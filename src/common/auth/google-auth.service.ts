import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GoogleAuthService {
  private client = new OAuth2Client();

  async verify(idToken: string) {
    const ticket = await this.client.verifyIdToken({
      idToken,
      audience: [
        process.env.GOOGLE_IOS_CLIENT_ID!,
        // 추후 web client id도 쓰면 여기 배열에 추가
      ],
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid Google token');
    }

    return {
      sub: payload.sub, // → oauth_identities.provider_user_id
      email: payload.email ?? null, // nullable (Hide My Email은 Apple만이지만 방어적으로)
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? null,
    };
  }
}
