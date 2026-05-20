import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { FolderController } from './folder.controller';
import { FolderService } from './folder.service';

@Module({
  imports: [PrismaModule, AuthModule, TermsModule],
  controllers: [FolderController],
  providers: [FolderService],
})
export class FolderModule {}
