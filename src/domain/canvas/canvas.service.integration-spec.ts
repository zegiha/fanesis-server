import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { CanvasService } from './canvas.service';

describe('canvas (integration)', () => {
  let prisma: PrismaClient;
  let service: CanvasService;

  const jwtVerify = jest.fn();
  const headObject = jest.fn();
  const presignedPut = jest.fn();

  // confirmUpload가 내부에서 jwtService.verify 와 storageService.headObject 를 사용.
  // JwtService / StorageService 는 mock 으로 주입해 외부 의존성을 제거한다.
  beforeAll(async () => {
    prisma = createTestPrisma();

    const module = await Test.createTestingModule({
      providers: [
        CanvasService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            headObject,
            presignedPut,
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock.token'),
            verify: jwtVerify,
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test-secret') },
        },
      ],
    }).compile();

    service = module.get(CanvasService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
    jwtVerify.mockReset();
    headObject.mockReset();
    presignedPut.mockReset();

    headObject.mockResolvedValue({
      contentType: 'application/octet-stream',
      contentLength: 1024,
    });
    presignedPut.mockResolvedValue('https://mock-presigned.url');
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser() {
    return prisma.users.create({
      data: { language: Language.ko, timezone: 'Asia/Seoul' },
    });
  }

  function makeVersionPayload(
    userId: string,
    date: string,
    versionKey: string,
  ) {
    return { sub: userId, date, versionKey, aud: 'upload:canvas' };
  }

  describe('confirmUpload', () => {
    it('신규 canvas 저장 → version 형식 v1.{versionKey}', async () => {
      const user = await createUser();
      const date = '2026-05-19';
      const versionKey = 'abcde12345';
      jwtVerify.mockReturnValue(
        makeVersionPayload(user.uuid, date, versionKey),
      );

      const canvas = await service.confirmUpload(user.uuid, date, 'tok');

      expect(canvas.version).toBe(`v1.${versionKey}`);
      expect(canvas.userUuid).toBe(user.uuid);

      // DB에도 실제로 저장됐는지 확인
      const dbCanvas = await prisma.canvases.findUnique({
        where: { userUuid_date: { userUuid: user.uuid, date: new Date(date) } },
      });
      expect(dbCanvas?.version).toBe(`v1.${versionKey}`);
    });

    it('같은 날 재저장 → version v2.{newKey} + (user_uuid, date) UNIQUE 유지', async () => {
      const user = await createUser();
      const date = '2026-05-19';
      const key1 = 'firstkey001';
      const key2 = 'secondky002';

      jwtVerify.mockReturnValueOnce(makeVersionPayload(user.uuid, date, key1));
      await service.confirmUpload(user.uuid, date, 'tok1');

      jwtVerify.mockReturnValueOnce(makeVersionPayload(user.uuid, date, key2));
      const canvas2 = await service.confirmUpload(user.uuid, date, 'tok2');

      expect(canvas2.version).toBe(`v2.${key2}`);

      // (user_uuid, date) unique → 레코드는 여전히 1개
      const all = await prisma.canvases.findMany({
        where: { userUuid: user.uuid },
      });
      expect(all).toHaveLength(1);
      expect(all[0].version).toBe(`v2.${key2}`);
    });
  });

  describe('task_canvas_sources ON DELETE SET NULL', () => {
    it('canvas 삭제 → task_canvas_sources.canvas_uuid NULL (task는 유지)', async () => {
      const user = await createUser();

      // canvas 생성
      const canvas = await prisma.canvases.create({
        data: {
          userUuid: user.uuid,
          date: new Date('2026-05-19'),
          storageKey: 'canvases/test/2026-05-19/v1key.bin',
          version: 'v1.testkey001',
        },
      });

      // task 생성
      const task = await prisma.tasks.create({
        data: {
          userUuid: user.uuid,
          title: '운동하기',
          backlogKind: 'inbox',
        },
      });

      // task_canvas_sources 연결
      await prisma.taskCanvasSources.create({
        data: {
          taskUuid: task.uuid,
          canvasUuid: canvas.uuid,
          sourceKey: 'ocr/canvas/key001.jpg',
          ocrText: '운동하기',
        },
      });

      // canvas 삭제
      await prisma.canvases.delete({ where: { uuid: canvas.uuid } });

      // task_canvas_sources 레코드가 유지되고 canvas_uuid 는 NULL
      const source = await prisma.taskCanvasSources.findUnique({
        where: { taskUuid: task.uuid },
      });
      expect(source).not.toBeNull();
      expect(source?.canvasUuid).toBeNull();

      // task 자체도 유지
      const stillTask = await prisma.tasks.findUnique({
        where: { uuid: task.uuid },
      });
      expect(stillTask).not.toBeNull();
    });
  });

  describe('task_canvas_sources sourceKey UNIQUE', () => {
    it('같은 sourceKey로 두 번 create → Prisma unique constraint error', async () => {
      const user = await createUser();

      const task1 = await prisma.tasks.create({
        data: { userUuid: user.uuid, title: 'task1', backlogKind: 'inbox' },
      });
      const task2 = await prisma.tasks.create({
        data: { userUuid: user.uuid, title: 'task2', backlogKind: 'inbox' },
      });

      const sourceKey = 'duplicate-source-key';

      await prisma.taskCanvasSources.create({
        data: { taskUuid: task1.uuid, sourceKey },
      });

      await expect(
        prisma.taskCanvasSources.create({
          data: { taskUuid: task2.uuid, sourceKey },
        }),
      ).rejects.toThrow();
    });
  });
});
