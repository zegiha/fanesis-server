import { Inject, Logger } from '@nestjs/common';
import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import * as apn from '@parse/node-apn';
import apnsConfig from '@/core/config/apns.config';
import { PrismaService } from '@/core/prisma/prisma.service';
import { DeviceService } from '@/domain/device/device.service';
import { ApnsProvider } from '../apns.provider';
import {
  PUSH_NOTIFICATION_QUEUE,
  PushNotificationJob,
  SendApnsJobData,
} from './queue.constants';

const PERMANENT_TOKEN_ERRORS = new Set([
  'Unregistered',
  'BadDeviceToken',
  'DeviceTokenNotForTopic',
]);
const PERMANENT_OTHER_ERRORS = new Set([
  'PayloadTooLarge',
  'TopicDisallowed',
  'BadExpirationDate',
]);

type ReminderRow = { task_uuid: string; task_title: string; user_uuid: string };

function maskToken(token: string): string {
  return `****${token.slice(-8)}`;
}

@Processor(PUSH_NOTIFICATION_QUEUE, { concurrency: 1 })
export class PushNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(PushNotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apns: ApnsProvider,
    private readonly deviceService: DeviceService,
    @InjectQueue(PUSH_NOTIFICATION_QUEUE) private readonly queue: Queue,
    @Inject(apnsConfig.KEY) private readonly cfg: ConfigType<typeof apnsConfig>,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.add(
        PushNotificationJob.CheckTaskReminders,
        {},
        {
          jobId: 'check-task-reminders-cron',
          repeat: { pattern: '* * * * *' },
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.log('task-reminder cron job registered');
    } catch (err) {
      this.logger.warn(
        'task-reminder cron 등록 실패 — Redis 미가용일 수 있음',
        err,
      );
    }
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PushNotificationJob.SendApns:
        return this.handleSendApns(job.data as SendApnsJobData);
      case PushNotificationJob.CheckTaskReminders:
        return this.handleCheckTaskReminders();
      default:
        this.logger.warn(`unknown job type: ${job.name}`);
    }
  }

  private async handleSendApns(data: SendApnsJobData): Promise<void> {
    if (!this.apns.client) {
      this.logger.warn('APNs client 없음 — push 전송 건너뜀');
      return;
    }

    if (data.deviceUuid !== 'direct') {
      const device = await this.prisma.devices.findUnique({
        where: { uuid: data.deviceUuid },
        select: { isActive: true },
      });
      if (!device?.isActive) return;
    }

    const notification = new apn.Notification();
    notification.topic = data.bundleId;

    if (data.silent) {
      notification.contentAvailable = true;
      (notification as apn.Notification & { pushType: string }).pushType =
        'background';
      notification.priority = 5;
      notification.expiry = 0;
    } else {
      notification.alert = { title: data.title, body: data.body };
      notification.sound = 'default';
      (notification as apn.Notification & { pushType: string }).pushType =
        'alert';
      notification.priority = 10;
      notification.expiry = Math.floor(Date.now() / 1000) + 3600;
    }

    if (data.payload) {
      // `aps`는 APNs 예약 키 — 덮어쓰면 알림 동작이 망가지므로 제외
      const safePayload = Object.fromEntries(
        Object.entries(data.payload).filter(([k]) => k !== 'aps'),
      );
      Object.assign(notification.payload, safePayload);
    }

    const result = await this.apns.client.send(notification, data.pushToken);

    if (result.failed.length > 0) {
      const reason = result.failed[0]?.response?.reason ?? '';

      if (PERMANENT_TOKEN_ERRORS.has(reason)) {
        this.logger.warn(
          `APNs permanent token error (${reason}) device=${data.deviceUuid} token=${maskToken(data.pushToken)}`,
        );
        if (data.deviceUuid !== 'direct') {
          await this.deviceService.markInactive(data.deviceUuid);
        }
        return;
      }

      if (PERMANENT_OTHER_ERRORS.has(reason)) {
        this.logger.error(
          `APNs permanent error (${reason}) token=${maskToken(data.pushToken)}`,
        );
        return;
      }

      throw new Error(`APNs transient error: ${reason || 'unknown'}`);
    }
  }

  private async handleCheckTaskReminders(): Promise<void> {
    // $queryRaw는 타임존 문자열 오류(AT TIME ZONE)만 catch — DB 연결 실패 등은 throw해서 BullMQ 재시도
    let rows: ReminderRow[];
    try {
      rows = await this.prisma.$queryRaw<ReminderRow[]>`
        SELECT t.uuid        AS task_uuid,
               t.title       AS task_title,
               t.user_uuid
        FROM   tasks t
        JOIN   users u ON u.uuid = t.user_uuid
        WHERE  t.start_time    IS NOT NULL
          AND  t.scheduled_date IS NOT NULL
          AND  t.done_date      IS NULL
          AND  (t.scheduled_date::timestamp + t.start_time::time)
                 AT TIME ZONE u.timezone
                 >= date_trunc('minute', NOW())
                    + (${this.cfg.reminderLeadMinutes} * INTERVAL '1 minute')
          AND  (t.scheduled_date::timestamp + t.start_time::time)
                 AT TIME ZONE u.timezone
                 <  date_trunc('minute', NOW())
                    + ((${this.cfg.reminderLeadMinutes} + 1) * INTERVAL '1 minute')
      `;
    } catch (err) {
      // invalid_parameter_value (22023) = 잘못된 타임존 문자열 → warn 후 skip
      // 그 외 DB 오류는 re-throw해서 BullMQ가 재시도하게 함
      const code = (err as { code?: string }).code;
      if (code === '22023') {
        this.logger.warn('task reminder 쿼리 실패: 잘못된 타임존', err);
        return;
      }
      throw err;
    }

    if (rows.length === 0) return;

    const userUuids = [...new Set(rows.map((r) => r.user_uuid))];
    const allDevices = await this.prisma.devices.findMany({
      where: { userUuid: { in: userUuids }, isActive: true },
      select: { uuid: true, userUuid: true, pushToken: true },
    });

    const deviceMap = new Map<
      string,
      Array<{ uuid: string; pushToken: string }>
    >();
    for (const d of allDevices) {
      const list = deviceMap.get(d.userUuid) ?? [];
      list.push({ uuid: d.uuid, pushToken: d.pushToken });
      deviceMap.set(d.userUuid, list);
    }

    const jobs: Parameters<Queue['addBulk']>[0] = [];
    for (const row of rows) {
      const devices = deviceMap.get(row.user_uuid) ?? [];
      for (const { uuid: deviceUuid, pushToken } of devices) {
        const data: SendApnsJobData = {
          silent: false,
          deviceUuid,
          pushToken,
          bundleId: this.cfg.bundleId,
          title: row.task_title,
          body: '지금 시작할 시간이에요',
          payload: { taskUuid: row.task_uuid, type: 'task-reminder' },
        };
        jobs.push({
          name: PushNotificationJob.SendApns,
          data,
          opts: {
            attempts: 3,
            backoff: { type: 'exponential' as const, delay: 1000 },
          },
        });
      }
    }

    if (jobs.length > 0) {
      await this.queue.addBulk(jobs);
      this.logger.log(
        `task reminders: ${rows.length} tasks → ${jobs.length} push jobs enqueued`,
      );
    }
  }

  @OnWorkerEvent('ready')
  onReady(): void {
    this.logger.log('PushNotificationProcessor worker ready');
  }

  @OnWorkerEvent('active')
  onActive(job: Job): void {
    this.logger.debug(`job active: ${job.name} [${job.id}]`);
  }

  @OnWorkerEvent('completed')
  onDone(job: Job): void {
    this.logger.debug(`job completed: ${job.name} [${job.id}]`);
  }

  @OnWorkerEvent('failed')
  onFail(job: Job, err: Error): void {
    this.logger.error(`job failed: ${job.name} [${job.id}] — ${err.message}`);
  }

  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.error(`worker error: ${err.message}`);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`job stalled: ${jobId}`);
  }
}
