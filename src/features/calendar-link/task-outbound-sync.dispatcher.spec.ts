import type { Queue } from 'bullmq';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Tasks } from '@/generated/prisma/client';
import { TaskOutboundSyncDispatcher } from './task-outbound-sync.dispatcher';

function makeTask(over: Partial<Tasks> = {}): Tasks {
  return {
    uuid: 't1',
    userUuid: 'u1',
    title: 't',
    priority: null,
    affiliation: 'google',
    backlogKind: 'inbox',
    backlogFolderId: null,
    activeKind: 'todo',
    timeboxKind: 'timeline',
    scheduledDate: new Date('2026-05-18T00:00:00Z'),
    startTime: new Date('1970-01-01T01:00:00Z'),
    durationSec: 3600,
    chunkSec: null,
    breakSec: null,
    doneDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('TaskOutboundSyncDispatcher (unit)', () => {
  const findUnique = jest.fn();
  const queueAdd = jest.fn();
  const prisma = {
    taskExternalLinks: { findUnique },
  } as unknown as PrismaService;
  const queue = { add: queueAdd } as unknown as Queue;
  const dispatcher = new TaskOutboundSyncDispatcher(prisma, queue);

  beforeEach(() => {
    findUnique.mockReset();
    queueAdd.mockReset();
  });

  it('does not enqueue when affiliation is not google', async () => {
    const before = makeTask({ affiliation: null });
    const after = makeTask({ affiliation: null, durationSec: 7200 });
    await dispatcher.handle({ before, after });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('does not enqueue when no time field changed', async () => {
    const t = makeTask();
    await dispatcher.handle({ before: t, after: t });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('does not enqueue when there is no external link (fanesis-native task)', async () => {
    const before = makeTask();
    const after = makeTask({ durationSec: 7200 });
    findUnique.mockResolvedValue(null);
    await dispatcher.handle({ before, after });
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('enqueues patch-event job when time changed AND link exists', async () => {
    const before = makeTask();
    const after = makeTask({ durationSec: 7200 });
    findUnique.mockResolvedValue({ taskUuid: 't1' });
    await dispatcher.handle({ before, after });
    expect(queueAdd).toHaveBeenCalledWith(
      'patch-event',
      { taskUuid: 't1' },
      expect.objectContaining({ attempts: 5 }),
    );
  });
});
