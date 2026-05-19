import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import { Job } from 'bullmq';
import apnsConfig from '@/core/config/apns.config';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import { TaskBacklogKind } from '@/generated/prisma/enums';
import { PushNotificationService } from '@/features/push-notification/push-notification.service';
import { OcrService } from '../ocr.service';
import { OCR_QUEUE, OcrJobPayload } from './ocr.queue.constants';

function timezoneToLanguageHints(timezone: string): string[] {
  if (timezone.startsWith('Asia/Tokyo')) return ['ja'];
  if (
    timezone.startsWith('Asia/Seoul') ||
    timezone.startsWith('Asia/Pyongyang')
  ) {
    return ['ko'];
  }
  if (
    timezone.startsWith('America/') ||
    timezone.startsWith('Europe/') ||
    timezone.startsWith('Australia/') ||
    timezone.startsWith('Pacific/')
  ) {
    return ['en'];
  }
  return ['en'];
}

@Processor(OCR_QUEUE)
export class OcrProcessor extends WorkerHost {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
    private readonly pushService: PushNotificationService,
    @Inject(apnsConfig.KEY)
    private readonly apnsCfg: ConfigType<typeof apnsConfig>,
  ) {
    super();
  }

  async process(job: Job<OcrJobPayload>): Promise<void> {
    const { canvasUuid, ocrKey, ocrImageKey, userId, userTimezone } = job.data;

    console.log(1);

    // 1. Idempotency: 이미 처리된 OCR 키라면 스킵
    const existing = await this.prisma.taskCanvasSources.findUnique({
      where: { sourceKey: ocrKey },
    });
    if (existing) {
      this.logger.log(`OCR job skipped (idempotent): ocrKey=${ocrKey}`);
      return;
    }

    console.log(2);

    // 2. R2에서 이미지 버퍼 가져오기
    const imageBuffer = await this.storageService.getObjectBuffer(ocrImageKey);

    console.log(3);

    // 3. Timezone → language hints 변환
    const hints = timezoneToLanguageHints(userTimezone);

    console.log(4);

    // 4. Google Vision OCR
    const title = await this.ocrService.analyze(imageBuffer, hints);
    console.log('5-1', title);

    if (!title) {
      this.logger.log(`OCR result empty for canvasUuid=${canvasUuid}`);
      await this.notifyOcrResult(userId, canvasUuid, []);
      return;
    }

    console.log('5-2', title);

    // 5. Task + TaskCanvasSource 트랜잭션 생성
    const task = await this.prisma.$transaction(async (tx) => {
      const newTask = await tx.tasks.create({
        data: {
          userUuid: userId,
          title,
          backlogKind: TaskBacklogKind.inbox,
        },
      });

      await tx.taskCanvasSources.create({
        data: {
          taskUuid: newTask.uuid,
          canvasUuid,
          sourceKey: ocrKey,
          ocrText: title,
        },
      });

      return newTask;
    });

    console.log(6);

    // 6. 클라이언트에 OCR 완료 푸시 알림
    await this.notifyOcrResult(userId, canvasUuid, [task.uuid]);
  }

  private async notifyOcrResult(
    userId: string,
    canvasUuid: string,
    taskUuids: string[],
  ): Promise<void> {
    const isProd = process.env.NODE_ENV === 'production';
    const keyId = this.apnsCfg.keyId;

    if (!keyId) {
      if (isProd) {
        throw new Error('APNs keyId is required in production');
      }
      this.logger.warn(
        'APNs not configured — skipping push notification (dev)',
      );
      return;
    }

    await this.pushService.sendToUser(userId, {
      silent: true,
      payload: { event: 'ocr_completed', canvasUuid, taskUuids },
    });
  }
}
