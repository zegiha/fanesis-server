import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import apnsConfig from '@/core/config/apns.config';
import { DeviceService } from '@/domain/device/device.service';
import { ApnsProvider } from './apns.provider';
import {
  PUSH_NOTIFICATION_QUEUE,
  PushNotificationJob,
  SendApnsJobData,
} from './queue/queue.constants';
import {
  PushNotificationService,
  PushOptions,
} from './push-notification.service';

type BulkJob = Parameters<Queue['addBulk']>[0][number];

describe('PushNotificationService (unit)', () => {
  let service: PushNotificationService;

  const findActiveByUser = jest.fn<
    ReturnType<DeviceService['findActiveByUser']>,
    Parameters<DeviceService['findActiveByUser']>
  >();

  let capturedBulkJobs: BulkJob[] = [];
  let capturedAddName: string = '';
  let capturedAddData: SendApnsJobData | null = null;

  const queueAddBulk = jest.fn((jobs: BulkJob[]) => {
    capturedBulkJobs = jobs;
    return Promise.resolve([]);
  });
  const queueAdd = jest.fn((name: string, data: SendApnsJobData) => {
    capturedAddName = name;
    capturedAddData = data;
    return Promise.resolve(null);
  });

  beforeEach(async () => {
    findActiveByUser.mockReset();
    queueAddBulk.mockReset();
    queueAdd.mockReset();
    capturedBulkJobs = [];
    capturedAddName = '';
    capturedAddData = null;

    queueAddBulk.mockImplementation((jobs: BulkJob[]) => {
      capturedBulkJobs = jobs;
      return Promise.resolve([]);
    });
    queueAdd.mockImplementation((name: string, data: SendApnsJobData) => {
      capturedAddName = name;
      capturedAddData = data;
      return Promise.resolve(null);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: DeviceService,
          useValue: { findActiveByUser },
        },
        {
          provide: ApnsProvider,
          useValue: { client: { send: jest.fn() } },
        },
        {
          provide: getQueueToken(PUSH_NOTIFICATION_QUEUE),
          useValue: { add: queueAdd, addBulk: queueAddBulk },
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

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    service = module.get(PushNotificationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('sendToUser', () => {
    it('활성 디바이스 2개 → addBulk 1회 호출, 반환값 2', async () => {
      findActiveByUser.mockResolvedValue([
        { uuid: 'device-1', pushToken: 'token-aaa' },
        { uuid: 'device-2', pushToken: 'token-bbb' },
      ]);

      const options: PushOptions = {
        silent: false,
        title: '제목',
        body: '내용',
      };
      const result = await service.sendToUser('user-uuid-1', options);

      expect(result).toBe(2);
      expect(queueAddBulk).toHaveBeenCalledTimes(1);
      expect(capturedBulkJobs).toHaveLength(2);
    });

    it('활성 디바이스 0개 → addBulk 호출 없음, 반환값 0', async () => {
      findActiveByUser.mockResolvedValue([]);

      const options: PushOptions = {
        silent: false,
        title: '제목',
        body: '내용',
      };
      const result = await service.sendToUser('user-uuid-2', options);

      expect(result).toBe(0);
      expect(queueAddBulk).not.toHaveBeenCalled();
    });

    it('silent=false → job data에 silent:false, title, body 포함', async () => {
      findActiveByUser.mockResolvedValue([
        { uuid: 'device-1', pushToken: 'token-aaa' },
      ]);

      const options: PushOptions = {
        silent: false,
        title: '알림 제목',
        body: '알림 본문',
        payload: { type: 'task-reminder' },
      };
      await service.sendToUser('user-uuid-3', options);

      expect(capturedBulkJobs).toHaveLength(1);
      const job = capturedBulkJobs[0];
      expect(job.name).toBe(PushNotificationJob.SendApns);
      const data = job.data as SendApnsJobData;
      expect(data.silent).toBe(false);
      if (!data.silent) {
        expect(data.title).toBe('알림 제목');
        expect(data.body).toBe('알림 본문');
      }
    });

    it('silent=true → job data에 silent:true, title/body 없음', async () => {
      findActiveByUser.mockResolvedValue([
        { uuid: 'device-1', pushToken: 'token-aaa' },
      ]);

      const options: PushOptions = {
        silent: true,
        payload: { type: 'background-sync' },
      };
      await service.sendToUser('user-uuid-4', options);

      expect(capturedBulkJobs).toHaveLength(1);
      const data = capturedBulkJobs[0].data as SendApnsJobData;
      expect(data.silent).toBe(true);
      expect(data).not.toHaveProperty('title');
      expect(data).not.toHaveProperty('body');
    });
  });

  describe('sendToToken', () => {
    it('queue.add 1회 호출, deviceUuid="direct"으로 job 생성', async () => {
      const options: PushOptions = {
        silent: false,
        title: '직접 전송',
        body: '내용',
      };
      await service.sendToToken('direct-token-xyz', options);

      expect(queueAdd).toHaveBeenCalledTimes(1);
      expect(capturedAddName).toBe(PushNotificationJob.SendApns);
      expect(capturedAddData).not.toBeNull();
      expect(capturedAddData?.deviceUuid).toBe('direct');
      expect(capturedAddData?.pushToken).toBe('direct-token-xyz');
    });
  });
});
