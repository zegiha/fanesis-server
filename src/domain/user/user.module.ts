import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [PrismaModule, AuthModule, TermsModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
