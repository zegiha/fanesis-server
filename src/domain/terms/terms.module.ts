import { Module } from '@nestjs/common';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { RequiredTermsGuard } from './guards/required-terms.guard';
import { TermsController } from './terms.controller';
import { TermsService } from './terms.service';

@Module({
  imports: [PrismaModule],
  controllers: [TermsController],
  providers: [TermsService, RequiredTermsGuard],
  exports: [TermsService, RequiredTermsGuard],
})
export class TermsModule {}
