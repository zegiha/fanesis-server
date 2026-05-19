import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppException } from '@/common/exceptions/app.exception';
import { ErrorCode } from '@/common/exceptions/error-codes';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private _client: S3Client | null = null;

  constructor(private readonly configService: ConfigService) {}

  private get client(): S3Client {
    if (!this._client) {
      const endpoint = this.configService.get<string>('storage.endpoint') ?? '';
      const accessKey =
        this.configService.get<string>('storage.accessKey') ?? '';
      const secretKey =
        this.configService.get<string>('storage.secretKey') ?? '';

      this._client = new S3Client({
        region: 'auto',
        endpoint: endpoint || undefined,
        credentials:
          accessKey && secretKey
            ? { accessKeyId: accessKey, secretAccessKey: secretKey }
            : undefined,
        forcePathStyle: false,
      });
    }
    return this._client;
  }

  private get bucket(): string {
    return this.configService.get<string>('storage.bucket') ?? '';
  }

  async presignedPut(
    key: string,
    contentType: string,
    ttlSeconds: number,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  async headObject(key: string): Promise<{
    contentType: string;
    contentLength: number;
  }> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return {
        contentType: result.ContentType ?? '',
        contentLength: result.ContentLength ?? 0,
      };
    } catch (err: unknown) {
      const code =
        err instanceof Error && 'name' in err
          ? (err as { name: string }).name
          : '';
      if (code === 'NotFound' || code === '404') {
        throw new AppException(
          ErrorCode.CANVAS_UPLOAD_NOT_CONFIRMED,
          'Canvas file not found in storage — upload not confirmed',
          HttpStatus.CONFLICT,
        );
      }
      this.logger.error('headObject failed', err);
      throw new AppException(
        ErrorCode.CANVAS_UPLOAD_NOT_CONFIRMED,
        'Canvas file not found in storage — upload not confirmed',
        HttpStatus.CONFLICT,
      );
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!result.Body) {
      throw new Error(`Empty body for key: ${key}`);
    }
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  }
}
