import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import googleCalendarConfig from '@/core/config/google-calendar.config';
import { EncryptionService } from '@/core/encryption/encryption.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { CalendarSyncedCalendars } from '@/generated/prisma/client';
import { AvailableCalendarDto } from './dto/available-calendar.dto';
import {
  CalendarIntegrationNotFoundException,
  CalendarNotSubscribedException,
} from './calendar-link.exceptions';
import { GoogleCalendarApiService } from './google/google-calendar-api.service';
import { GoogleOauthService } from './google/google-oauth.service';
import {
  CALENDAR_LINK_QUEUE,
  CalendarLinkJob,
  IncrementalSyncJobData,
} from './queue/queue.constants';

@Injectable()
export class CalendarLinkService {
  private readonly logger = new Logger(CalendarLinkService.name);

  constructor(
    @Inject(googleCalendarConfig.KEY)
    private readonly cfg: ConfigType<typeof googleCalendarConfig>,
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly oauth: GoogleOauthService,
    private readonly api: GoogleCalendarApiService,
    @InjectQueue(CALENDAR_LINK_QUEUE) private readonly queue: Queue,
  ) {}

  buildAuthorizeUrl(userUuid: string): string {
    return this.oauth.buildAuthorizeUrl(userUuid);
  }

  /**
   * Handle the OAuth callback: verify state, exchange code, persist integration.
   * Returns the deep link the browser should be redirected to.
   */
  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    error: string | undefined,
  ): Promise<string> {
    if (error || !code || !state) {
      return this.cfg.mobileFailureDeepLink;
    }
    try {
      const { userUuid } = this.oauth.verifyState(state);
      const tokens = await this.oauth.exchangeCode(code);
      const userInfo = await this.oauth.fetchUserInfo(tokens.accessToken);

      await this.prisma.calendarIntegrations.upsert({
        where: {
          userUuid_provider_providerAccountId: {
            userUuid,
            provider: 'google',
            providerAccountId: userInfo.sub,
          },
        },
        create: {
          userUuid,
          provider: 'google',
          providerAccountId: userInfo.sub,
          providerEmail: userInfo.email,
          accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.encryption.encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
        },
        update: {
          providerEmail: userInfo.email,
          accessTokenEncrypted: this.encryption.encrypt(tokens.accessToken),
          refreshTokenEncrypted: this.encryption.encrypt(tokens.refreshToken),
          tokenExpiresAt: tokens.expiresAt,
          isActive: true,
        },
      });

      return this.cfg.mobileSuccessDeepLink;
    } catch (err) {
      this.logger.warn(`OAuth callback failed: ${(err as Error).message}`);
      return this.cfg.mobileFailureDeepLink;
    }
  }

  async listAvailableCalendars(
    userUuid: string,
  ): Promise<AvailableCalendarDto[]> {
    const integration = await this.requireIntegration(userUuid);
    const items = await this.api.listCalendarList(integration);

    const subscribed = await this.prisma.calendarSyncedCalendars.findMany({
      where: { integrationUuid: integration.uuid, isActive: true },
      select: { externalCalendarId: true },
    });
    const subscribedIds = new Set(subscribed.map((s) => s.externalCalendarId));

    return items
      .filter((c) => c.id)
      .map((c) => ({
        externalCalendarId: c.id!,
        summary: c.summaryOverride ?? c.summary ?? c.id!,
        isPrimary: !!c.primary,
        isSubscribed: subscribedIds.has(c.id!),
      }));
  }

  async subscribeCalendars(
    userUuid: string,
    externalCalendarIds: string[],
  ): Promise<CalendarSyncedCalendars[]> {
    this.logger.log(
      `subscribe: user=${userUuid} calendars=[${externalCalendarIds.join(',')}]`,
    );
    const integration = await this.requireIntegration(userUuid);
    const results: CalendarSyncedCalendars[] = [];

    for (const externalCalendarId of externalCalendarIds) {
      const sc = await this.prisma.calendarSyncedCalendars.upsert({
        where: {
          integrationUuid_externalCalendarId: {
            integrationUuid: integration.uuid,
            externalCalendarId,
          },
        },
        create: {
          integrationUuid: integration.uuid,
          externalCalendarId,
          isActive: true,
        },
        update: { isActive: true },
      });

      // Initial / re-sync first (queues full re-sync), then watch.
      const initialJob = await this.queue.add(
        CalendarLinkJob.IncrementalSync,
        {
          syncedCalendarUuid: sc.uuid,
          fullResync: true,
        } satisfies IncrementalSyncJobData,
        {
          jobId: `sync-${sc.uuid}-initial`,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      this.logger.log(
        `subscribed ${externalCalendarId} (sc=${sc.uuid}, initialJob=${String(initialJob.id)})`,
      );

      try {
        await this.registerWatch(sc.uuid);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(
          `watch register failed for ${sc.uuid}: ${msg}`,
          e instanceof Error ? e.stack : undefined,
        );
      }
      results.push(sc);
    }
    return results;
  }

  async unsubscribeCalendar(
    userUuid: string,
    syncedCalendarUuid: string,
  ): Promise<void> {
    const sc = await this.prisma.calendarSyncedCalendars.findUnique({
      where: { uuid: syncedCalendarUuid },
      include: { integration: true },
    });
    if (!sc || sc.integration.userUuid !== userUuid) {
      throw new CalendarNotSubscribedException();
    }
    if (sc.webhookChannelId && sc.webhookResourceId) {
      await this.api.stopChannel(
        sc.integration,
        sc.webhookChannelId,
        sc.webhookResourceId,
      );
    }
    await this.prisma.calendarSyncedCalendars.update({
      where: { uuid: sc.uuid },
      data: {
        isActive: false,
        webhookChannelId: null,
        webhookResourceId: null,
        webhookExpiresAt: null,
      },
    });
  }

  async disconnect(userUuid: string): Promise<void> {
    const integration = await this.prisma.calendarIntegrations.findFirst({
      where: { userUuid, provider: 'google', isActive: true },
      include: { syncedCalendars: true },
    });
    if (!integration) {
      throw new CalendarIntegrationNotFoundException();
    }
    for (const sc of integration.syncedCalendars) {
      if (sc.webhookChannelId && sc.webhookResourceId) {
        await this.api.stopChannel(
          integration,
          sc.webhookChannelId,
          sc.webhookResourceId,
        );
      }
    }
    await this.prisma.calendarIntegrations.delete({
      where: { uuid: integration.uuid },
    });
  }

  /** Register / renew a watch channel for a synced calendar. */
  async registerWatch(syncedCalendarUuid: string): Promise<void> {
    const sc = await this.prisma.calendarSyncedCalendars.findUnique({
      where: { uuid: syncedCalendarUuid },
      include: { integration: true },
    });
    if (!sc || !sc.isActive) {
      this.logger.warn(
        `registerWatch skipped: ${syncedCalendarUuid} not found / inactive`,
      );
      return;
    }

    const channelId = randomUUID();
    const { resourceId, expiration } = await this.api.watchEvents(
      sc.integration,
      sc.externalCalendarId,
      channelId,
      sc.uuid,
    );
    this.logger.log(
      `watch registered: sc=${sc.uuid} channel=${channelId} expires=${expiration.toISOString()}`,
    );

    const previousChannelId = sc.webhookChannelId;
    const previousResourceId = sc.webhookResourceId;

    await this.prisma.calendarSyncedCalendars.update({
      where: { uuid: sc.uuid },
      data: {
        webhookChannelId: channelId,
        webhookResourceId: resourceId,
        webhookExpiresAt: expiration,
      },
    });

    if (previousChannelId && previousResourceId) {
      await this.api.stopChannel(
        sc.integration,
        previousChannelId,
        previousResourceId,
      );
    }
  }

  private async requireIntegration(userUuid: string) {
    const integration = await this.prisma.calendarIntegrations.findFirst({
      where: { userUuid, provider: 'google', isActive: true },
    });
    if (!integration) {
      throw new CalendarIntegrationNotFoundException();
    }
    return integration;
  }
}
