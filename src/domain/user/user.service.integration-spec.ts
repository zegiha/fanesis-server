import { UserNotFoundException } from '@/common/exceptions/user.exceptions';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { UserService } from './user.service';

describe('users (integration)', () => {
  let prisma: PrismaClient;
  let service: UserService;

  beforeAll(() => {
    prisma = createTestPrisma();
    service = new UserService(prisma as unknown as PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a user with defaults', async () => {
    const user = await prisma.users.create({
      data: { email: 'a@b.com', language: Language.ko, timezone: 'Asia/Seoul' },
    });
    expect(user.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.email).toBe('a@b.com');
  });

  it('rejects malformed email via CHECK constraint', async () => {
    await expect(
      prisma.users.create({
        data: {
          email: 'not-an-email',
          language: Language.ko,
          timezone: 'Asia/Seoul',
        },
      }),
    ).rejects.toThrow();
  });

  it('allows reusing an email after soft-delete (partial unique index)', async () => {
    await prisma.users.create({
      data: {
        email: 'dup@ex.com',
        language: Language.ko,
        timezone: 'Asia/Seoul',
        deletedAt: new Date(),
      },
    });

    const reborn = await prisma.users.create({
      data: {
        email: 'dup@ex.com',
        language: Language.ko,
        timezone: 'Asia/Seoul',
      },
    });

    expect(reborn.email).toBe('dup@ex.com');
  });

  it('rejects duplicate active email', async () => {
    await prisma.users.create({
      data: {
        email: 'live@ex.com',
        language: Language.ko,
        timezone: 'Asia/Seoul',
      },
    });

    await expect(
      prisma.users.create({
        data: {
          email: 'live@ex.com',
          language: Language.ko,
          timezone: 'Asia/Seoul',
        },
      }),
    ).rejects.toThrow();
  });

  describe('updateTimezone', () => {
    it('updates timezone and re-derives language to ko for Asia/Seoul', async () => {
      const created = await prisma.users.create({
        data: {
          email: 'tz1@ex.com',
          language: Language.en,
          timezone: 'America/New_York',
        },
      });

      const updated = await service.updateTimezone(created.uuid, 'Asia/Seoul');

      expect(updated.timezone).toBe('Asia/Seoul');
      expect(updated.language).toBe(Language.ko);
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        created.updatedAt.getTime(),
      );
    });

    it('updates timezone and re-derives language to en for non-Seoul tz', async () => {
      const created = await prisma.users.create({
        data: {
          email: 'tz2@ex.com',
          language: Language.ko,
          timezone: 'Asia/Seoul',
        },
      });

      const updated = await service.updateTimezone(
        created.uuid,
        'America/New_York',
      );

      expect(updated.timezone).toBe('America/New_York');
      expect(updated.language).toBe(Language.en);
    });

    it('throws UserNotFoundException for soft-deleted user', async () => {
      const created = await prisma.users.create({
        data: {
          email: 'tz3@ex.com',
          language: Language.ko,
          timezone: 'Asia/Seoul',
          deletedAt: new Date(),
        },
      });

      await expect(
        service.updateTimezone(created.uuid, 'Asia/Seoul'),
      ).rejects.toBeInstanceOf(UserNotFoundException);
    });

    it('throws UserNotFoundException for non-existent uuid', async () => {
      await expect(
        service.updateTimezone(
          '00000000-0000-0000-0000-000000000000',
          'Asia/Seoul',
        ),
      ).rejects.toBeInstanceOf(UserNotFoundException);
    });
  });
});
