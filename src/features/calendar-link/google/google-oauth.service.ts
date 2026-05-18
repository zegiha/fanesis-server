import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { randomUUID } from 'crypto';
import googleCalendarConfig from '@/core/config/google-calendar.config';
import jwtConfig from '@/core/config/jwt.config';
import {
  CalendarOauthCodeExchangeFailedException,
  CalendarOauthStateInvalidException,
  CalendarTokenRefreshFailedException,
} from '../calendar-link.exceptions';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const STATE_TTL = '10m';

interface StatePayload {
  userUuid: string;
  nonce: string;
}

export interface ExchangedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

@Injectable()
export class GoogleOauthService {
  private readonly logger = new Logger(GoogleOauthService.name);

  constructor(
    @Inject(googleCalendarConfig.KEY)
    private readonly cfg: ConfigType<typeof googleCalendarConfig>,
    @Inject(jwtConfig.KEY)
    private readonly jwtCfg: ConfigType<typeof jwtConfig>,
    private readonly jwt: JwtService,
  ) {}

  /** authorize URL을 만들고 state는 짧은 수명의 JWT로 서명. */
  buildAuthorizeUrl(userUuid: string): string {
    const state = this.jwt.sign(
      { userUuid, nonce: randomUUID() } satisfies StatePayload,
      { secret: this.jwtCfg.accessSecret, expiresIn: STATE_TTL },
    );
    const client = this.makeClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
      include_granted_scopes: true,
    });
  }

  verifyState(state: string): StatePayload {
    try {
      return this.jwt.verify<StatePayload>(state, {
        secret: this.jwtCfg.accessSecret,
      });
    } catch {
      throw new CalendarOauthStateInvalidException();
    }
  }

  async exchangeCode(code: string): Promise<ExchangedTokens> {
    const client = this.makeClient();
    try {
      const { tokens } = await client.getToken(code);
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new CalendarOauthCodeExchangeFailedException(
          'Google did not return access_token/refresh_token. ' +
            'Ensure the OAuth client is configured with offline access and prompt=consent.',
        );
      }
      const expiresAt = tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : new Date(Date.now() + 3500 * 1000);
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
      };
    } catch (err) {
      if (err instanceof CalendarOauthCodeExchangeFailedException) throw err;
      this.logger.warn(
        `Google code exchange failed: ${(err as Error).message}`,
      );
      throw new CalendarOauthCodeExchangeFailedException();
    }
  }

  /** refresh_token으로 access_token 갱신. */
  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: Date;
  }> {
    const client = this.makeClient();
    client.setCredentials({ refresh_token: refreshToken });
    try {
      const { credentials } = await client.refreshAccessToken();
      if (!credentials.access_token) {
        throw new CalendarTokenRefreshFailedException();
      }
      const expiresAt = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : new Date(Date.now() + 3500 * 1000);
      return { accessToken: credentials.access_token, expiresAt };
    } catch (err) {
      if (err instanceof CalendarTokenRefreshFailedException) throw err;
      this.logger.warn(
        `Google token refresh failed: ${(err as Error).message}`,
      );
      throw new CalendarTokenRefreshFailedException();
    }
  }

  /** access_token으로 userinfo 조회 → 구글 계정 식별. */
  async fetchUserInfo(
    accessToken: string,
  ): Promise<{ sub: string; email: string }> {
    const res = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!res.ok) {
      throw new CalendarOauthCodeExchangeFailedException(
        `Failed to fetch userinfo (${res.status})`,
      );
    }
    const body = (await res.json()) as { sub: string; email: string };
    if (!body.sub || !body.email) {
      throw new CalendarOauthCodeExchangeFailedException(
        'userinfo response missing sub/email',
      );
    }
    return { sub: body.sub, email: body.email };
  }

  private makeClient(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.cfg.clientId,
      clientSecret: this.cfg.clientSecret,
      redirectUri: this.cfg.redirectUri,
    });
  }
}
