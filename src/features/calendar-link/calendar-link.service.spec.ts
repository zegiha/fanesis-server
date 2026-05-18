import type { Queue } from 'bullmq';
import { EncryptionService } from '@/core/encryption/encryption.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { CalendarLinkService } from './calendar-link.service';
import { GoogleCalendarApiService } from './google/google-calendar-api.service';
import { GoogleOauthService } from './google/google-oauth.service';

const cfg = {
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://example.com/cb',
  webhookBaseUrl: '',
  mobileSuccessDeepLink: '',
  mobileFailureDeepLink: '',
};

describe('CalendarLinkService.listAvailableCalendars (unit)', () => {
  const findFirst = jest.fn();
  const findMany = jest.fn();
  const listCalendarList = jest.fn();
  const prisma = {
    calendarIntegrations: { findFirst },
    calendarSyncedCalendars: { findMany },
  } as unknown as PrismaService;
  const api = { listCalendarList } as unknown as GoogleCalendarApiService;
  const encryption = {} as unknown as EncryptionService;
  const oauth = {} as unknown as GoogleOauthService;
  const queue = { add: jest.fn() } as unknown as Queue;
  const svc = new CalendarLinkService(
    cfg,
    prisma,
    encryption,
    oauth,
    api,
    queue,
  );

  beforeEach(() => {
    findFirst.mockReset();
    findMany.mockReset();
    listCalendarList.mockReset();
  });

  it('excludes system calendars (contacts birthdays, holiday calendars in any language)', async () => {
    findFirst.mockResolvedValue({ uuid: 'i1', userUuid: 'u1' });
    findMany.mockResolvedValue([]);
    listCalendarList.mockResolvedValue([
      { id: 'primary', summary: 'Me', primary: true },
      {
        id: 'addressbook#contacts@group.v.calendar.google.com',
        summary: 'Birthdays',
      },
      {
        id: 'ko.south_korea#holiday@group.v.calendar.google.com',
        summary: '대한민국의 휴일',
      },
      {
        id: 'en.usa#holiday@group.v.calendar.google.com',
        summary: 'US Holidays',
      },
      { id: 'team@group.calendar.google.com', summary: 'Team' },
    ]);

    const out = await svc.listAvailableCalendars('u1');

    expect(out.map((c) => c.externalCalendarId)).toEqual([
      'primary',
      'team@group.calendar.google.com',
    ]);
  });

  it('marks already-subscribed calendars with isSubscribed=true', async () => {
    findFirst.mockResolvedValue({ uuid: 'i1', userUuid: 'u1' });
    findMany.mockResolvedValue([{ externalCalendarId: 'primary' }]);
    listCalendarList.mockResolvedValue([
      { id: 'primary', summary: 'Me', primary: true },
      { id: 'other@group.calendar.google.com', summary: 'Other' },
    ]);

    const out = await svc.listAvailableCalendars('u1');

    expect(
      out.find((c) => c.externalCalendarId === 'primary')!.isSubscribed,
    ).toBe(true);
    expect(
      out.find(
        (c) => c.externalCalendarId === 'other@group.calendar.google.com',
      )!.isSubscribed,
    ).toBe(false);
  });
});
