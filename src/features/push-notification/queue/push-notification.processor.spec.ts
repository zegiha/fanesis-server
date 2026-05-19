import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import apnsConfig from '@/core/config/apns.config';
import { PrismaService } from '@/core/prisma/prisma.service';
import { DeviceService } from '@/domain/device/device.service';
import { ApnsProvider } from '../apns.provider';
import {
  PUSH_NOTIFICATION_QUEUE,
  PushNotificationJob,
  SendApnsJobData,
} from './queue.constants';
import { PushNotificationProcessor } from './push-notification.processor';

type BulkJob = Parameters<Queue['addBulk']>[0][number];

function makeJob(data: SendApnsJobData): Job {
  return {
    name: PushNotificationJob.SendApns,
    data,
    id: 'test-job-id',
  } as unknown as Job;
}

function makeReminderJob(): Job {
  return {
    name: PushNotificationJob.CheckTaskReminders,
    data: {},
    id: 'reminder-job-id',
  } as unknown as Job;
}

describe('PushNotificationProcessor (unit)', () => {
  let processor: PushNotificationProcessor;
  const apnsClientSend = jest.fn();
  const devicesFindUnique = jest.fn();
  const markInactive = jest.fn();
  const queueAdd = jest.fn();

  const baseJobData: SendApnsJobData = {
    silent: false,
    deviceUuid: 'device-uuid-1',
    pushToken: 'a'.repeat(64),
    bundleId: 'com.example.app',
    title: '테스트 알림',
    body: '알림 내용',
  };

  beforeEach(async () => {
    apnsClientSend.mockReset();
    devicesFindUnique.mockReset();
    markInactive.mockReset();
    queueAdd.mockReset();

    // default: device is active
    devicesFindUnique.mockResolvedValue({ isActive: true });
    // default: APNs send succeeds
    apnsClientSend.mockResolvedValue({ sent: [{}], failed: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationProcessor,
        {
          provide: PrismaService,
          useValue: {
            devices: { findUnique: devicesFindUnique },
            $queryRaw: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ApnsProvider,
          useValue: {
            client: { send: apnsClientSend },
          },
        },
        {
          provide: DeviceService,
          useValue: { markInactive },
        },
        {
          provide: getQueueToken(PUSH_NOTIFICATION_QUEUE),
          useValue: { add: queueAdd, addBulk: jest.fn() },
        },
        {
          provide: apnsConfig.KEY,
          useValue: {
            keyId: 'KEY_ID',
            teamId: 'TEAM_ID',
            key: 'KEY',
            bundleId: 'com.example.app',
            production: false,
            reminderLeadMinutes: 1,
          },
        },
      ],
    }).compile();

    // suppress logger output during tests
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    processor = module.get(PushNotificationProcessor);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('handleSendApns via process()', () => {
    it('APNs client가 null이면 전송 건너뜀 — send 호출 없음', async () => {
      // ApnsProvider.client = null 으로 교체
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          PushNotificationProcessor,
          {
            provide: PrismaService,
            useValue: {
              devices: { findUnique: devicesFindUnique },
              $queryRaw: jest.fn().mockResolvedValue([]),
            },
          },
          {
            provide: ApnsProvider,
            useValue: { client: null },
          },
          {
            provide: DeviceService,
            useValue: { markInactive },
          },
          {
            provide: getQueueToken(PUSH_NOTIFICATION_QUEUE),
            useValue: { add: queueAdd, addBulk: jest.fn() },
          },
          {
            provide: apnsConfig.KEY,
            useValue: {
              keyId: '',
              teamId: '',
              key: '',
              bundleId: '',
              production: false,
              reminderLeadMinutes: 1,
            },
          },
        ],
      }).compile();

      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const proc2 = module2.get(PushNotificationProcessor);

      await proc2.process(makeJob(baseJobData));

      expect(apnsClientSend).not.toHaveBeenCalled();
    });

    it('isActive=false 디바이스 — 전송 건너뜀', async () => {
      devicesFindUnique.mockResolvedValue({ isActive: false });

      await processor.process(makeJob(baseJobData));

      expect(apnsClientSend).not.toHaveBeenCalled();
    });

    it('디바이스가 DB에 없을 때(null) — 전송 건너뜀', async () => {
      devicesFindUnique.mockResolvedValue(null);

      await processor.process(makeJob(baseJobData));

      expect(apnsClientSend).not.toHaveBeenCalled();
    });

    it('silent push — contentAvailable=1, priority=5 (compiled payload 검증)', async () => {
      const silentData: SendApnsJobData = {
        silent: true,
        deviceUuid: 'device-uuid-1',
        pushToken: 'a'.repeat(64),
        bundleId: 'com.example.app',
      };

      await processor.process(makeJob(silentData));

      expect(apnsClientSend).toHaveBeenCalledTimes(1);
      const [notification] = apnsClientSend.mock.calls[0] as [
        { priority: number; compile: () => string },
      ];
      // priority는 getter로 직접 읽을 수 있음
      expect(notification.priority).toBe(5);
      // contentAvailable은 apn.Notification 내부 aps 객체에 저장됨 — compile()로 확인
      const payload = JSON.parse(notification.compile()) as {
        aps: { 'content-available'?: number; alert?: unknown };
      };
      expect(payload.aps['content-available']).toBe(1);
      expect(payload.aps.alert).toBeUndefined();
    });

    it('non-silent push — alert 설정, priority=10 (compiled payload 검증)', async () => {
      await processor.process(makeJob(baseJobData));

      expect(apnsClientSend).toHaveBeenCalledTimes(1);
      const [notification] = apnsClientSend.mock.calls[0] as [
        { priority: number; compile: () => string },
      ];
      expect(notification.priority).toBe(10);
      // alert은 apn.Notification 내부 aps 객체에 저장됨 — compile()로 확인
      const payload = JSON.parse(notification.compile()) as {
        aps: { alert?: { title: string; body: string } };
      };
      expect(payload.aps.alert).toEqual({
        title: '테스트 알림',
        body: '알림 내용',
      });
    });

    it('APNs Unregistered 오류 — markInactive 호출, throw 없음', async () => {
      apnsClientSend.mockResolvedValue({
        sent: [],
        failed: [{ response: { reason: 'Unregistered' } }],
      });

      await expect(
        processor.process(makeJob(baseJobData)),
      ).resolves.toBeUndefined();
      expect(markInactive).toHaveBeenCalledWith('device-uuid-1');
    });

    it('APNs BadDeviceToken 오류 — markInactive 호출, throw 없음', async () => {
      apnsClientSend.mockResolvedValue({
        sent: [],
        failed: [{ response: { reason: 'BadDeviceToken' } }],
      });

      await expect(
        processor.process(makeJob(baseJobData)),
      ).resolves.toBeUndefined();
      expect(markInactive).toHaveBeenCalledWith('device-uuid-1');
    });

    it('APNs PayloadTooLarge 오류 — logger.error 호출, throw 없음 (재시도 없음)', async () => {
      const loggerError = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      apnsClientSend.mockResolvedValue({
        sent: [],
        failed: [{ response: { reason: 'PayloadTooLarge' } }],
      });

      await expect(
        processor.process(makeJob(baseJobData)),
      ).resolves.toBeUndefined();
      expect(markInactive).not.toHaveBeenCalled();
      expect(loggerError).toHaveBeenCalled();
    });

    it('일시 오류(ServiceUnavailable) — Error throw (BullMQ 재시도 트리거)', async () => {
      apnsClientSend.mockResolvedValue({
        sent: [],
        failed: [{ response: { reason: 'ServiceUnavailable' } }],
      });

      await expect(processor.process(makeJob(baseJobData))).rejects.toThrow(
        /APNs transient error/,
      );
    });

    it('deviceUuid=direct인 경우 디바이스 조회 및 markInactive 건너뜀', async () => {
      const directData: SendApnsJobData = {
        silent: false,
        deviceUuid: 'direct',
        pushToken: 'a'.repeat(64),
        bundleId: 'com.example.app',
        title: '직접 전송',
        body: '내용',
      };
      apnsClientSend.mockResolvedValue({
        sent: [],
        failed: [{ response: { reason: 'Unregistered' } }],
      });

      await processor.process(makeJob(directData));

      expect(devicesFindUnique).not.toHaveBeenCalled();
      expect(markInactive).not.toHaveBeenCalled();
    });
  });

  describe('handleCheckTaskReminders via process()', () => {
    let reminderProcessor: PushNotificationProcessor;
    const queryRaw = jest.fn();
    const devicesFindMany = jest.fn();

    let capturedBulkJobs: BulkJob[] = [];
    const addBulk = jest.fn((jobs: BulkJob[]) => {
      capturedBulkJobs = jobs;
      return Promise.resolve([]);
    });

    beforeEach(async () => {
      queryRaw.mockReset();
      devicesFindMany.mockReset();
      addBulk.mockReset();
      capturedBulkJobs = [];

      addBulk.mockImplementation((jobs: BulkJob[]) => {
        capturedBulkJobs = jobs;
        return Promise.resolve([]);
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PushNotificationProcessor,
          {
            provide: PrismaService,
            useValue: {
              devices: {
                findUnique: jest.fn(),
                findMany: devicesFindMany,
              },
              $queryRaw: queryRaw,
            },
          },
          {
            provide: ApnsProvider,
            useValue: { client: { send: jest.fn() } },
          },
          {
            provide: DeviceService,
            useValue: { markInactive: jest.fn() },
          },
          {
            provide: getQueueToken(PUSH_NOTIFICATION_QUEUE),
            useValue: { add: jest.fn(), addBulk },
          },
          {
            provide: apnsConfig.KEY,
            useValue: {
              keyId: 'KEY_ID',
              teamId: 'TEAM_ID',
              key: 'KEY',
              bundleId: 'com.example.app',
              production: false,
              reminderLeadMinutes: 5,
            },
          },
        ],
      }).compile();

      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

      reminderProcessor = module.get(PushNotificationProcessor);
    });

    it('$queryRaw 결과 빈 배열 → addBulk 호출 없음', async () => {
      queryRaw.mockResolvedValue([]);

      await reminderProcessor.process(makeReminderJob());

      expect(addBulk).not.toHaveBeenCalled();
    });

    it('rows 1건 + 해당 유저 디바이스 2개 → addBulk에 2개 job 전달, job data 확인', async () => {
      queryRaw.mockResolvedValue([
        {
          task_uuid: 'task-uuid-abc',
          task_title: '미팅 준비',
          user_uuid: 'user-uuid-xyz',
        },
      ]);
      devicesFindMany.mockResolvedValue([
        { uuid: 'dev-1', userUuid: 'user-uuid-xyz', pushToken: 'token-111' },
        { uuid: 'dev-2', userUuid: 'user-uuid-xyz', pushToken: 'token-222' },
      ]);

      await reminderProcessor.process(makeReminderJob());

      expect(addBulk).toHaveBeenCalledTimes(1);
      expect(capturedBulkJobs).toHaveLength(2);

      const firstJob = capturedBulkJobs[0];
      expect(firstJob.name).toBe(PushNotificationJob.SendApns);

      const data = firstJob.data as SendApnsJobData;
      expect(data.silent).toBe(false);
      if (!data.silent) {
        expect(data.title).toBe('미팅 준비');
        expect(data.body).toBe('지금 시작할 시간이에요');
      }
      expect(data.payload).toMatchObject({
        type: 'task-reminder',
        taskUuid: 'task-uuid-abc',
      });
    });

    it('$queryRaw 타임존 오류(22023) → warn 후 throw 없음', async () => {
      const loggerWarn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const tzError = Object.assign(new Error('invalid timezone'), {
        code: '22023',
      });
      queryRaw.mockRejectedValue(tzError);

      await expect(
        reminderProcessor.process(makeReminderJob()),
      ).resolves.toBeUndefined();

      expect(addBulk).not.toHaveBeenCalled();
      expect(loggerWarn).toHaveBeenCalled();
    });

    it('$queryRaw DB 연결 오류 → re-throw (BullMQ 재시도 트리거)', async () => {
      const dbError = new Error('DB connection failed');
      queryRaw.mockRejectedValue(dbError);

      await expect(
        reminderProcessor.process(makeReminderJob()),
      ).rejects.toThrow('DB connection failed');

      expect(addBulk).not.toHaveBeenCalled();
    });
  });
});
