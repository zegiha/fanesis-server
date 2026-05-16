import { Injectable } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { JwtTokenService } from './jwt-token.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Users } from '../../generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly googleTokenService: GoogleAuthService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async loginWithGoogle(idToken: string) {
    const g = await this.googleTokenService.verify(idToken);

    const { user } = await this.prisma.$transaction(async (tx) => {
      // 1. 이미 연결된 identity가 있나? (provider + providerUserId 복합 unique)
      const identity = await tx.oAuthIdentities.findUnique({
        where: {
          provider_providerUserId: {
            provider: 'google',
            providerUserId: g.sub,
          },
        },
        include: { user: true },
      });

      // 2-A. 기존 유저 — last_used_at / provider_email 갱신
      if (identity) {
        await tx.oAuthIdentities.update({
          where: { uuid: identity.uuid },
          data: {
            lastUsedAt: new Date(),
            providerEmail: g.email,
          },
        });
        return { user: identity.user };
      }

      // 2-B. 신규 — user + identity 동시 생성 (nested write = 자동 원자성)
      const newUser = await tx.users.create({
        data: {
          email: g.email,
          displayName: g.name,
          language: 'ko', // TODO: 언어 감지해서 넣어주기
          timezone: 'Asia/Seoul', // TODO: 타임존 감지해서 넣어주기
          oauthIdentities: {
            create: {
              provider: 'google',
              providerUserId: g.sub,
              providerEmail: g.email,
            },
          },
        },
      });

      return { user: newUser };
    });

    // 3. 트랜잭션 밖에서 자체 JWT 발급 (DB 작업 아니므로 분리)
    const tokens = await this.issueTokens(user);
    return { user, ...tokens };
  }

  async refreshTokens(refreshToken: string) {
    const { sub } = await this.jwtTokenService.verifyRefreshToken(refreshToken);
    const accessToken = await this.jwtTokenService.issueAccessToken(sub);
    return { accessToken };
  }

  private async issueTokens(user: Users) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtTokenService.issueAccessToken(user.uuid),
      this.jwtTokenService.issueRefreshToken(user.uuid),
    ]);
    return { accessToken, refreshToken };
  }
}
