import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OAuth2Client, type LoginTicket } from 'google-auth-library';
import googleConfig from '@/core/config/google.config';
import { InvalidGoogleTokenException } from './../../common/exceptions/auth.exceptions';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private client = new OAuth2Client();

  constructor(
    @Inject(googleConfig.KEY)
    private readonly googleCfg: ConfigType<typeof googleConfig>,
  ) {}

  async verify(idToken: string) {
    let ticket: LoginTicket;
    try {
      ticket = await this.client.verifyIdToken({
        idToken,
        audience: [
          this.googleCfg.iosClientId,
          // 추후 web client id도 쓰면 여기 배열에 추가
        ],
      });
    } catch (err) {
      this.logger.warn(
        `Google id_token verification failed: ${(err as Error).message}`,
      );
      throw new InvalidGoogleTokenException();
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw new InvalidGoogleTokenException();
    }

    return {
      sub: payload.sub, // → oauth_identities.provider_user_id
      email: payload.email ?? null, // nullable (Hide My Email은 Apple만이지만 방어적으로)
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
    };
  }
}
