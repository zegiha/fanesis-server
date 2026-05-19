import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { StorageService } from '@/core/storage/storage.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Canvases } from '@/generated/prisma/client';
import {
  CanvasNotFoundException,
  CanvasFileTooLargeException,
  CanvasUploadNotConfirmedException,
} from './exceptions/canvas.exceptions';
import { CanvasUploadUrlResponseDto } from './dto/response/canvas-upload-url-response.dto';
import { OcrUploadUrlResponseDto } from './dto/response/ocr-upload-url-response.dto';

const MAX_CANVAS_BYTES = 50 * 1024 * 1024;

function genKey(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

@Injectable()
export class CanvasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
  ) {}

  async getUploadUrl(
    userId: string,
    date: string,
  ): Promise<CanvasUploadUrlResponseDto> {
    const versionKey = genKey();
    const storageKey = `canvases/${userId}/${date}/${versionKey}.bin`;
    const presignedUrl = await this.storageService.presignedPut(
      storageKey,
      'application/octet-stream',
      300,
    );
    return { presignedUrl, versionKey };
  }

  async confirmUpload(
    userId: string,
    date: string,
    versionKey: string,
  ): Promise<Canvases> {
    const storageKey = `canvases/${userId}/${date}/${versionKey}.bin`;

    let contentLength: number;
    try {
      const head = await this.storageService.headObject(storageKey);
      contentLength = head.contentLength;
    } catch {
      throw new CanvasUploadNotConfirmedException();
    }

    if (contentLength > MAX_CANVAS_BYTES) {
      throw new CanvasFileTooLargeException();
    }

    const dateValue = new Date(date);
    const existing = await this.prisma.canvases.findUnique({
      where: { userUuid_date: { userUuid: userId, date: dateValue } },
    });

    let newVersion: string;
    if (existing) {
      const match = existing.version.match(/^v(\d+)\./);
      const n = match ? parseInt(match[1], 10) : 1;
      newVersion = `v${n + 1}.${versionKey}`;
    } else {
      newVersion = `v1.${versionKey}`;
    }

    return this.prisma.canvases.upsert({
      where: { userUuid_date: { userUuid: userId, date: dateValue } },
      create: {
        userUuid: userId,
        date: dateValue,
        storageKey,
        version: newVersion,
      },
      update: { storageKey, version: newVersion, updatedAt: new Date() },
    });
  }

  async findByDate(userId: string, date: string): Promise<Canvases> {
    const canvas = await this.prisma.canvases.findUnique({
      where: { userUuid_date: { userUuid: userId, date: new Date(date) } },
    });
    if (!canvas) throw new CanvasNotFoundException();
    return canvas;
  }

  async getOcrUploadUrl(
    userId: string,
    canvasUuid: string,
  ): Promise<OcrUploadUrlResponseDto> {
    const canvas = await this.prisma.canvases.findUnique({
      where: { uuid: canvasUuid },
    });
    if (!canvas || canvas.userUuid !== userId)
      throw new CanvasNotFoundException();

    const ocrKey = genKey();
    const ocrImageKey = `ocr/${canvasUuid}/${ocrKey}.jpg`;
    const presignedUrl = await this.storageService.presignedPut(
      ocrImageKey,
      'image/jpeg',
      300,
    );
    return { presignedUrl, ocrKey };
  }

  async findByUuidAndUser(uuid: string, userId: string): Promise<Canvases> {
    const canvas = await this.prisma.canvases.findUnique({ where: { uuid } });
    if (!canvas || canvas.userUuid !== userId)
      throw new CanvasNotFoundException();
    return canvas;
  }
}
