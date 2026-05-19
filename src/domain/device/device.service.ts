import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/core/prisma/prisma.service';
import { Devices } from '@/generated/prisma/client';
import { DeviceNotFoundException } from './device.exceptions';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class DeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async register(userUuid: string, dto: RegisterDeviceDto): Promise<Devices> {
    const { pushToken, deviceName, deviceModel, appVersion, osVersion } = dto;
    const now = new Date();

    // soft-detach + upsert를 트랜잭션으로 묶어 동시 등록 시 소유권 경합 방지
    const [, device] = await this.prisma.$transaction([
      this.prisma.devices.updateMany({
        where: { pushToken, NOT: { userUuid } },
        data: { isActive: false, updatedAt: now },
      }),
      this.prisma.devices.upsert({
        where: { pushToken },
        create: {
          userUuid,
          pushToken,
          deviceName: deviceName ?? null,
          deviceModel: deviceModel ?? null,
          appVersion: appVersion ?? null,
          osVersion: osVersion ?? null,
          isActive: true,
          lastActiveAt: now,
        },
        update: {
          userUuid,
          deviceName: deviceName ?? null,
          deviceModel: deviceModel ?? null,
          appVersion: appVersion ?? null,
          osVersion: osVersion ?? null,
          isActive: true,
          lastActiveAt: now,
          updatedAt: now,
        },
      }),
    ]);

    return device;
  }

  async deactivate(userUuid: string, pushToken: string): Promise<void> {
    const result = await this.prisma.devices.updateMany({
      where: { pushToken, userUuid },
      data: { isActive: false, updatedAt: new Date() },
    });

    if (result.count === 0) {
      throw new DeviceNotFoundException();
    }
  }

  async findActiveByUser(
    userUuid: string,
  ): Promise<Array<{ uuid: string; pushToken: string }>> {
    return this.prisma.devices.findMany({
      where: { userUuid, isActive: true },
      select: { uuid: true, pushToken: true },
    });
  }

  // updateMany 사용: 디바이스가 이미 삭제·비활성화된 경우 P2025 없이 무시
  async markInactive(deviceUuid: string): Promise<void> {
    await this.prisma.devices.updateMany({
      where: { uuid: deviceUuid },
      data: { isActive: false, updatedAt: new Date() },
    });
  }
}
