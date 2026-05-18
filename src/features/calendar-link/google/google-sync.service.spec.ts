import type { Queue } from 'bullmq';
import { PrismaService } from '@/core/prisma/prisma.service';
import {
  GoogleSyncService,
  LOOKAHEAD_DAYS,
  LOOKBACK_DAYS,
  mapEventToTaskFields,
} from './google-sync.service';
import { GoogleCalendarApiService } from './google-calendar-api.service';

describe('mapEventToTaskFields (unit)', () => {
  it('maps a timed event to scheduledDate + startTime + durationSec', () => {
    const out = mapEventToTaskFields({
      id: 'e1',
      summary: '회의',
      start: { dateTime: '2026-05-18T10:00:00+09:00' },
      end: { dateTime: '2026-05-18T11:30:00+09:00' },
    });
    expect(out).not.toBeNull();
    // 10:00 KST = 01:00 UTC
    expect(out!.scheduledDate?.toISOString().slice(0, 10)).toBe('2026-05-18');
    expect(out!.startTime?.getUTCHours()).toBe(1);
    expect(out!.startTime?.getUTCMinutes()).toBe(0);
    expect(out!.durationSec).toBe(90 * 60);
    expect(out!.title).toBe('회의');
  });

  it('maps an all-day event: scheduledDate only, no startTime/durationSec', () => {
    const out = mapEventToTaskFields({
      id: 'e2',
      summary: '휴가',
      start: { date: '2026-05-20' },
      end: { date: '2026-05-21' },
    });
    expect(out).not.toBeNull();
    expect(out!.scheduledDate?.toISOString().slice(0, 10)).toBe('2026-05-20');
    expect(out!.startTime).toBeNull();
    expect(out!.durationSec).toBeNull();
  });

  it('falls back to "(제목 없음)" when summary is missing', () => {
    const out = mapEventToTaskFields({
      id: 'e3',
      start: { date: '2026-05-22' },
    });
    expect(out!.title).toBe('(제목 없음)');
  });

  it('returns null when start is absent', () => {
    expect(mapEventToTaskFields({ id: 'e4', summary: 'x' })).toBeNull();
  });
});

describe('GoogleSyncService.sync — time window forwarded to listEvents (unit)', () => {
  it('forwards a (now - LOOKBACK_DAYS, now + LOOKAHEAD_DAYS) window to listEvents on full resync', async () => {
    const listEvents = jest.fn().mockResolvedValue({
      events: [],
      nextSyncToken: 'tok',
      expiredSyncToken: false,
    });
    const update = jest.fn();
    const findUnique = jest.fn().mockResolvedValue({
      uuid: 'sc1',
      isActive: true,
      externalCalendarId: 'primary',
      syncToken: null,
      integration: { uuid: 'i1', userUuid: 'u1' },
    });
    const prisma = {
      calendarSyncedCalendars: { findUnique, update },
    } as unknown as PrismaService;
    const api = { listEvents } as unknown as GoogleCalendarApiService;
    const queue = { add: jest.fn() } as unknown as Queue;
    const svc = new GoogleSyncService(prisma, api, queue);

    const before = Date.now();
    await svc.sync('sc1', true);
    const after = Date.now();

    expect(listEvents).toHaveBeenCalledTimes(1);
    const calls = listEvents.mock.calls as unknown as unknown[][];
    const opts = calls[0][3] as { timeMin: Date; timeMax: Date };
    const dayMs = 24 * 60 * 60 * 1000;
    expect(opts.timeMin.getTime()).toBeGreaterThanOrEqual(
      before - LOOKBACK_DAYS * dayMs,
    );
    expect(opts.timeMin.getTime()).toBeLessThanOrEqual(
      after - LOOKBACK_DAYS * dayMs,
    );
    expect(opts.timeMax.getTime()).toBeGreaterThanOrEqual(
      before + LOOKAHEAD_DAYS * dayMs,
    );
    expect(opts.timeMax.getTime()).toBeLessThanOrEqual(
      after + LOOKAHEAD_DAYS * dayMs,
    );
    // 윈도우 크기 자체도 검증
    const windowMs = opts.timeMax.getTime() - opts.timeMin.getTime();
    expect(windowMs).toBe((LOOKBACK_DAYS + LOOKAHEAD_DAYS) * dayMs);
  });
});
