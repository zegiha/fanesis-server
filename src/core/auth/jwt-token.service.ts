import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import jwtConfig from '@/core/config/jwt.config';
import {
  InvalidRefreshTokenException,
  InvalidTokenTypeException,
} from '../../common/exceptions/auth.exceptions';

type AccessPayload = { sub: string; type: 'access' };
type RefreshPayload = { sub: string; type: 'refresh' };

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwt: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtCfg: ConfigType<typeof jwtConfig>,
  ) {}

  async issueAccessToken(userUuid: string): Promise<string> {
    const payload: AccessPayload = { sub: userUuid, type: 'access' };
    return this.jwt.signAsync(payload, {
      secret: this.jwtCfg.accessSecret,
      expiresIn: this.jwtCfg.accessExpiresIn,
    });
  }

  async issueRefreshToken(userUuid: string): Promise<string> {
    const payload: RefreshPayload = { sub: userUuid, type: 'refresh' };
    return this.jwt.signAsync(payload, {
      secret: this.jwtCfg.refreshSecret,
      expiresIn: this.jwtCfg.refreshExpiresIn,
    });
  }

  async verifyRefreshToken(token: string): Promise<{ sub: string }> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: this.jwtCfg.refreshSecret,
      });
      if (payload.type !== 'refresh') {
        throw new InvalidTokenTypeException();
      }
      return { sub: payload.sub };
    } catch (err) {
      if (err instanceof InvalidTokenTypeException) throw err;
      throw new InvalidRefreshTokenException();
    }
  }
}
