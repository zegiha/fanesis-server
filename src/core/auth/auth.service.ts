import { Injectable } from '@nestjs/common';
import { AppleAuthService } from './apple-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtTokenService } from './jwt-token.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { Users } from '../../generated/prisma/client';
import { deriveLanguageFromTimezone } from '@/common/utils/language-from-timezone';
import { AppleLoginDto } from './dto/apple-login.dto';
import { AuthResponseDto } from './dto/response/auth-response.dto';
import { RefreshResponseDto } from './dto/response/refresh-response.dto';
import { UserResponseDto } from './dto/response/user-response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly googleTokenService: GoogleAuthService,
    private readonly appleTokenService: AppleAuthService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async loginWithGoogle(
    idToken: string,
    timezone: string,
  ): Promise<AuthResponseDto> {
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
      //      timezone/language는 변경하지 않는다 (PATCH /users/me/timezone 전용)
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
      //      language는 timezone으로부터 도출 (Asia/Seoul → ko, 그 외 → en)
      const newUser = await tx.users.create({
        data: {
          email: g.email,
          displayName: g.name,
          language: deriveLanguageFromTimezone(timezone),
          timezone,
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
    return { user: UserResponseDto.fromEntity(user), ...tokens };
  }

  async loginWithApple(dto: AppleLoginDto): Promise<AuthResponseDto> {
    const apple = await this.appleTokenService.verify(dto.identityToken);

    // dto.email 우선 — Apple SDK가 첫 로그인 시 실제 이메일을 전달함
    const effectiveEmail = dto.email ?? apple.email ?? null;

    const { user } = await this.prisma.$transaction(async (tx) => {
      const identity = await tx.oAuthIdentities.findUnique({
        where: {
          provider_providerUserId: {
            provider: 'apple',
            providerUserId: apple.sub,
          },
        },
        include: { user: true },
      });

      if (identity) {
        await tx.oAuthIdentities.update({
          where: { uuid: identity.uuid },
          data: {
            lastUsedAt: new Date(),
            providerEmail: effectiveEmail,
          },
        });
        return { user: identity.user };
      }

      const newUser = await tx.users.create({
        data: {
          email: effectiveEmail,
          displayName: dto.fullName ?? null,
          language: deriveLanguageFromTimezone(dto.timezone),
          timezone: dto.timezone,
          oauthIdentities: {
            create: {
              provider: 'apple',
              providerUserId: apple.sub,
              providerEmail: effectiveEmail,
            },
          },
        },
      });

      return { user: newUser };
    });

    const tokens = await this.issueTokens(user);
    return { user: UserResponseDto.fromEntity(user), ...tokens };
  }

  async refreshTokens(refreshToken: string): Promise<RefreshResponseDto> {
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
