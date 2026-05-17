import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import googleConfig from '@/config/google.config';
import { InvalidGoogleTokenException } from '../exceptions/auth.exceptions';

@Injectable()
export class GoogleAuthService {
  private client = new OAuth2Client();

  constructor(
    @Inject(googleConfig.KEY)
    private readonly googleCfg: ConfigType<typeof googleConfig>,
  ) {}

  async verify(idToken: string) {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: [
        this.googleCfg.iosClientId,
        // 추후 web client id도 쓰면 여기 배열에 추가
      ],
    });

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
