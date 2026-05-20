import { Injectable } from '@nestjs/common';
import { UserNotFoundException } from '@/common/exceptions/user.exceptions';
import { deriveLanguageFromTimezone } from '@/common/utils/language-from-timezone';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Language, Users } from '@/generated/prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(params: {
    email?: string;
    displayName?: string;
    language?: Language;
    timezone?: string;
  }): Promise<Users> {
    return this.prisma.users.create({
      data: {
        email: params.email,
        displayName: params.displayName,
        language: params.language ?? Language.ko,
        timezone: params.timezone ?? 'Asia/Seoul',
      },
    });
  }

  /**
   * 사용자의 timezone을 변경하고, 같은 규칙으로 language를 재도출해 함께 갱신한다.
   * Asia/Seoul → ko, 그 외 → en.
   * 호출자는 timezone이 유효한 IANA 식별자임을 DTO에서 검증해 전달해야 한다.
   */
  async updateTimezone(userUuid: string, timezone: string): Promise<Users> {
    const existing = await this.prisma.users.findFirst({
      where: { uuid: userUuid, deletedAt: null },
      select: { uuid: true },
    });
    if (!existing) {
      throw new UserNotFoundException();
    }

    return this.prisma.users.update({
      where: { uuid: userUuid },
      data: {
        timezone,
        language: deriveLanguageFromTimezone(timezone),
      },
    });
  }
}
