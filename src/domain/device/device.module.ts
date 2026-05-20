import { Module } from '@nestjs/common';
import { AuthModule } from '@/core/auth/auth.module';
import { PrismaModule } from '@/core/prisma/prisma.module';
import { TermsModule } from '@/domain/terms/terms.module';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

@Module({
  imports: [PrismaModule, AuthModule, TermsModule],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
