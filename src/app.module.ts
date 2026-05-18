import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './core/auth/auth.module';
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
import { FolderModule } from './domain/folder/folder.module';
import { TaskModule } from './domain/task/task.module';
import { CalendarLinkModule } from './features/calendar-link/calendar-link.module';

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
    FolderModule,
    TaskModule,
    CalendarLinkModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
