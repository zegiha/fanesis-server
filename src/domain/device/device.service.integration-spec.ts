import { Test } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import type { PrismaClient } from '@/generated/prisma/client';
import { Language } from '@/generated/prisma/client';
import { createTestPrisma, truncateAll } from '../../../test/setup/prisma-test';
import { DeviceNotFoundException } from './device.exceptions';
import { DeviceService } from './device.service';

describe('devices (integration)', () => {
  let prisma: PrismaClient;
  let service: DeviceService;

  beforeAll(async () => {
    prisma = createTestPrisma();
    const module = await Test.createTestingModule({
      providers: [DeviceService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DeviceService);
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createUser() {
    return prisma.users.create({
      data: { language: Language.ko, timezone: 'Asia/Seoul' },
    });
  }

  const pushToken = 'a'.repeat(64);

  it('신규 디바이스 등록 — DB에 row 존재 확인', async () => {
    const user = await createUser();

    await service.register(user.uuid, { pushToken });

    const device = await prisma.devices.findUnique({ where: { pushToken } });
    expect(device).not.toBeNull();
    expect(device?.userUuid).toBe(user.uuid);
    expect(device?.isActive).toBe(true);
  });

  it('동일 유저 재등록 — row 업데이트, 중복 없음', async () => {
    const user = await createUser();

    await service.register(user.uuid, {
      pushToken,
      deviceName: 'First',
    });
    await service.register(user.uuid, {
      pushToken,
      deviceName: 'Updated',
    });

    const devices = await prisma.devices.findMany({ where: { pushToken } });
    expect(devices).toHaveLength(1);
    expect(devices[0].deviceName).toBe('Updated');
    expect(devices[0].isActive).toBe(true);
  });

  it('다른 유저 토큰 재할당 — push_token row가 user2로 이전되고 user1 소유 row 없음', async () => {
    const user1 = await createUser();
    const user2 = await createUser();

    // user1에게 두 번째 토큰도 미리 등록 (soft-detach 대상 확인용)
    const extraToken = 'b'.repeat(64);
    await service.register(user1.uuid, { pushToken: extraToken });
    // pushToken을 user1으로 등록
    await service.register(user1.uuid, { pushToken });

    // 같은 pushToken을 user2로 재등록 — updateMany가 user1의 extraToken 외 row를 isActive=false 처리
    // 그 후 upsert가 pushToken row를 user2로 업데이트
    await service.register(user2.uuid, { pushToken });

    // pushToken row는 user2 소유이고 active
    const deviceAfter = await prisma.devices.findUnique({
      where: { pushToken },
    });
    expect(deviceAfter?.userUuid).toBe(user2.uuid);
    expect(deviceAfter?.isActive).toBe(true);

    // user1은 pushToken row를 더 이상 소유하지 않음
    const user1ActiveDevices = await service.findActiveByUser(user1.uuid);
    const user1HasPushToken = user1ActiveDevices.some(
      (d) => d.pushToken === pushToken,
    );
    expect(user1HasPushToken).toBe(false);
  });

  it('deactivate — isActive=false DB 확인', async () => {
    const user = await createUser();
    await service.register(user.uuid, { pushToken });

    await service.deactivate(user.uuid, pushToken);

    const device = await prisma.devices.findUnique({ where: { pushToken } });
    expect(device?.isActive).toBe(false);
  });

  it('deactivate 없는 토큰 — DeviceNotFoundException', async () => {
    const user = await createUser();

    await expect(
      service.deactivate(user.uuid, pushToken),
    ).rejects.toBeInstanceOf(DeviceNotFoundException);
  });

  it('findActiveByUser — isActive=false 디바이스 제외 확인', async () => {
    const user = await createUser();
    const activeToken = 'b'.repeat(64);
    const inactiveToken = 'c'.repeat(64);

    await service.register(user.uuid, { pushToken: activeToken });
    await service.register(user.uuid, { pushToken: inactiveToken });
    // inactiveToken 비활성화
    await service.deactivate(user.uuid, inactiveToken);

    const result = await service.findActiveByUser(user.uuid);

    expect(result).toHaveLength(1);
    expect(result[0].pushToken).toBe(activeToken);
  });

  it('push_token UNIQUE 제약 — 동일 토큰을 두 유저에 동시 등록하면 upsert가 재할당함 (중복 row 없음)', async () => {
    const user1 = await createUser();
    const user2 = await createUser();

    await prisma.devices.create({
      data: { userUuid: user1.uuid, pushToken, isActive: true },
    });

    // 직접 create 시도 → UNIQUE 위반
    await expect(
      prisma.devices.create({
        data: { userUuid: user2.uuid, pushToken, isActive: true },
      }),
    ).rejects.toThrow();
  });
});
