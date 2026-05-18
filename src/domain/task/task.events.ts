import { Tasks } from '@/generated/prisma/client';

export const TASK_UPDATED_EVENT = 'task.updated';

export interface TaskUpdatedEvent {
  before: Pick<
    Tasks,
    'scheduledDate' | 'startTime' | 'durationSec' | 'affiliation'
  >;
  after: Tasks;
}
