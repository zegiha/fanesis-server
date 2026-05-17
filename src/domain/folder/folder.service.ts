import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Folders, Prisma } from '@/generated/prisma/client';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import {
  FolderNameDuplicatedException,
  FolderNotFoundException,
} from './folder.exceptions';

@Injectable()
export class FolderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userUuid: string, dto: CreateFolderDto): Promise<Folders> {
    await this.assertNameAvailable(userUuid, dto.name, undefined);
    try {
      return await this.prisma.folders.create({
        data: { userUuid, name: dto.name, color: dto.color },
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new FolderNameDuplicatedException();
      }
      throw e;
    }
  }

  findAll(userUuid: string): Promise<Folders[]> {
    return this.prisma.folders.findMany({
      where: { userUuid },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userUuid: string, folderUuid: string): Promise<Folders> {
    const folder = await this.prisma.folders.findUnique({
      where: { uuid: folderUuid },
    });
    if (!folder || folder.userUuid !== userUuid) {
      throw new FolderNotFoundException();
    }
    return folder;
  }

  async update(
    userUuid: string,
    folderUuid: string,
    dto: UpdateFolderDto,
  ): Promise<Folders> {
    await this.findOne(userUuid, folderUuid);

    if (dto.name !== undefined) {
      await this.assertNameAvailable(userUuid, dto.name, folderUuid);
    }

    const data: Prisma.FoldersUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.color !== undefined) data.color = dto.color;

    try {
      return await this.prisma.folders.update({
        where: { uuid: folderUuid },
        data,
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new FolderNameDuplicatedException();
      }
      throw e;
    }
  }

  async remove(userUuid: string, folderUuid: string): Promise<void> {
    await this.findOne(userUuid, folderUuid);
    // CHECK constraint `backlog_folder_consistency` 때문에 folder를 그냥 지우면
    // FK ON DELETE SET NULL로 backlog_folder_id가 NULL이 되면서 CHECK가 실패한다.
    // 같은 트랜잭션 안에서 먼저 task들을 inbox로 변환한 뒤 folder를 삭제한다.
    await this.prisma.$transaction([
      this.prisma.tasks.updateMany({
        where: { backlogFolderId: folderUuid },
        data: { backlogKind: 'inbox', backlogFolderId: null },
      }),
      this.prisma.folders.delete({ where: { uuid: folderUuid } }),
    ]);
  }

  private async assertNameAvailable(
    userUuid: string,
    name: string,
    excludeFolderUuid: string | undefined,
  ): Promise<void> {
    const existing = await this.prisma.folders.findFirst({
      where: {
        userUuid,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeFolderUuid ? { uuid: { not: excludeFolderUuid } } : {}),
      },
      select: { uuid: true },
    });
    if (existing) {
      throw new FolderNameDuplicatedException();
    }
  }
}

function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
  );
}
