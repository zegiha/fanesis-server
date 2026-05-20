import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { RoutineController } from './routine.controller';
import { RoutineService } from './routine.service';

@Module({
  imports: [PrismaModule, AuthModule, TermsModule],
  controllers: [RoutineController],
  providers: [RoutineService],
})
export class RoutineModule {}
