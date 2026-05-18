import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from '@/core/auth/auth.module';
import googleCalendarConfig from '@/core/config/google-calendar.config';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { CalendarLinkController } from './calendar-link.controller';
import { CalendarLinkService } from './calendar-link.service';
import { GoogleWebhookController } from './google-webhook.controller';
import { GoogleCalendarApiService } from './google/google-calendar-api.service';
import { GoogleOauthService } from './google/google-oauth.service';
import { GoogleSyncService } from './google/google-sync.service';
import { CalendarLinkProcessor } from './queue/calendar-link.processor';
import { CALENDAR_LINK_QUEUE } from './queue/queue.constants';
import { TaskOutboundSyncDispatcher } from './task-outbound-sync.dispatcher';

@Module({
  imports: [
    ConfigModule.forFeature(googleCalendarConfig),
    PrismaModule,
    AuthModule,
    JwtModule.register({}),
    BullModule.registerQueue({ name: CALENDAR_LINK_QUEUE }),
  ],
  controllers: [CalendarLinkController, GoogleWebhookController],
  providers: [
    CalendarLinkService,
    GoogleOauthService,
    GoogleCalendarApiService,
    GoogleSyncService,
    CalendarLinkProcessor,
    TaskOutboundSyncDispatcher,
  ],
  exports: [TaskOutboundSyncDispatcher, BullModule],
})
export class CalendarLinkModule {}
