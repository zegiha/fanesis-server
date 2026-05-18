import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM 대칭 암호화.
 * 키는 환경변수 ENCRYPTION_KEY (base64 32B). 출력은 base64({iv(12)}|{tag(16)}|{ciphertext}).
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const raw = this.config.get<string>('ENCRYPTION_KEY') ?? '';
    if (!raw) {
      // 개발 편의: 비어 있으면 런타임에 encrypt 호출 시점에 throw
      return;
    }
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
    this.key = buf;
  }

  encrypt(plain: string): string {
    this.assertKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ct]).toString('base64');
  }

  decrypt(cipherText: string): string {
    this.assertKey();
    const buf = Buffer.from(cipherText, 'base64');
    if (buf.length < 12 + 16 + 1) {
      throw new Error('Invalid ciphertext');
    }
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
      'utf8',
    );
  }

  private assertKey(): void {
    if (!this.key) {
      throw new Error('ENCRYPTION_KEY not configured');
    }
  }
}
