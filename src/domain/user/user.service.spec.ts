import { Test, TestingModule } from '@nestjs/testing';
import { UserNotFoundException } from '@/common/exceptions/user.exceptions';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Language } from '@/generated/prisma/client';
import { UserService } from './user.service';

describe('UserService (unit)', () => {
  let service: UserService;
  const usersCreate = jest.fn();
  const usersUpdate = jest.fn();
  const usersFindFirst = jest.fn();

  beforeEach(async () => {
    usersCreate.mockReset();
    usersUpdate.mockReset();
    usersFindFirst.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: PrismaService,
          useValue: {
            users: {
              create: usersCreate,
              update: usersUpdate,
              findFirst: usersFindFirst,
            },
          },
        },
      ],
    }).compile();

    service = module.get(UserService);
  });

  describe('createUser', () => {
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

  describe('updateTimezone', () => {
    it('updates to Asia/Seoul with language=ko', async () => {
      usersFindFirst.mockResolvedValue({ uuid: 'u1' });
      usersUpdate.mockResolvedValue({ uuid: 'u1', timezone: 'Asia/Seoul' });

      await service.updateTimezone('u1', 'Asia/Seoul');

      expect(usersFindFirst).toHaveBeenCalledWith({
        where: { uuid: 'u1', deletedAt: null },
        select: { uuid: true },
      });
      expect(usersUpdate).toHaveBeenCalledWith({
        where: { uuid: 'u1' },
        data: { timezone: 'Asia/Seoul', language: Language.ko },
      });
    });

    it('updates to non-Seoul tz with language=en', async () => {
      usersFindFirst.mockResolvedValue({ uuid: 'u1' });
      usersUpdate.mockResolvedValue({ uuid: 'u1' });

      await service.updateTimezone('u1', 'America/New_York');

      expect(usersUpdate).toHaveBeenCalledWith({
        where: { uuid: 'u1' },
        data: { timezone: 'America/New_York', language: Language.en },
      });
    });

    it('throws UserNotFoundException when user does not exist or is soft-deleted', async () => {
      usersFindFirst.mockResolvedValue(null);

      await expect(
        service.updateTimezone('missing', 'Asia/Seoul'),
      ).rejects.toBeInstanceOf(UserNotFoundException);

      expect(usersUpdate).not.toHaveBeenCalled();
    });
  });
});
