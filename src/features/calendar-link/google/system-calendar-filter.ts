const CONTACTS_CALENDAR_ID = 'addressbook#contacts@group.v.calendar.google.com';
const HOLIDAY_SUFFIX = '#holiday@group.v.calendar.google.com';

export function isSystemCalendarId(calendarId: string): boolean {
  if (calendarId === CONTACTS_CALENDAR_ID) return true;
  if (calendarId.endsWith(HOLIDAY_SUFFIX)) return true;
  return false;
}
