import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { TaskController } from './task.controller';
import { TaskService } from './task.service';

@Module({
  imports: [PrismaModule, AuthModule, TermsModule],
  controllers: [TaskController],
  providers: [TaskService],
})
export class TaskModule {}
