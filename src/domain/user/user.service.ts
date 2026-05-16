import { Injectable } from '@nestjs/common';
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
    const newUser: Users = await this.prisma.users.create({
      data: {
        email: params.email,
        displayName: params.displayName,
        language: params.language ?? Language.ko,
        timezone: params.timezone ?? 'Asia/Seoul',
      },
    });

    console.log(newUser);

    return newUser;
  }
}
