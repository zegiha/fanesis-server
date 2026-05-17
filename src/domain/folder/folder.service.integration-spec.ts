import { Test } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { AccentColorKeyDto } from './dto/create-folder.dto';
import { FolderService } from './folder.service';

describe('folders (integration)', () => {
  let prisma: PrismaClient;
  let service: FolderService;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const module = await Test.createTestingModule({
      providers: [FolderService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(FolderService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser() {
    return prisma.users.create({
      data: { language: Language.ko, timezone: 'Asia/Seoul' },
    });
  }

  it('rejects duplicate folder name (case-insensitive) for the same user', async () => {
    const user = await createUser();
    await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'Work', color: 'blue' },
    });
    await expect(
      prisma.folders.create({
        data: { userUuid: user.uuid, name: 'work', color: 'red' },
      }),
    ).rejects.toThrow();
  });

  it('allows same folder name across different users', async () => {
    const u1 = await createUser();
    const u2 = await createUser();
    await prisma.folders.create({
      data: { userUuid: u1.uuid, name: 'Work', color: 'blue' },
    });
    const f2 = await prisma.folders.create({
      data: { userUuid: u2.uuid, name: 'Work', color: 'red' },
    });
    expect(f2.uuid).toBeDefined();
  });

  it('raw folder delete is blocked by CHECK when tasks still attached', async () => {
    const user = await createUser();
    const folder = await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'work', color: 'blue' },
    });
    await prisma.tasks.create({
      data: {
        userUuid: user.uuid,
        title: 'X',
        backlogKind: 'folder',
        backlogFolderId: folder.uuid,
      },
    });
    await expect(
      prisma.folders.delete({ where: { uuid: folder.uuid } }),
    ).rejects.toThrow();
  });

  it('service.remove transactionally moves tasks to inbox then deletes the folder', async () => {
    const user = await createUser();
    const folder = await prisma.folders.create({
      data: { userUuid: user.uuid, name: 'work', color: 'blue' },
    });
    const task = await prisma.tasks.create({
      data: {
        userUuid: user.uuid,
        title: 'X',
        backlogKind: 'folder',
        backlogFolderId: folder.uuid,
      },
    });

    await service.remove(user.uuid, folder.uuid);

    const refreshedTask = await prisma.tasks.findUnique({
      where: { uuid: task.uuid },
    });
    expect(refreshedTask?.backlogKind).toBe('inbox');
    expect(refreshedTask?.backlogFolderId).toBeNull();

    const stillFolder = await prisma.folders.findUnique({
      where: { uuid: folder.uuid },
    });
    expect(stillFolder).toBeNull();
  });

  it('service.create + update + findAll round-trip', async () => {
    const user = await createUser();
    const created = await service.create(user.uuid, {
      name: 'Personal',
      color: AccentColorKeyDto.green,
    });
    const updated = await service.update(user.uuid, created.uuid, {
      color: AccentColorKeyDto.violet,
    });
    expect(updated.color).toBe('violet');
    const list = await service.findAll(user.uuid);
    expect(list).toHaveLength(1);
    expect(list[0].uuid).toBe(created.uuid);
  });
});
