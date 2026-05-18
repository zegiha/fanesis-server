import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { calendar_v3, google } from 'googleapis';
import googleCalendarConfig from '@/core/config/google-calendar.config';
import { EncryptionService } from '@/core/encryption/encryption.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { CalendarIntegrations } from '@/generated/prisma/client';
import { CalendarGoogleApiException } from '../calendar-link.exceptions';
import { GoogleOauthService } from './google-oauth.service';

const TOKEN_REFRESH_LEEWAY_MS = 60_000;
// Google channel max ttl = 30 days; we request 7 days to keep renewal cadence comfortable.
const CHANNEL_TTL_SECONDS = 7 * 24 * 60 * 60;

@Injectable()
export class GoogleCalendarApiService {
  private readonly logger = new Logger(GoogleCalendarApiService.name);

  constructor(
    @Inject(googleCalendarConfig.KEY)
    private readonly cfg: ConfigType<typeof googleCalendarConfig>,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly oauth: GoogleOauthService,
  ) {}

  async listCalendarList(
    integration: CalendarIntegrations,
  ): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    const client = await this.calendarClient(integration);
    try {
      const res = await client.calendarList.list({ maxResults: 250 });
      return res.data.items ?? [];
    } catch (err) {
      throw this.wrap(err, 'calendarList.list');
    }
  }

  /**
   * Page through events. If `syncToken` provided, uses incremental sync.
   * If `syncToken` is null/undefined, does a full list (you must persist the final `nextSyncToken`).
   *
   * Returns events and the new sync token (only set on the last page).
   */
  async listEvents(
    integration: CalendarIntegrations,
    externalCalendarId: string,
    syncToken: string | null,
  ): Promise<{
    events: calendar_v3.Schema$Event[];
    nextSyncToken: string | null;
    expiredSyncToken: boolean;
  }> {
    const client = await this.calendarClient(integration);
    const all: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    try {
      do {
        const res = await client.events.list({
          calendarId: externalCalendarId,
          maxResults: 250,
          singleEvents: true,
          showDeleted: !!syncToken, // incremental sync must show deletes
          pageToken,
          syncToken: syncToken ?? undefined,
        });
        for (const ev of res.data.items ?? []) all.push(ev);
        pageToken = res.data.nextPageToken ?? undefined;
        nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      return { events: all, nextSyncToken, expiredSyncToken: false };
    } catch (err) {
      if (this.isSyncTokenExpired(err)) {
        return { events: [], nextSyncToken: null, expiredSyncToken: true };
      }
      throw this.wrap(err, 'events.list');
    }
  }

  /**
   * Patch only `start` and `end` of an event. Preserves all other fields
   * (summary, attendees, organizer, description, etc.) on Google's side.
   */
  async patchEventTimes(
    integration: CalendarIntegrations,
    externalCalendarId: string,
    externalEventId: string,
    start: calendar_v3.Schema$EventDateTime,
    end: calendar_v3.Schema$EventDateTime,
  ): Promise<calendar_v3.Schema$Event> {
    const client = await this.calendarClient(integration);
    try {
      const res = await client.events.patch({
        calendarId: externalCalendarId,
        eventId: externalEventId,
        requestBody: { start, end },
      });
      return res.data;
    } catch (err) {
      throw this.wrap(err, 'events.patch');
    }
  }

  async watchEvents(
    integration: CalendarIntegrations,
    externalCalendarId: string,
    channelId: string,
    token: string,
  ): Promise<{ resourceId: string; expiration: Date }> {
    const client = await this.calendarClient(integration);
    const address = `${this.cfg.webhookBaseUrl}/calendar-link/google/webhook`;
    try {
      const res = await client.events.watch({
        calendarId: externalCalendarId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address,
          token,
          params: { ttl: String(CHANNEL_TTL_SECONDS) },
        },
      });
      const resourceId = res.data.resourceId;
      const expirationMs = res.data.expiration
        ? Number(res.data.expiration)
        : Date.now() + CHANNEL_TTL_SECONDS * 1000;
      if (!resourceId) {
        throw new CalendarGoogleApiException(
          'events.watch did not return resourceId',
        );
      }
      return { resourceId, expiration: new Date(expirationMs) };
    } catch (err) {
      throw this.wrap(err, 'events.watch');
    }
  }

  async stopChannel(
    integration: CalendarIntegrations,
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    const client = await this.calendarClient(integration);
    try {
      await client.channels.stop({
        requestBody: { id: channelId, resourceId },
      });
    } catch (err) {
      // Stop는 best-effort. Google이 만료시킬 것이므로 로깅만.
      this.logger.warn(
        `channels.stop failed (${channelId}): ${(err as Error).message}`,
      );
    }
  }

  // -- internals --

  private async calendarClient(
    integration: CalendarIntegrations,
  ): Promise<calendar_v3.Calendar> {
    const client = await this.makeAuthorizedClient(integration);
    return google.calendar({ version: 'v3', auth: client });
  }

  private async makeAuthorizedClient(
    integration: CalendarIntegrations,
  ): Promise<OAuth2Client> {
    const refreshToken = this.encryption.decrypt(
      integration.refreshTokenEncrypted,
    );
    let accessToken = this.encryption.decrypt(integration.accessTokenEncrypted);
    let expiresAt = integration.tokenExpiresAt;

    if (expiresAt.getTime() - Date.now() < TOKEN_REFRESH_LEEWAY_MS) {
      const refreshed = await this.oauth.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      await this.prisma.calendarIntegrations.update({
        where: { uuid: integration.uuid },
        data: {
          accessTokenEncrypted: this.encryption.encrypt(accessToken),
          tokenExpiresAt: expiresAt,
        },
      });
    }

    const client = new OAuth2Client({
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      redirectUri: this.cfg.redirectUri,
    });
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiresAt.getTime(),
    });
    return client;
  }

  private isSyncTokenExpired(err: unknown): boolean {
    const code =
      (err as { code?: number; status?: number }).code ??
      (err as { status?: number }).status;
    return code === 410;
  }

  private wrap(err: unknown, op: string): CalendarGoogleApiException {
    this.logger.warn(`Google ${op} error: ${(err as Error).message}`);
    return new CalendarGoogleApiException(`Google ${op} error`);
  }
}
