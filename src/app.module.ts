import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './core/auth/auth.module';
import apnsConfig from './core/config/apns.config';
import appConfig from './core/config/app.config';
import databaseConfig from './core/config/database.config';
import googleConfig from './core/config/google.config';
import googleCalendarConfig from './core/config/google-calendar.config';
import jwtConfig from './core/config/jwt.config';
import { validate } from './core/config/env.validation';
import { EncryptionModule } from './core/encryption/encryption.module';
import { PrismaModule } from './core/prisma/prisma.module';
import { QueueModule } from './core/queue/queue.module';
import { RedisModule } from './core/redis/redis.module';
import { DeviceModule } from './domain/device/device.module';
import { FolderModule } from './domain/folder/folder.module';
import { TaskModule } from './domain/task/task.module';
import { CalendarLinkModule } from './features/calendar-link/calendar-link.module';
import { PushNotificationModule } from './features/push-notification/push-notification.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env.${process.env.NODE_ENV ?? 'development'}`,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        googleConfig,
        googleCalendarConfig,
        apnsConfig,
      ],
      validate,
      cache: true,
    }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    EncryptionModule,
    RedisModule,
    QueueModule,
    AuthModule,
    DeviceModule,
    FolderModule,
    TaskModule,
    CalendarLinkModule,
    PushNotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
