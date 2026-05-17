import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Language } from '@/generated/prisma/client';

describe('UserService (unit)', () => {
  let service: UserService;
  const usersCreate = jest.fn();

  beforeEach(async () => {
    usersCreate.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: { users: { create: usersCreate } },
        },
      ],
    }).compile();

    service = module.get(UserService);
  });

  it('uses default language=ko and timezone=Asia/Seoul when not provided', async () => {
    usersCreate.mockResolvedValue({ uuid: 'u1' });

    await service.createUser({ email: 'a@b.com' });

    expect(usersCreate).toHaveBeenCalledWith({
      data: {
        email: 'a@b.com',
        displayName: undefined,
        language: Language.ko,
        timezone: 'Asia/Seoul',
      },
    });
  });

  it('forwards provided language and timezone', async () => {
    usersCreate.mockResolvedValue({ uuid: 'u2' });

    await service.createUser({
      email: 'b@c.com',
      language: Language.en,
      timezone: 'UTC',
    });

    expect(usersCreate).toHaveBeenCalledWith({
      data: {
        email: 'b@c.com',
        displayName: undefined,
        language: Language.en,
        timezone: 'UTC',
      },
    });
  });
});
