import { GoogleCalendarApiService } from './google-calendar-api.service';
import type { CalendarIntegrations } from '@/generated/prisma/client';

const listMock = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    calendar: () => ({
      events: { list: listMock },
    }),
  },
}));

function getCall(idx: number): Record<string, unknown> {
  const calls = listMock.mock.calls as unknown as unknown[][];
  return calls[idx][0] as Record<string, unknown>;
}

const cfg = {
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://example.com/cb',
  webhookBaseUrl: 'https://example.com',
  mobileSuccessDeepLink: '',
  mobileFailureDeepLink: '',
};

function makeIntegration(): CalendarIntegrations {
  return {
    uuid: 'i1',
    userUuid: 'u1',
    provider: 'google',
    providerAccountId: 'g1',
    providerEmail: 'u1@example.com',
    accessTokenEncrypted: 'enc-access',
    refreshTokenEncrypted: 'enc-refresh',
    // 충분히 미래로 둬서 refresh 분기를 회피.
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    syncToken: null,
    lastSyncedAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as CalendarIntegrations;
}

function makeService(): GoogleCalendarApiService {
  const prisma = {
    calendarIntegrations: { update: jest.fn() },
  } as never;
  const encryption = {
    decrypt: (v: string) => v.replace(/^enc-/, ''),
    encrypt: (v: string) => `enc-${v}`,
  } as never;
  const oauth = {
    refreshAccessToken: jest.fn(),
  } as never;
  return new GoogleCalendarApiService(cfg, prisma, encryption, oauth);
}

describe('GoogleCalendarApiService.listEvents — filter parameters (unit)', () => {
  beforeEach(() => {
    listMock.mockReset();
  });

  it('full sync (syncToken=null) sends eventTypes + timeMin + timeMax, no syncToken', async () => {
    listMock.mockResolvedValueOnce({
      data: { items: [], nextSyncToken: 'tok1' },
    });
    const svc = makeService();
    const timeMin = new Date('2026-05-11T00:00:00Z');
    const timeMax = new Date('2026-08-16T00:00:00Z');

    await svc.listEvents(makeIntegration(), 'primary', null, {
      timeMin,
      timeMax,
    });

    expect(listMock).toHaveBeenCalledTimes(1);
    const params = getCall(0);
    expect(params).toMatchObject({
      calendarId: 'primary',
      maxResults: 250,
      singleEvents: true,
      showDeleted: false,
      eventTypes: ['default'],
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
    });
    expect(params).not.toHaveProperty('syncToken');
  });

  it('incremental sync (syncToken present) sends eventTypes + syncToken + showDeleted, no timeMin/timeMax', async () => {
    listMock.mockResolvedValueOnce({
      data: { items: [], nextSyncToken: 'tok2' },
    });
    const svc = makeService();

    await svc.listEvents(makeIntegration(), 'primary', 'prev-token', {
      timeMin: new Date('2026-05-11T00:00:00Z'),
      timeMax: new Date('2026-08-16T00:00:00Z'),
    });

    expect(listMock).toHaveBeenCalledTimes(1);
    const params = getCall(0);
    expect(params).toMatchObject({
      calendarId: 'primary',
      eventTypes: ['default'],
      showDeleted: true,
      singleEvents: true,
      syncToken: 'prev-token',
    });
    expect(params).not.toHaveProperty('timeMin');
    expect(params).not.toHaveProperty('timeMax');
  });

  it('returns expiredSyncToken=true when API responds 410', async () => {
    const err: Error & { code?: number } = new Error('Gone');
    err.code = 410;
    listMock.mockRejectedValueOnce(err);
    const svc = makeService();

    const result = await svc.listEvents(
      makeIntegration(),
      'primary',
      'expired',
      {},
    );

    expect(result.expiredSyncToken).toBe(true);
    expect(result.events).toEqual([]);
    expect(result.nextSyncToken).toBeNull();
  });

  it('pages through results preserving eventTypes filter', async () => {
    listMock
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'e1' }],
          nextPageToken: 'p2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'e2' }],
          nextSyncToken: 'tok-final',
        },
      });
    const svc = makeService();

    const result = await svc.listEvents(makeIntegration(), 'primary', null, {
      timeMin: new Date('2026-05-11T00:00:00Z'),
      timeMax: new Date('2026-08-16T00:00:00Z'),
    });

    expect(listMock).toHaveBeenCalledTimes(2);
    expect(getCall(0)).toMatchObject({
      eventTypes: ['default'],
    });
    expect(getCall(1)).toMatchObject({
      eventTypes: ['default'],
      pageToken: 'p2',
    });
    expect(result.events.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(result.nextSyncToken).toBe('tok-final');
  });
});
