import {
  InjectQueue,
  OnWorkerEvent,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Tasks } from '@/generated/prisma/client';
import { GoogleCalendarApiService } from '../google/google-calendar-api.service';
import { GoogleSyncService } from '../google/google-sync.service';
// CalendarLinkService is forward-referenced lazily to avoid circular DI
// (CalendarLinkService → queue, processor → CalendarLinkService for registerWatch).
import { CalendarLinkService } from '../calendar-link.service';
import {
  CALENDAR_LINK_QUEUE,
  CalendarLinkJob,
  IncrementalSyncJobData,
  PatchEventJobData,
} from './queue.constants';

const RENEWAL_LEEWAY_MS = 24 * 60 * 60 * 1000;

/**
 * Single processor for the calendar-link queue.
 *
 * IMPORTANT: All job kinds for this queue MUST be dispatched from here.
 * Do NOT add a second `@Processor(CALENDAR_LINK_QUEUE)` class — `@nestjs/bullmq`
 * creates one Worker per processor class, and multiple Workers on the same queue
 * compete for jobs. A Worker that picks up a job whose `name` doesn't match its
 * filter would silently `return` and the job would be marked completed without
 * doing any work (BullMQ has no concept of "wrong worker, please re-queue").
 */
@Processor(CALENDAR_LINK_QUEUE)
export class CalendarLinkProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(CalendarLinkProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: GoogleCalendarApiService,
    private readonly sync: GoogleSyncService,
    private readonly calendarLink: CalendarLinkService,
    @InjectQueue(CALENDAR_LINK_QUEUE) private readonly queue: Queue,
  ) {
    super();
    this.logger.log(`instantiated (pid ${process.pid})`);
  }

  async onModuleInit(): Promise<void> {
    // Register the repeatable hourly channel-renewal job.
    await this.queue.add(
      CalendarLinkJob.ChannelRenewal,
      {},
      {
        jobId: 'channel-renewal-cron',
        repeat: { pattern: '0 * * * *' },
        removeOnComplete: true,
      },
    );
  }

  async process(job: Job): Promise<void> {
    this.logger.debug(`process ${job.name} ${String(job.id)}`);
    switch (job.name) {
      case CalendarLinkJob.IncrementalSync:
        return this.handleIncrementalSync(job.data as IncrementalSyncJobData);
      case CalendarLinkJob.PatchEvent:
        return this.handlePatchEvent(job.data as PatchEventJobData);
      case CalendarLinkJob.ChannelRenewal:
        return this.handleChannelRenewal();
      default:
        this.logger.warn(`unknown job name: ${job.name}`);
    }
  }

  // -- sync -----------------------------------------------------------------

  private async handleIncrementalSync(
    data: IncrementalSyncJobData,
  ): Promise<void> {
    try {
      await this.sync.sync(data.syncedCalendarUuid, data.fullResync ?? false);
    } catch (err) {
      this.logger.error(
        `sync failed for ${data.syncedCalendarUuid}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  // -- outbound patch -------------------------------------------------------

  private async handlePatchEvent(data: PatchEventJobData): Promise<void> {
    const { taskUuid } = data;
    const link = await this.prisma.taskExternalLinks.findUnique({
      where: { taskUuid },
      include: {
        task: true,
        syncedCalendar: { include: { integration: true } },
      },
    });
    if (!link || !link.syncedCalendar.isActive) {
      this.logger.warn(`patch skipped: link missing/inactive (${taskUuid})`);
      return;
    }
    const task = link.task;
    if (task.affiliation !== 'google') {
      this.logger.warn(
        `patch skipped: task affiliation != google (${taskUuid})`,
      );
      return;
    }
    const startEnd = buildStartEnd(task);
    if (!startEnd) {
      this.logger.warn(`patch skipped: task ${taskUuid} has no scheduledDate`);
      return;
    }
    const updated = await this.api.patchEventTimes(
      link.syncedCalendar.integration,
      link.syncedCalendar.externalCalendarId,
      link.externalEventId,
      startEnd.start,
      startEnd.end,
    );
    await this.prisma.taskExternalLinks.update({
      where: { taskUuid },
      data: { externalEtag: updated.etag ?? null, lastSyncedAt: new Date() },
    });
  }

  // -- channel renewal ------------------------------------------------------

  private async handleChannelRenewal(): Promise<void> {
    const threshold = new Date(Date.now() + RENEWAL_LEEWAY_MS);
    const due = await this.prisma.calendarSyncedCalendars.findMany({
      where: {
        isActive: true,
        webhookChannelId: { not: null },
        webhookExpiresAt: { lt: threshold },
      },
      select: { uuid: true },
    });
    for (const sc of due) {
      try {
        await this.calendarLink.registerWatch(sc.uuid);
      } catch (err) {
        this.logger.warn(
          `channel renewal failed for ${sc.uuid}: ${(err as Error).message}`,
        );
      }
    }
  }

  // -- worker lifecycle hooks ----------------------------------------------

  @OnWorkerEvent('ready') onReady() {
    this.logger.log(`worker ready (pid ${process.pid})`);
  }
  @OnWorkerEvent('active') onActive(job: Job) {
    this.logger.debug(`active ${job.name} ${String(job.id)}`);
  }
  @OnWorkerEvent('completed') onDone(job: Job) {
    this.logger.debug(`completed ${job.name} ${String(job.id)}`);
  }
  @OnWorkerEvent('failed') onFail(job: Job, err: Error) {
    this.logger.error(
      `failed ${job?.name} ${String(job?.id)}: ${err.message}`,
      err.stack,
    );
  }
  @OnWorkerEvent('error') onError(err: Error) {
    this.logger.error(`worker error: ${err.message}`, err.stack);
  }
  @OnWorkerEvent('stalled') onStalled(jobId: string) {
    this.logger.error(`stalled ${jobId}`);
  }
}

// -- pure helpers (moved from push-event-update.processor) -----------------

function buildStartEnd(
  task: Pick<Tasks, 'scheduledDate' | 'startTime' | 'durationSec'>,
): {
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
} | null {
  if (!task.scheduledDate) return null;
  if (!task.startTime) {
    const startStr = formatDateOnly(task.scheduledDate);
    const endStr = formatDateOnly(addDays(task.scheduledDate, 1));
    return { start: { date: startStr }, end: { date: endStr } };
  }
  const startMs = Date.UTC(
    task.scheduledDate.getUTCFullYear(),
    task.scheduledDate.getUTCMonth(),
    task.scheduledDate.getUTCDate(),
    task.startTime.getUTCHours(),
    task.startTime.getUTCMinutes(),
    task.startTime.getUTCSeconds(),
  );
  const endMs = startMs + (task.durationSec ?? 0) * 1000;
  return {
    start: { dateTime: new Date(startMs).toISOString() },
    end: { dateTime: new Date(endMs).toISOString() },
  };
}

function addDays(d: Date, n: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n),
  );
}

function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
