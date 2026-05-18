import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  CALENDAR_LINK_QUEUE,
  CalendarLinkJob,
  IncrementalSyncJobData,
} from './queue/queue.constants';

/**
 * Google Calendar push notification endpoint.
 * Google posts here with headers describing the channel; we look up the synced calendar
 * and enqueue an incremental sync, then return 200 ASAP (Google retries on slow responses).
 */
@ApiExcludeController()
@Controller('calendar-link/google')
export class GoogleWebhookController {
  private readonly logger = new Logger(GoogleWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CALENDAR_LINK_QUEUE) private readonly queue: Queue,
  ) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Headers('x-goog-channel-id') channelId: string | undefined,
    @Headers('x-goog-resource-state') resourceState: string | undefined,
    @Headers('x-goog-channel-token') token: string | undefined,
  ): Promise<void> {
    if (!channelId) return;
    // The 'sync' state fires once when the channel is created; nothing to do.
    if (resourceState === 'sync') return;

    const sc = await this.prisma.calendarSyncedCalendars.findUnique({
      where: { webhookChannelId: channelId },
    });
    if (!sc || !sc.isActive) {
      this.logger.warn(`webhook for unknown/inactive channel ${channelId}`);
      return;
    }
    // Defense in depth: token should equal the synced_calendar uuid we set in events.watch.
    if (token && token !== sc.uuid) {
      this.logger.warn(`webhook token mismatch for ${channelId}`);
      return;
    }

    await this.queue.add(
      CalendarLinkJob.IncrementalSync,
      { syncedCalendarUuid: sc.uuid } satisfies IncrementalSyncJobData,
      // dedupe: collapse rapid bursts into a single sync per calendar
      { jobId: `sync-${sc.uuid}`, removeOnComplete: true, removeOnFail: true },
    );
  }
}
