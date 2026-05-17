import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';

describe('users (integration)', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = createTestPrisma();
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
});
