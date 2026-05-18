import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

function makeService(key?: string): EncryptionService {
  const config = {
    get: jest.fn().mockReturnValue(key ?? ''),
  } as unknown as ConfigService;
  const svc = new EncryptionService(config);
  svc.onModuleInit();
  return svc;
}

describe('EncryptionService (unit)', () => {
  const validKey = randomBytes(32).toString('base64');

  it('round-trips a plaintext string', () => {
    const svc = makeService(validKey);
    const out = svc.decrypt(svc.encrypt('hello refresh_token=xyz'));
    expect(out).toBe('hello refresh_token=xyz');
  });

  it('produces different ciphertexts for the same plaintext (random IV)', () => {
    const svc = makeService(validKey);
    expect(svc.encrypt('same')).not.toBe(svc.encrypt('same'));
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    const svc = makeService('');
    expect(() => svc.encrypt('x')).toThrow(/ENCRYPTION_KEY/);
  });

  it('throws when the ciphertext was tampered with (auth tag check)', () => {
    const svc = makeService(validKey);
    const ct = svc.encrypt('payload');
    const buf = Buffer.from(ct, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a bit in the ciphertext body
    expect(() => svc.decrypt(buf.toString('base64'))).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    const shortKey = randomBytes(16).toString('base64');
    expect(() => makeService(shortKey)).toThrow(/32 bytes/);
  });
});
