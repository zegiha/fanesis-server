import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { StorageModule } from '@/core/storage/storage.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';

@Module({
  imports: [PrismaModule, StorageModule, TermsModule],
  controllers: [CanvasController],
  providers: [CanvasService],
  exports: [CanvasService],
})
export class CanvasModule {}
