import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import appleConfig from '@/core/config/apple.config';
import { InvalidAppleTokenException } from './../../common/exceptions/auth.exceptions';

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private readonly jwks = createRemoteJWKSet(
    new URL('https://appleid.apple.com/auth/keys'),
  );

  constructor(
    @Inject(appleConfig.KEY)
    private readonly appleCfg: ConfigType<typeof appleConfig>,
  ) {}

  async verify(identityToken: string) {
    try {
      const { payload } = await jwtVerify(identityToken, this.jwks, {
        issuer: 'https://appleid.apple.com',
        audience: this.appleCfg.bundleId,
      });

      if (!payload.sub) {
        throw new Error('missing sub claim');
      }

      return {
        sub: payload.sub,
        email: (payload['email'] as string | undefined) ?? null,
        emailVerified:
          payload['email_verified'] === true ||
          payload['email_verified'] === 'true',
      };
    } catch (err) {
      this.logger.warn(
        `Apple id_token verification failed: ${(err as Error).message}`,
      );
      throw new InvalidAppleTokenException();
    }
  }
}
