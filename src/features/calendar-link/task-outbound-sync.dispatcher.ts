import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  TASK_UPDATED_EVENT,
  type TaskUpdatedEvent,
} from '@/domain/task/task.events';
import {
  CALENDAR_LINK_QUEUE,
  CalendarLinkJob,
  PatchEventJobData,
} from './queue/queue.constants';

/**
 * Listens for task.updated events emitted by the task domain and, when conditions
 * are met, enqueues a patch-event job so Google Calendar gets the time change.
 *
 * Conditions (from plan):
 *  - task.affiliation === 'google'
 *  - task_external_links exists (i.e. originated from Google sync)
 *  - at least one of scheduled_date / start_time / duration_sec changed
 *
 * Fanesis-native tasks never have an external link, so they are naturally filtered out
 * and never get pushed to Google.
 */
@Injectable()
export class TaskOutboundSyncDispatcher {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CALENDAR_LINK_QUEUE) private readonly queue: Queue,
  ) {}

  @OnEvent(TASK_UPDATED_EVENT, { async: true })
  async handle(event: TaskUpdatedEvent): Promise<void> {
    const { before, after } = event;
    if (after.affiliation !== 'google') return;
    if (!timeFieldsChanged(before, after)) return;
    const link = await this.prisma.taskExternalLinks.findUnique({
      where: { taskUuid: after.uuid },
      select: { taskUuid: true },
    });
    if (!link) return;

    await this.queue.add(
      CalendarLinkJob.PatchEvent,
      { taskUuid: after.uuid } satisfies PatchEventJobData,
      {
        jobId: `patch-${after.uuid}-${after.updatedAt.getTime()}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }
}

function timeFieldsChanged(
  a: Pick<
    TaskUpdatedEvent['after'],
    'scheduledDate' | 'startTime' | 'durationSec'
  >,
  b: Pick<
    TaskUpdatedEvent['after'],
    'scheduledDate' | 'startTime' | 'durationSec'
  >,
): boolean {
  return (
    !sameNullableDate(a.scheduledDate, b.scheduledDate) ||
    !sameNullableDate(a.startTime, b.startTime) ||
    a.durationSec !== b.durationSec
  );
}

function sameNullableDate(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.getTime() === b.getTime();
}
