import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { FolderController } from './folder.controller';
import { FolderService } from './folder.service';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [FolderController],
  providers: [FolderService],
})
export class FolderModule {}
