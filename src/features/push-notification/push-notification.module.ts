import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import apnsConfig from '@/core/config/apns.config';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { DeviceModule } from '@/domain/device/device.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { ApnsProvider } from './apns.provider';
import { PushNotificationController } from './push-notification.controller';
import { PushNotificationService } from './push-notification.service';
import { PushNotificationProcessor } from './queue/push-notification.processor';
import { PUSH_NOTIFICATION_QUEUE } from './queue/queue.constants';

@Module({
  imports: [
    ConfigModule.forFeature(apnsConfig),
    PrismaModule,
    AuthModule,
    DeviceModule,
    TermsModule,
    BullModule.registerQueue({
      name: PUSH_NOTIFICATION_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  controllers: [PushNotificationController],
  providers: [PushNotificationService, PushNotificationProcessor, ApnsProvider],
  exports: [PushNotificationService],
})
export class PushNotificationModule {}
