import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Queue } from 'bullmq';
import { ApiErrorResponse } from '@/common/decorators/api-error-response.decorator';
import { ErrorCode } from '@/common/exceptions/error-codes';
import { CurrentUser } from '@/core/auth/decorators/current-user.decorator';
import type { CurrentUserType } from '@/core/auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/core/auth/guards/jwt-auth.guard';
import { PrismaService } from '@/core/prisma/prisma.service';
import { StorageService } from '@/core/storage/storage.service';
import { CanvasService } from '@/domain/canvas/canvas.service';
import { ConfirmOcrDto } from '@/domain/canvas/dto/request/confirm-ocr.dto';
import {
  OcrImageEmptyException,
  OcrImageInvalidTypeException,
  OcrImageTooLargeException,
} from './exceptions/ocr.exceptions';
import { OCR_QUEUE, OcrJob, OcrJobPayload } from './queue/ocr.queue.constants';

const MAX_OCR_IMAGE_BYTES = 20 * 1024 * 1024;

@ApiTags('canvas')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('canvases')
export class OcrTriggerController {
  constructor(
    private readonly canvasService: CanvasService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    @InjectQueue(OCR_QUEUE) private readonly ocrQueue: Queue,
  ) {}

  @Post(':uuid/ocr')
  @HttpCode(202)
  @ApiOperation({ summary: 'Canvas OCR 처리 트리거 (비동기)' })
  @ApiParam({ name: 'uuid', description: 'Canvas UUID', format: 'uuid' })
  @ApiResponse({
    status: 202,
    description: 'OCR 작업이 큐에 추가됨',
    schema: { example: { message: 'OCR 처리가 시작되었습니다' } },
  })
  @ApiErrorResponse({
    status: 422,
    errorCode: ErrorCode.OCR_IMAGE_INVALID_TYPE,
    description: 'OCR 이미지 Content-Type이 image/* 가 아님',
  })
  @ApiErrorResponse({
    status: 422,
    errorCode: ErrorCode.OCR_IMAGE_EMPTY,
    description: 'OCR 이미지 파일이 비어 있음',
  })
  @ApiErrorResponse({
    status: 422,
    errorCode: ErrorCode.OCR_IMAGE_TOO_LARGE,
    description: 'OCR 이미지가 20 MB 제한 초과',
  })
  async triggerOcr(
    @Param('uuid', ParseUUIDPipe) uuid: string,
    @Body() dto: ConfirmOcrDto,
    @CurrentUser() user: CurrentUserType,
  ): Promise<{ message: string }> {
    // 1. canvas 소유권 확인
    await this.canvasService.findByUuidAndUser(uuid, user.uuid);

    const ocrImageKey = `ocr/${uuid}/${dto.ocrKey}.jpg`;

    // 2. R2 이미지 헤더 검증
    const head = await this.storageService.headObject(ocrImageKey);

    if (!head.contentType.startsWith('image/')) {
      throw new OcrImageInvalidTypeException();
    }
    if (head.contentLength === 0) {
      throw new OcrImageEmptyException();
    }
    if (head.contentLength > MAX_OCR_IMAGE_BYTES) {
      throw new OcrImageTooLargeException();
    }

    // 3. 유저 timezone 조회
    const userRecord = await this.prisma.users.findUnique({
      where: { uuid: user.uuid },
      select: { timezone: true },
    });
    const userTimezone = userRecord?.timezone ?? 'Asia/Seoul';

    // 4. OCR 큐에 job 추가
    const payload: OcrJobPayload = {
      canvasUuid: uuid,
      ocrKey: dto.ocrKey,
      ocrImageKey,
      userId: user.uuid,
      userTimezone,
    };

    await this.ocrQueue.add(OcrJob.Process, payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    });

    return { message: 'OCR 처리가 시작되었습니다' };
  }
}
