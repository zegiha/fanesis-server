import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StorageService } from '@/core/storage/storage.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Canvases } from '@/generated/prisma/client';
import {
  CanvasNotFoundException,
  CanvasVersionTokenExpiredException,
  CanvasVersionTokenInvalidException,
  CanvasFileTooLargeException,
  CanvasUploadNotConfirmedException,
} from './exceptions/canvas.exceptions';
import { CanvasUploadUrlResponseDto } from './dto/response/canvas-upload-url-response.dto';
import { OcrUploadUrlResponseDto } from './dto/response/ocr-upload-url-response.dto';

const MAX_CANVAS_BYTES = 50 * 1024 * 1024;

function genKey(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

interface VersionTokenPayload {
  sub: string;
  date: string;
  versionKey: string;
  aud: string;
}

export interface OcrTokenPayload {
  sub: string;
  canvasUuid: string;
  ocrKey: string;
  aud: string;
}

@Injectable()
export class CanvasService {
  private readonly logger = new Logger(CanvasService.name);
  private readonly jwtUploadSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtUploadSecret =
      this.configService.get<string>('JWT_UPLOAD_SECRET') ?? '';
  }

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

    const versionToken = this.jwtService.sign(
      { sub: userId, date, versionKey, aud: 'upload:canvas' },
      { secret: this.jwtUploadSecret, expiresIn: '5m' },
    );

    return { presignedUrl, versionToken };
  }

  async confirmUpload(
    userId: string,
    date: string,
    versionToken: string,
  ): Promise<Canvases> {
    let payload: VersionTokenPayload;
    try {
      payload = this.jwtService.verify<VersionTokenPayload>(versionToken, {
        secret: this.jwtUploadSecret,
      });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TokenExpiredError') {
        throw new CanvasVersionTokenExpiredException();
      }
      throw new CanvasVersionTokenInvalidException();
    }

    if (
      payload.aud !== 'upload:canvas' ||
      payload.sub !== userId ||
      payload.date !== date
    ) {
      throw new CanvasVersionTokenInvalidException();
    }

    const { versionKey } = payload;
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

    const canvas = await this.prisma.canvases.upsert({
      where: { userUuid_date: { userUuid: userId, date: dateValue } },
      create: {
        userUuid: userId,
        date: dateValue,
        storageKey,
        version: newVersion,
      },
      update: {
        storageKey,
        version: newVersion,
        updatedAt: new Date(),
      },
    });

    return canvas;
  }

  async findByDate(userId: string, date: string): Promise<Canvases> {
    const canvas = await this.prisma.canvases.findUnique({
      where: { userUuid_date: { userUuid: userId, date: new Date(date) } },
    });
    if (!canvas) {
      throw new CanvasNotFoundException();
    }
    return canvas;
  }

  async getOcrUploadUrl(
    userId: string,
    canvasUuid: string,
  ): Promise<OcrUploadUrlResponseDto> {
    const canvas = await this.prisma.canvases.findUnique({
      where: { uuid: canvasUuid },
    });
    if (!canvas || canvas.userUuid !== userId) {
      throw new CanvasNotFoundException();
    }

    const ocrKey = genKey();
    const ocrImageKey = `ocr/${canvasUuid}/${ocrKey}.jpg`;

    const presignedUrl = await this.storageService.presignedPut(
      ocrImageKey,
      'image/jpeg',
      300,
    );

    const ocrToken = this.jwtService.sign(
      { sub: userId, canvasUuid, ocrKey, aud: 'upload:ocr' },
      { secret: this.jwtUploadSecret, expiresIn: '5m' },
    );

    return { presignedUrl, ocrToken };
  }

  verifyOcrToken(token: string, userId: string): OcrTokenPayload {
    const payload = this.jwtService.verify<OcrTokenPayload>(token, {
      secret: this.jwtUploadSecret,
    });

    if (payload.aud !== 'upload:ocr' || payload.sub !== userId) {
      throw new Error('invalid aud or sub');
    }

    return payload;
  }
}
