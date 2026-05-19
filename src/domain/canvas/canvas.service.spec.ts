import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import {
  CanvasFileTooLargeException,
  CanvasNotFoundException,
  CanvasUploadNotConfirmedException,
  CanvasVersionTokenExpiredException,
  CanvasVersionTokenInvalidException,
} from './exceptions/canvas.exceptions';
import { CanvasService } from './canvas.service';

describe('CanvasService (unit)', () => {
  let service: CanvasService;

  const presignedPut = jest.fn();
  const headObject = jest.fn();
  const jwtSign = jest.fn();
  const jwtVerify = jest.fn();
  const canvasesFindUnique = jest.fn();
  const canvasesUpsert = jest.fn();
  const configGet = jest.fn();

  beforeEach(async () => {
    presignedPut.mockReset();
    headObject.mockReset();
    jwtSign.mockReset();
    jwtVerify.mockReset();
    canvasesFindUnique.mockReset();
    canvasesUpsert.mockReset();
    configGet.mockReset();

    // Default mock returns
    presignedPut.mockResolvedValue('https://r2.example.com/presigned');
    headObject.mockResolvedValue({
      contentType: 'application/octet-stream',
      contentLength: 1024,
    });
    jwtSign.mockReturnValue('mock.token');
    configGet.mockReturnValue('test-secret');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanvasService,
        {
          provide: StorageService,
          useValue: { presignedPut, headObject },
        },
        {
          provide: JwtService,
          useValue: { sign: jwtSign, verify: jwtVerify },
        },
        {
          provide: PrismaService,
          useValue: {
            canvases: {
              findUnique: canvasesFindUnique,
              upsert: canvasesUpsert,
            },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get(CanvasService);
  });

  describe('getUploadUrl', () => {
    it('returns presignedUrl and versionToken', async () => {
      const result = await service.getUploadUrl('user-1', '2026-05-19');

      expect(presignedPut).toHaveBeenCalledTimes(1);
      expect(jwtSign).toHaveBeenCalledTimes(1);
      expect(result.presignedUrl).toBe('https://r2.example.com/presigned');
      expect(result.versionToken).toBe('mock.token');
    });
  });

  describe('confirmUpload', () => {
    const userId = 'user-1';
    const date = '2026-05-19';

    function makePayload(versionKey = 'abc1234567') {
      return {
        sub: userId,
        date,
        versionKey,
        aud: 'upload:canvas',
      };
    }

    it('creates new canvas with version v1.{versionKey}', async () => {
      jwtVerify.mockReturnValue(makePayload());
      canvasesFindUnique.mockResolvedValue(null);
      canvasesUpsert.mockResolvedValue({ uuid: 'c1', version: 'irrelevant' });

      await service.confirmUpload(userId, date, 'tok');

      expect(canvasesUpsert).toHaveBeenCalledTimes(1);
      // Service builds version from the versionKey in the JWT payload — verify the actual create arg
      const createArg = (
        canvasesUpsert.mock.calls[0] as [{ create: { version: string } }]
      )[0];
      expect(createArg.create.version).toMatch(/^v1\.[A-Za-z0-9_-]{10}$/);
    });

    it('increments version for existing canvas (v1.abc -> v2.{newKey})', async () => {
      jwtVerify.mockReturnValue(makePayload());
      canvasesFindUnique.mockResolvedValue({
        uuid: 'c1',
        version: 'v1.abcOldKey0',
      });
      canvasesUpsert.mockResolvedValue({ uuid: 'c1', version: 'irrelevant' });

      await service.confirmUpload(userId, date, 'tok');

      expect(canvasesUpsert).toHaveBeenCalledTimes(1);
      const updateArg = (
        canvasesUpsert.mock.calls[0] as [{ update: { version: string } }]
      )[0];
      expect(updateArg.update.version).toMatch(/^v2\.[A-Za-z0-9_-]{10}$/);
    });

    it('increments version past v9 for existing canvas (v9.old -> v10.{newKey})', async () => {
      jwtVerify.mockReturnValue(makePayload());
      canvasesFindUnique.mockResolvedValue({
        uuid: 'c1',
        version: 'v9.oldKey0000',
      });
      canvasesUpsert.mockResolvedValue({ uuid: 'c1', version: 'irrelevant' });

      await service.confirmUpload(userId, date, 'tok');

      expect(canvasesUpsert).toHaveBeenCalledTimes(1);
      const updateArg = (
        canvasesUpsert.mock.calls[0] as [{ update: { version: string } }]
      )[0];
      expect(updateArg.update.version).toMatch(/^v10\./);
    });

    it('throws CanvasVersionTokenExpiredException when JWT is expired', async () => {
      const expiredError = new Error('jwt expired');
      expiredError.name = 'TokenExpiredError';
      jwtVerify.mockImplementation(() => {
        throw expiredError;
      });

      await expect(
        service.confirmUpload(userId, date, 'expired-tok'),
      ).rejects.toBeInstanceOf(CanvasVersionTokenExpiredException);
    });

    it('throws CanvasVersionTokenInvalidException when JWT is tampered', async () => {
      const tamperedError = new Error('invalid signature');
      tamperedError.name = 'JsonWebTokenError';
      jwtVerify.mockImplementation(() => {
        throw tamperedError;
      });

      await expect(
        service.confirmUpload(userId, date, 'bad-tok'),
      ).rejects.toBeInstanceOf(CanvasVersionTokenInvalidException);
    });

    it('throws CanvasVersionTokenInvalidException when aud does not match', async () => {
      jwtVerify.mockReturnValue({
        sub: userId,
        date,
        versionKey: 'abc1234567',
        aud: 'upload:ocr', // wrong aud
      });

      await expect(
        service.confirmUpload(userId, date, 'tok'),
      ).rejects.toBeInstanceOf(CanvasVersionTokenInvalidException);
    });

    it('throws CanvasUploadNotConfirmedException when R2 file not found', async () => {
      jwtVerify.mockReturnValue(makePayload());
      headObject.mockRejectedValue(new Error('not found'));

      await expect(
        service.confirmUpload(userId, date, 'tok'),
      ).rejects.toBeInstanceOf(CanvasUploadNotConfirmedException);
    });

    it('throws CanvasFileTooLargeException when file exceeds 50 MB', async () => {
      jwtVerify.mockReturnValue(makePayload());
      headObject.mockResolvedValue({
        contentType: 'application/octet-stream',
        contentLength: 51 * 1024 * 1024, // 51 MB
      });

      await expect(
        service.confirmUpload(userId, date, 'tok'),
      ).rejects.toBeInstanceOf(CanvasFileTooLargeException);
    });

    it('throws CanvasVersionTokenInvalidException when payload.sub does not match userId', async () => {
      jwtVerify.mockReturnValue({
        sub: 'other-user',
        date,
        versionKey: 'abc1234567',
        aud: 'upload:canvas',
      });

      await expect(
        service.confirmUpload(userId, date, 'tok'),
      ).rejects.toBeInstanceOf(CanvasVersionTokenInvalidException);
    });

    it('throws CanvasVersionTokenInvalidException when payload.date does not match date', async () => {
      jwtVerify.mockReturnValue({
        sub: userId,
        date: '2026-01-01', // different date
        versionKey: 'abc1234567',
        aud: 'upload:canvas',
      });

      await expect(
        service.confirmUpload(userId, date, 'tok'),
      ).rejects.toBeInstanceOf(CanvasVersionTokenInvalidException);
    });
  });

  describe('findByDate', () => {
    it('throws CanvasNotFoundException when canvas does not exist', async () => {
      canvasesFindUnique.mockResolvedValue(null);

      await expect(
        service.findByDate('user-1', '2026-05-19'),
      ).rejects.toBeInstanceOf(CanvasNotFoundException);
    });

    it('returns canvas when found', async () => {
      const canvas = { uuid: 'c1', userUuid: 'user-1' };
      canvasesFindUnique.mockResolvedValue(canvas);

      const result = await service.findByDate('user-1', '2026-05-19');
      expect(result.uuid).toBe('c1');
    });
  });

  describe('getOcrUploadUrl', () => {
    it('throws CanvasNotFoundException when canvas belongs to a different user', async () => {
      canvasesFindUnique.mockResolvedValue({
        uuid: 'c1',
        userUuid: 'other-user',
      });

      await expect(
        service.getOcrUploadUrl('user-1', 'c1'),
      ).rejects.toBeInstanceOf(CanvasNotFoundException);
    });

    it('throws CanvasNotFoundException when canvas does not exist', async () => {
      canvasesFindUnique.mockResolvedValue(null);

      await expect(
        service.getOcrUploadUrl('user-1', 'c1'),
      ).rejects.toBeInstanceOf(CanvasNotFoundException);
    });

    it('returns presignedUrl and ocrToken for owner', async () => {
      canvasesFindUnique.mockResolvedValue({ uuid: 'c1', userUuid: 'user-1' });

      const result = await service.getOcrUploadUrl('user-1', 'c1');

      expect(presignedPut).toHaveBeenCalledTimes(1);
      expect(result.presignedUrl).toBe('https://r2.example.com/presigned');
      expect(result.ocrToken).toBe('mock.token');
    });
  });

  describe('verifyOcrToken', () => {
    it('returns payload when token is valid', () => {
      const payload = {
        sub: 'user-1',
        canvasUuid: 'c1',
        ocrKey: 'key123',
        aud: 'upload:ocr',
      };
      jwtVerify.mockReturnValue(payload);

      const result = service.verifyOcrToken('valid-token', 'user-1');
      expect(result.canvasUuid).toBe('c1');
      expect(result.ocrKey).toBe('key123');
    });

    it('throws Error when token is invalid', () => {
      jwtVerify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      expect(() => service.verifyOcrToken('bad-token', 'user-1')).toThrow();
    });

    it('throws Error when aud does not match upload:ocr', () => {
      jwtVerify.mockReturnValue({
        sub: 'user-1',
        canvasUuid: 'c1',
        ocrKey: 'key123',
        aud: 'upload:canvas', // wrong
      });

      expect(() => service.verifyOcrToken('tok', 'user-1')).toThrow(
        'invalid aud or sub',
      );
    });

    it('throws Error when sub does not match userId', () => {
      jwtVerify.mockReturnValue({
        sub: 'other-user',
        canvasUuid: 'c1',
        ocrKey: 'key123',
        aud: 'upload:ocr',
      });

      expect(() => service.verifyOcrToken('tok', 'user-1')).toThrow(
        'invalid aud or sub',
      );
    });
  });
});
