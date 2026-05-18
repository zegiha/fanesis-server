import { mapEventToTaskFields } from './google-sync.service';

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
