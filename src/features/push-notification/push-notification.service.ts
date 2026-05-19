import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import type { Queue } from 'bullmq';
import apnsConfig from '@/core/config/apns.config';
import { DeviceService } from '@/domain/device/device.service';
import { ApnsProvider } from './apns.provider';
import {
  PUSH_NOTIFICATION_QUEUE,
  PushNotificationJob,
  SendApnsJobData,
} from './queue/queue.constants';

export type PushOptions =
  | {
      silent: false;
      title: string;
      body: string;
      payload?: Record<string, unknown>;
    }
  | { silent: true; payload?: Record<string, unknown> };

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly deviceService: DeviceService,
    private readonly apns: ApnsProvider,
    @InjectQueue(PUSH_NOTIFICATION_QUEUE) private readonly queue: Queue,
    @Inject(apnsConfig.KEY) private readonly cfg: ConfigType<typeof apnsConfig>,
  ) {}

  async sendToUser(userUuid: string, options: PushOptions): Promise<number> {
    const devices = await this.deviceService.findActiveByUser(userUuid);
    if (devices.length === 0) return 0;

    const jobs = devices.map(({ uuid: deviceUuid, pushToken }) => ({
      name: PushNotificationJob.SendApns,
      data: this.buildJobData(deviceUuid, pushToken, options),
      opts: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 1000 },
      },
    }));

    await this.queue.addBulk(jobs);
    this.logger.log(
      `sendToUser: ${jobs.length} jobs enqueued for user ${userUuid}`,
    );
    return jobs.length;
  }

  async sendToToken(pushToken: string, options: PushOptions): Promise<void> {
    const data: SendApnsJobData = this.buildJobData(
      'direct',
      pushToken,
      options,
    );
    await this.queue.add(PushNotificationJob.SendApns, data, {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 1000 },
    });
  }

  private buildJobData(
    deviceUuid: string,
    pushToken: string,
    options: PushOptions,
  ): SendApnsJobData {
    const base = { deviceUuid, pushToken, bundleId: this.cfg.bundleId };
    if (options.silent) {
      return { ...base, silent: true, payload: options.payload };
    }
    return {
      ...base,
      silent: false,
      title: options.title,
      body: options.body,
      payload: options.payload,
    };
  }
}
