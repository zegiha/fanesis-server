import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import apnsConfig from '@/core/config/apns.config';
import { googleVisionConfig } from '@/core/config/google-vision.config';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { CanvasModule } from '@/domain/canvas/canvas.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { PushNotificationModule } from '@/features/push-notification/push-notification.module';
import { OcrTriggerController } from './ocr-trigger.controller';
import { OcrService } from './ocr.service';
import { OcrProcessor } from './queue/ocr.processor';
import { OCR_QUEUE } from './queue/ocr.queue.constants';

@Module({
  imports: [
    ConfigModule.forFeature(googleVisionConfig),
    ConfigModule.forFeature(apnsConfig),
    BullModule.registerQueue({
      name: OCR_QUEUE,
      defaultJobOptions: {
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    }),
    PrismaModule,
    CanvasModule,
    TermsModule,
    PushNotificationModule,
  ],
  controllers: [OcrTriggerController],
  providers: [OcrService, OcrProcessor],
})
export class OcrModule {}
