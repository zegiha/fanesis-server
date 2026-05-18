import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { calendar_v3 } from 'googleapis';
import { PrismaService } from '@/core/prisma/prisma.service';
import { CalendarSyncedCalendars } from '@/generated/prisma/client';
import { GoogleCalendarApiService } from './google-calendar-api.service';
import {
  CALENDAR_LINK_QUEUE,
  CalendarLinkJob,
  IncrementalSyncJobData,
} from '../queue/queue.constants';

/**
 * Maps Google Calendar events ↔ Fanesis tasks. Handles initial + incremental sync,
 * upsert / delete, and feedback-loop suppression (no-op update when values already match).
 */
@Injectable()
export class GoogleSyncService {
  private readonly logger = new Logger(GoogleSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly api: GoogleCalendarApiService,
    @InjectQueue(CALENDAR_LINK_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Sync a single calendar. If syncToken is null → full list. Persists new syncToken.
   * If Google reports 410 (token expired) → schedules a full re-sync job and returns.
   */
  async sync(syncedCalendarUuid: string, fullResync = false): Promise<void> {
    const sc = await this.prisma.calendarSyncedCalendars.findUnique({
      where: { uuid: syncedCalendarUuid },
      include: { integration: true },
    });
    if (!sc || !sc.isActive) {
      this.logger.warn(
        `sync skipped: ${syncedCalendarUuid} not found / inactive`,
      );
      return;
    }

    const startToken = fullResync ? null : sc.syncToken;
    const { events, nextSyncToken, expiredSyncToken } =
      await this.api.listEvents(
        sc.integration,
        sc.externalCalendarId,
        startToken,
      );

    this.logger.log(
      `sync ${sc.uuid}: fetched ${events.length} event(s), ` +
        `nextSyncToken=${nextSyncToken ? 'set' : 'null'}, expired=${expiredSyncToken}`,
    );
    if (expiredSyncToken) {
      this.logger.log(`syncToken expired for ${sc.uuid}; queueing full resync`);
      await this.prisma.calendarSyncedCalendars.update({
        where: { uuid: sc.uuid },
        data: { syncToken: null },
      });
      await this.queue.add(
        CalendarLinkJob.IncrementalSync,
        {
          syncedCalendarUuid: sc.uuid,
          fullResync: true,
        } satisfies IncrementalSyncJobData,
        {
          jobId: `sync-${sc.uuid}-full`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return;
    }

    for (const event of events) {
      await this.applyEvent(sc, event);
    }

    if (nextSyncToken) {
      await this.prisma.calendarSyncedCalendars.update({
        where: { uuid: sc.uuid },
        data: { syncToken: nextSyncToken, lastSyncedAt: new Date() },
      });
    } else {
      await this.prisma.calendarSyncedCalendars.update({
        where: { uuid: sc.uuid },
        data: { lastSyncedAt: new Date() },
      });
    }
  }

  /** Apply a single Google event: upsert task + external link, or delete on cancel. */
  private async applyEvent(
    sc: CalendarSyncedCalendars & { integration: { userUuid: string } },
    event: calendar_v3.Schema$Event,
  ): Promise<void> {
    if (!event.id) return;

    if (event.status === 'cancelled') {
      const link = await this.prisma.taskExternalLinks.findUnique({
        where: {
          syncedCalendarUuid_externalEventId: {
            syncedCalendarUuid: sc.uuid,
            externalEventId: event.id,
          },
        },
      });
      if (link) {
        await this.prisma.tasks.delete({ where: { uuid: link.taskUuid } });
      }
      return;
    }

    const mapped = mapEventToTaskFields(event);
    if (!mapped) return;

    const link = await this.prisma.taskExternalLinks.findUnique({
      where: {
        syncedCalendarUuid_externalEventId: {
          syncedCalendarUuid: sc.uuid,
          externalEventId: event.id,
        },
      },
      include: { task: true },
    });

    if (!link) {
      // Create new task + link.
      await this.prisma.$transaction(async (tx) => {
        const task = await tx.tasks.create({
          data: {
            userUuid: sc.integration.userUuid,
            title: mapped.title,
            affiliation: 'google',
            backlogKind: 'inbox',
            activeKind: 'todo',
            timeboxKind: mapped.startTime ? 'timeline' : null,
            scheduledDate: mapped.scheduledDate,
            startTime: mapped.startTime,
            durationSec: mapped.durationSec,
          },
        });
        await tx.taskExternalLinks.create({
          data: {
            taskUuid: task.uuid,
            syncedCalendarUuid: sc.uuid,
            externalEventId: event.id!,
            externalEtag: event.etag ?? null,
          },
        });
      });
      return;
    }

    // Existing link → check whether anything changed before updating.
    const t = link.task;
    const same =
      t.title === mapped.title &&
      sameDate(t.scheduledDate, mapped.scheduledDate) &&
      sameTime(t.startTime, mapped.startTime) &&
      t.durationSec === mapped.durationSec;

    if (same) {
      // Feedback-loop suppression: nothing to do.
      // We still bump the link's etag/last_synced_at to keep state fresh.
      if (link.externalEtag !== event.etag) {
        await this.prisma.taskExternalLinks.update({
          where: { taskUuid: link.taskUuid },
          data: {
            externalEtag: event.etag ?? null,
            lastSyncedAt: new Date(),
          },
        });
      }
      return;
    }

    await this.prisma.$transaction([
      this.prisma.tasks.update({
        where: { uuid: link.taskUuid },
        data: {
          title: mapped.title,
          scheduledDate: mapped.scheduledDate,
          startTime: mapped.startTime,
          durationSec: mapped.durationSec,
          timeboxKind: mapped.startTime ? 'timeline' : null,
        },
      }),
      this.prisma.taskExternalLinks.update({
        where: { taskUuid: link.taskUuid },
        data: {
          externalEtag: event.etag ?? null,
          lastSyncedAt: new Date(),
        },
      }),
    ]);
  }
}

// -- pure mapping helpers (exported for tests) --

export interface MappedTaskFields {
  title: string;
  scheduledDate: Date | null;
  startTime: Date | null;
  durationSec: number | null;
}

export function mapEventToTaskFields(
  event: calendar_v3.Schema$Event,
): MappedTaskFields | null {
  const title = event.summary?.trim() || '(제목 없음)';
  const start = event.start;
  const end = event.end;
  if (!start) return null;

  // All-day event: start.date is a YYYY-MM-DD string.
  if (start.date) {
    return {
      title,
      scheduledDate: parseDateOnly(start.date),
      startTime: null,
      durationSec: null,
    };
  }

  // Timed event: start.dateTime is RFC3339 with offset.
  if (start.dateTime) {
    const startMs = Date.parse(start.dateTime);
    if (Number.isNaN(startMs)) return null;
    const startDate = new Date(startMs);
    const scheduledDate = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth(),
        startDate.getUTCDate(),
      ),
    );
    const startTime = new Date(
      Date.UTC(
        1970,
        0,
        1,
        startDate.getUTCHours(),
        startDate.getUTCMinutes(),
        startDate.getUTCSeconds(),
      ),
    );
    let durationSec: number | null = null;
    if (end?.dateTime) {
      const endMs = Date.parse(end.dateTime);
      if (!Number.isNaN(endMs) && endMs > startMs) {
        durationSec = Math.floor((endMs - startMs) / 1000);
      }
    }
    return { title, scheduledDate, startTime, durationSec };
  }

  return null;
}

function parseDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}

function sameTime(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.getUTCHours() === b.getUTCHours() &&
    a.getUTCMinutes() === b.getUTCMinutes() &&
    a.getUTCSeconds() === b.getUTCSeconds()
  );
}
