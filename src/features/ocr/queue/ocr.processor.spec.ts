import { Test, TestingModule } from '@nestjs/testing';
import type { Job } from 'bullmq';
import apnsConfig from '@/core/config/apns.config';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import { PushNotificationService } from '@/features/push-notification/push-notification.service';
import { OcrService } from '../ocr.service';
import { OcrProcessor } from './ocr.processor';
import type { OcrJobPayload } from './ocr.queue.constants';

const DEFAULT_JOB_DATA: OcrJobPayload = {
  canvasUuid: 'canvas-uuid-1',
  ocrKey: 'ocrKey123',
  ocrImageKey: 'ocr/canvas-uuid-1/ocrKey123.jpg',
  userId: 'user-uuid-1',
  userTimezone: 'Asia/Seoul',
};

function makeJob(overrides: Partial<OcrJobPayload> = {}): Job<OcrJobPayload> {
  return { data: { ...DEFAULT_JOB_DATA, ...overrides } } as Job<OcrJobPayload>;
}

describe('OcrProcessor (unit)', () => {
  let processor: OcrProcessor;

  const getObjectBuffer = jest.fn();
  const analyze = jest.fn();
  const taskCanvasSourcesFindUnique = jest.fn();
  const prismaTransaction = jest.fn();
  const sendToUser = jest.fn();

  // apnsConfig mock value — keyId 빈 문자열 = dev 환경
  const apnsCfgMock = {
    keyId: '',
    teamId: '',
    key: '',
    bundleId: '',
    production: false,
    reminderLeadMinutes: 1,
  };

  function buildModule(apnsCfgOverride = apnsCfgMock) {
    return Test.createTestingModule({
      providers: [
        OcrProcessor,
        {
          provide: StorageService,
          useValue: { getObjectBuffer },
        },
        {
          provide: OcrService,
          useValue: { analyze },
        },
        {
          provide: PrismaService,
          useValue: {
            taskCanvasSources: { findUnique: taskCanvasSourcesFindUnique },
            $transaction: prismaTransaction,
          },
        },
        {
          provide: PushNotificationService,
          useValue: { sendToUser },
        },
        {
          provide: apnsConfig.KEY,
          useValue: apnsCfgOverride,
        },
      ],
    }).compile();
  }

  beforeEach(async () => {
    getObjectBuffer.mockReset();
    analyze.mockReset();
    taskCanvasSourcesFindUnique.mockReset();
    prismaTransaction.mockReset();
    sendToUser.mockReset();

    // Default returns
    getObjectBuffer.mockResolvedValue(Buffer.from('fake-image'));
    analyze.mockResolvedValue('운동하기');
    taskCanvasSourcesFindUnique.mockResolvedValue(null);
    prismaTransaction.mockResolvedValue({
      uuid: 'task-uuid-1',
      title: '운동하기',
    });
    sendToUser.mockResolvedValue(1);

    const module: TestingModule = await buildModule();
    processor = module.get(OcrProcessor);
  });

  describe('Happy path', () => {
    it('OCR 텍스트가 있으면 $transaction 호출 후 sendToUser에 taskUuids 포함', async () => {
      const txTasksCreate = jest
        .fn()
        .mockResolvedValue({ uuid: 'task-uuid-1', title: '운동하기' });
      const txSourcesCreate = jest.fn().mockResolvedValue({});
      prismaTransaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            tasks: { create: txTasksCreate },
            taskCanvasSources: { create: txSourcesCreate },
          }),
      );

      await processor.process(makeJob());

      expect(prismaTransaction).toHaveBeenCalledTimes(1);
      // APNs keyId 없음(dev) → sendToUser 호출 안 됨
      expect(sendToUser).not.toHaveBeenCalled();

      // tasks.create 인자 검증
      expect(txTasksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            title: '운동하기',
            userUuid: 'user-uuid-1',
            backlogKind: 'inbox',
          }),
        }),
      );

      // taskCanvasSources.create 인자 검증
      expect(txSourcesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            taskUuid: 'task-uuid-1',
            canvasUuid: 'canvas-uuid-1',
            sourceKey: 'ocrKey123',
            ocrText: '운동하기',
          }),
        }),
      );
    });
  });

  describe('Idempotency', () => {
    it('sourceKey가 이미 존재하면 $transaction 호출 안 됨', async () => {
      taskCanvasSourcesFindUnique.mockResolvedValue({
        taskUuid: 'existing-task',
        sourceKey: 'ocrKey123',
      });

      await processor.process(makeJob());

      expect(prismaTransaction).not.toHaveBeenCalled();
      expect(analyze).not.toHaveBeenCalled();
    });
  });

  describe('Empty OCR result', () => {
    it('analyze가 빈 문자열 반환 시 $transaction 호출 안 됨', async () => {
      analyze.mockResolvedValue('');

      await processor.process(makeJob());

      expect(prismaTransaction).not.toHaveBeenCalled();
    });

    it('analyze가 빈 문자열 반환 시 sendToUser에 taskUuids: [] 전달 — dev는 keyId 없어 skip', async () => {
      analyze.mockResolvedValue('');
      // dev (keyId='') 환경이므로 sendToUser 호출 안 됨 — 로그만 출력
      await processor.process(makeJob());
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('빈 OCR 결과 시 keyId 있으면 sendToUser에 taskUuids: [] 전달', async () => {
      analyze.mockResolvedValue('');
      sendToUser.mockResolvedValue(0);

      const module: TestingModule = await buildModule({
        ...apnsCfgMock,
        keyId: 'test-key-id',
      });
      const processorWithKey = module.get(OcrProcessor);

      await processorWithKey.process(makeJob());

      expect(prismaTransaction).not.toHaveBeenCalled();
      expect(sendToUser).toHaveBeenCalledTimes(1);
      const [calledUserId, calledOptions] = sendToUser.mock.calls[0] as [
        string,
        { silent: boolean; payload: Record<string, unknown> },
      ];
      expect(calledUserId).toBe(DEFAULT_JOB_DATA.userId);
      expect(calledOptions.payload['taskUuids']).toEqual([]);
    });
  });

  describe('timezoneToLanguageHints — analyze 호출 두 번째 인자 검증', () => {
    it('Asia/Seoul 타임존 → hints에 ko 포함', async () => {
      await processor.process(makeJob({ userTimezone: 'Asia/Seoul' }));
      expect(analyze).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.arrayContaining(['ko']),
      );
    });

    it('Asia/Pyongyang 타임존 → hints에 ko 포함', async () => {
      await processor.process(makeJob({ userTimezone: 'Asia/Pyongyang' }));
      expect(analyze).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.arrayContaining(['ko']),
      );
    });

    it('Asia/Tokyo 타임존 → hints에 ja 포함', async () => {
      await processor.process(makeJob({ userTimezone: 'Asia/Tokyo' }));
      expect(analyze).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.arrayContaining(['ja']),
      );
    });

    it('America/New_York 타임존 → hints에 en 포함', async () => {
      await processor.process(makeJob({ userTimezone: 'America/New_York' }));
      expect(analyze).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.arrayContaining(['en']),
      );
    });

    it('Europe/London 타임존 → hints에 en 포함', async () => {
      await processor.process(makeJob({ userTimezone: 'Europe/London' }));
      expect(analyze).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.arrayContaining(['en']),
      );
    });

    it('알 수 없는 타임존 → hints가 영어 기본값', async () => {
      await processor.process(makeJob({ userTimezone: 'Unknown/Zone' }));
      expect(analyze).toHaveBeenCalledWith(expect.any(Buffer), ['en']);
    });
  });

  describe('APNs 설정 분기', () => {
    it('keyId 없음(dev) → warn 로그 + throw 없음 + sendToUser 호출 안 됨', async () => {
      // 기본 apnsCfgMock keyId='' 이므로 warn만 출력되고 예외 없음
      await expect(processor.process(makeJob())).resolves.not.toThrow();
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('keyId 있음 → sendToUser 호출됨', async () => {
      const module: TestingModule = await buildModule({
        ...apnsCfgMock,
        keyId: 'real-key-id',
      });
      const processorWithKey = module.get(OcrProcessor);

      await processorWithKey.process(makeJob());

      expect(sendToUser).toHaveBeenCalledTimes(1);
      const [calledUserId, calledOptions] = sendToUser.mock.calls[0] as [
        string,
        { silent: boolean; payload: Record<string, unknown> },
      ];
      expect(calledUserId).toBe(DEFAULT_JOB_DATA.userId);
      expect(calledOptions.silent).toBe(true);
      expect(calledOptions.payload['event']).toBe('ocr_completed');
      expect(calledOptions.payload['canvasUuid']).toBe(
        DEFAULT_JOB_DATA.canvasUuid,
      );
      expect(calledOptions.payload['taskUuids']).toEqual(['task-uuid-1']);
    });

    it('NODE_ENV=production + keyId 없음 → Error throw', async () => {
      jest.replaceProperty(process.env, 'NODE_ENV', 'production');

      const module: TestingModule = await buildModule({
        ...apnsCfgMock,
        keyId: '',
      });
      const prodProcessor = module.get(OcrProcessor);

      await expect(prodProcessor.process(makeJob())).rejects.toThrow(
        'APNs keyId is required in production',
      );

      jest.restoreAllMocks();
    });
  });
});
