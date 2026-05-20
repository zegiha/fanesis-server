import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { FocusController } from './focus.controller';
import { FocusService } from './focus.service';

@Module({
  imports: [PrismaModule, AuthModule, TermsModule],
  controllers: [FocusController],
  providers: [FocusService],
})
export class FocusModule {}
