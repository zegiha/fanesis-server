import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import {
  CanvasFileTooLargeException,
  CanvasNotFoundException,
  CanvasUploadNotConfirmedException,
} from './exceptions/canvas.exceptions';
import { CanvasService } from './canvas.service';

describe('CanvasService (unit)', () => {
  let service: CanvasService;

  const presignedPut = jest.fn();
  const headObject = jest.fn();
  const canvasesFindUnique = jest.fn();
  const canvasesUpsert = jest.fn();

  beforeEach(async () => {
    presignedPut.mockReset();
    headObject.mockReset();
    canvasesFindUnique.mockReset();
    canvasesUpsert.mockReset();

    presignedPut.mockResolvedValue('https://r2.example.com/presigned');
    headObject.mockResolvedValue({
      contentType: 'application/octet-stream',
      contentLength: 1024,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanvasService,
        {
          provide: StorageService,
          useValue: { presignedPut, headObject },
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
      ],
    }).compile();

    service = module.get(CanvasService);
  });

  describe('getUploadUrl', () => {
    it('returns presignedUrl and versionKey', async () => {
      const result = await service.getUploadUrl('user-1', '2026-05-19');

      expect(presignedPut).toHaveBeenCalledTimes(1);
      expect(result.presignedUrl).toBe('https://r2.example.com/presigned');
      expect(result.versionKey).toMatch(/^[A-Za-z0-9_-]{10}$/);
    });
  });

  describe('confirmUpload', () => {
    const userId = 'user-1';
    const date = '2026-05-19';
    const versionKey = 'abc1234567';

    it('creates new canvas with version v1.{versionKey}', async () => {
      canvasesFindUnique.mockResolvedValue(null);
      canvasesUpsert.mockResolvedValue({
        uuid: 'c1',
        version: `v1.${versionKey}`,
      });

      await service.confirmUpload(userId, date, versionKey);

      expect(canvasesUpsert).toHaveBeenCalledTimes(1);
      const createArg = (
        canvasesUpsert.mock.calls[0] as [{ create: { version: string } }]
      )[0];
      expect(createArg.create.version).toBe(`v1.${versionKey}`);
    });

    it('increments version for existing canvas (v1.old -> v2.{newKey})', async () => {
      canvasesFindUnique.mockResolvedValue({
        uuid: 'c1',
        version: 'v1.abcOldKey0',
      });
      canvasesUpsert.mockResolvedValue({
        uuid: 'c1',
        version: `v2.${versionKey}`,
      });

      await service.confirmUpload(userId, date, versionKey);

      const updateArg = (
        canvasesUpsert.mock.calls[0] as [{ update: { version: string } }]
      )[0];
      expect(updateArg.update.version).toBe(`v2.${versionKey}`);
    });

    it('increments version past v9 (v9.old -> v10.{newKey})', async () => {
      canvasesFindUnique.mockResolvedValue({
        uuid: 'c1',
        version: 'v9.oldKey0000',
      });
      canvasesUpsert.mockResolvedValue({ uuid: 'c1' });

      await service.confirmUpload(userId, date, versionKey);

      const updateArg = (
        canvasesUpsert.mock.calls[0] as [{ update: { version: string } }]
      )[0];
      expect(updateArg.update.version).toBe(`v10.${versionKey}`);
    });

    it('throws CanvasUploadNotConfirmedException when R2 file not found', async () => {
      headObject.mockRejectedValue(new Error('not found'));

      await expect(
        service.confirmUpload(userId, date, versionKey),
      ).rejects.toBeInstanceOf(CanvasUploadNotConfirmedException);
    });

    it('throws CanvasFileTooLargeException when file exceeds 50 MB', async () => {
      headObject.mockResolvedValue({
        contentType: 'application/octet-stream',
        contentLength: 51 * 1024 * 1024,
      });

      await expect(
        service.confirmUpload(userId, date, versionKey),
      ).rejects.toBeInstanceOf(CanvasFileTooLargeException);
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

    it('returns presignedUrl and ocrKey for owner', async () => {
      canvasesFindUnique.mockResolvedValue({ uuid: 'c1', userUuid: 'user-1' });

      const result = await service.getOcrUploadUrl('user-1', 'c1');

      expect(presignedPut).toHaveBeenCalledTimes(1);
      expect(result.presignedUrl).toBe('https://r2.example.com/presigned');
      expect(result.ocrKey).toMatch(/^[A-Za-z0-9_-]{10}$/);
    });
  });
});
