import { isSystemCalendarId } from './system-calendar-filter';

describe('isSystemCalendarId (unit)', () => {
  it.each([
    ['addressbook#contacts@group.v.calendar.google.com', true],
    ['ko.south_korea#holiday@group.v.calendar.google.com', true],
    ['en.usa#holiday@group.v.calendar.google.com', true],
    ['ja.japanese#holiday@group.v.calendar.google.com', true],
    ['primary', false],
    ['user@example.com', false],
    ['random-id@group.calendar.google.com', false],
    // 방어: 'holiday' 부분 문자열만 포함하면 안 됨 (접미사 매칭이어야)
    ['my#holidays@group.calendar.google.com', false],
    ['holiday@example.com', false],
  ])('id=%s → %s', (id, expected) => {
    expect(isSystemCalendarId(id)).toBe(expected);
  });
});
