import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type AccessPayload = { sub: string; type: 'access' };
type RefreshPayload = { sub: string; type: 'refresh' };

@Injectable()
export class JwtTokenService {
  constructor(private readonly jwt: JwtService) {}

  async issueAccessToken(userUuid: string): Promise<string> {
    const payload: AccessPayload = { sub: userUuid, type: 'access' };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET!,
      expiresIn: '1h',
    });
  }

  async issueRefreshToken(userUuid: string): Promise<string> {
    const payload: RefreshPayload = { sub: userUuid, type: 'refresh' };
    return this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET!,
      expiresIn: '30d',
    });
  }

  async verifyRefreshToken(token: string): Promise<{ sub: string }> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshPayload>(token, {
        secret: process.env.JWT_REFRESH_SECRET!,
      });
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }
      return { sub: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
