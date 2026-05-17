import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Prisma } from '@/generated/prisma/client';
import { AccentColorKeyDto, CreateFolderDto } from './dto/create-folder.dto';
import {
  FolderNameDuplicatedException,
  FolderNotFoundException,
} from './folder.exceptions';
import { FolderService } from './folder.service';

describe('FolderService (unit)', () => {
  let service: FolderService;
  const foldersFindFirst = jest.fn();
  const foldersFindUnique = jest.fn();
  const foldersFindMany = jest.fn();
  const foldersCreate = jest.fn();
  const foldersUpdate = jest.fn();
  const foldersDelete = jest.fn();
  const tasksUpdateMany = jest.fn();
  const transaction = jest.fn();

  beforeEach(async () => {
    foldersFindFirst.mockReset();
    foldersFindUnique.mockReset();
    foldersFindMany.mockReset();
    foldersCreate.mockReset();
    foldersUpdate.mockReset();
    foldersDelete.mockReset();
    tasksUpdateMany.mockReset();
    transaction.mockReset();
    transaction.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FolderService,
        {
          provide: PrismaService,
          useValue: {
            folders: {
              findFirst: foldersFindFirst,
              findUnique: foldersFindUnique,
              findMany: foldersFindMany,
              create: foldersCreate,
              update: foldersUpdate,
              delete: foldersDelete,
            },
            tasks: { updateMany: tasksUpdateMany },
            $transaction: transaction,
          },
        },
      ],
    }).compile();

    service = module.get(FolderService);
  });

  const validDto: CreateFolderDto = {
    name: 'Work',
    color: AccentColorKeyDto.blue,
  };

  describe('create', () => {
    it('rejects when name already exists (case-insensitive) for the user', async () => {
      foldersFindFirst.mockResolvedValue({ uuid: 'f-existing' });
      await expect(service.create('u', validDto)).rejects.toBeInstanceOf(
        FolderNameDuplicatedException,
      );
      expect(foldersCreate).not.toHaveBeenCalled();
    });

    it('maps Prisma P2002 to FolderNameDuplicatedException', async () => {
      foldersFindFirst.mockResolvedValue(null);
      foldersCreate.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(service.create('u', validDto)).rejects.toBeInstanceOf(
        FolderNameDuplicatedException,
      );
    });

    it('creates folder when name is available', async () => {
      foldersFindFirst.mockResolvedValue(null);
      foldersCreate.mockResolvedValue({ uuid: 'f1' });
      await service.create('u', validDto);
      expect(foldersCreate).toHaveBeenCalledWith({
        data: { userUuid: 'u', name: 'Work', color: 'blue' },
      });
    });
  });

  describe('findOne', () => {
    it('throws when missing', async () => {
      foldersFindUnique.mockResolvedValue(null);
      await expect(service.findOne('u', 'f1')).rejects.toBeInstanceOf(
        FolderNotFoundException,
      );
    });

    it('throws when owned by another user', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'other' });
      await expect(service.findOne('u', 'f1')).rejects.toBeInstanceOf(
        FolderNotFoundException,
      );
    });

    it('returns folder when owned', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'u' });
      const folder = await service.findOne('u', 'f1');
      expect(folder.uuid).toBe('f1');
    });
  });

  describe('findAll', () => {
    it('scopes query to user, newest first', async () => {
      foldersFindMany.mockResolvedValue([]);
      await service.findAll('u');
      expect(foldersFindMany).toHaveBeenCalledWith({
        where: { userUuid: 'u' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('update', () => {
    it('throws on duplicate name (excluding self)', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'u' });
      foldersFindFirst.mockResolvedValue({ uuid: 'f-other' });
      await expect(
        service.update('u', 'f1', { name: 'Work' }),
      ).rejects.toBeInstanceOf(FolderNameDuplicatedException);
      expect(foldersUpdate).not.toHaveBeenCalled();
    });

    it('updates color only when name not provided', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'u' });
      foldersUpdate.mockResolvedValue({ uuid: 'f1' });
      await service.update('u', 'f1', { color: AccentColorKeyDto.red });
      expect(foldersFindFirst).not.toHaveBeenCalled();
      expect(foldersUpdate).toHaveBeenCalledWith({
        where: { uuid: 'f1' },
        data: { color: 'red' },
      });
    });
  });

  describe('remove', () => {
    it('throws when folder missing', async () => {
      foldersFindUnique.mockResolvedValue(null);
      await expect(service.remove('u', 'f1')).rejects.toBeInstanceOf(
        FolderNotFoundException,
      );
      expect(transaction).not.toHaveBeenCalled();
    });

    it('runs updateMany(tasks) + delete(folder) in one transaction', async () => {
      foldersFindUnique.mockResolvedValue({ uuid: 'f1', userUuid: 'u' });
      const updateManyPromise = Symbol('updateMany') as unknown;
      const deletePromise = Symbol('delete') as unknown;
      tasksUpdateMany.mockReturnValue(updateManyPromise);
      foldersDelete.mockReturnValue(deletePromise);

      await service.remove('u', 'f1');

      expect(tasksUpdateMany).toHaveBeenCalledWith({
        where: { backlogFolderId: 'f1' },
        data: { backlogKind: 'inbox', backlogFolderId: null },
      });
      expect(foldersDelete).toHaveBeenCalledWith({ where: { uuid: 'f1' } });
      expect(transaction).toHaveBeenCalledWith([
        updateManyPromise,
        deletePromise,
      ]);
    });
  });
});
