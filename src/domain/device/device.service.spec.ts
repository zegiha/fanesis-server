import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma/prisma.service';
import { DeviceNotFoundException } from './device.exceptions';
import { DeviceService } from './device.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

describe('DeviceService (unit)', () => {
  let service: DeviceService;
  const devicesUpdateMany = jest.fn();
  const devicesUpsert = jest.fn();
  const devicesFindMany = jest.fn();
  // $transaction: 배열로 전달된 Promise들을 병렬 실행 후 결과 배열 반환
  const prismaTransaction = jest.fn((ops: Promise<unknown>[]) =>
    Promise.all(ops),
  );

  beforeEach(async () => {
    devicesUpdateMany.mockReset();
    devicesUpsert.mockReset();
    devicesFindMany.mockReset();
    prismaTransaction.mockReset();
    prismaTransaction.mockImplementation((ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: prismaTransaction,
            devices: {
              updateMany: devicesUpdateMany,
              upsert: devicesUpsert,
              findMany: devicesFindMany,
            },
          },
        },
      ],
    }).compile();

    service = module.get(DeviceService);
  });

  const pushToken = 'a'.repeat(64);
  const userUuid = 'user-uuid-1';

  const validDto: RegisterDeviceDto = {
    pushToken,
    deviceName: 'My iPhone',
    deviceModel: 'iPhone 15 Pro',
    appVersion: '1.0.0',
    osVersion: '17.4.1',
  };

  describe('register', () => {
    it('신규 디바이스 등록 — upsert create path', async () => {
      const created = {
        uuid: 'device-uuid-1',
        userUuid,
        pushToken,
        isActive: true,
      };
      devicesUpdateMany.mockResolvedValue({ count: 0 });
      devicesUpsert.mockResolvedValue(created);

      const result = await service.register(userUuid, validDto);

      expect(prismaTransaction).toHaveBeenCalledTimes(1);

      const [updateManyArg] = devicesUpdateMany.mock.calls[0] as [
        {
          where: { pushToken: string; NOT: { userUuid: string } };
          data: { isActive: boolean; updatedAt: Date };
        },
      ];
      expect(updateManyArg.where).toEqual({ pushToken, NOT: { userUuid } });
      expect(updateManyArg.data.isActive).toBe(false);

      const [upsertArg] = devicesUpsert.mock.calls[0] as [
        {
          where: { pushToken: string };
          create: {
            userUuid: string;
            pushToken: string;
            isActive: boolean;
            lastActiveAt: Date;
          };
          update: { userUuid: string; isActive: boolean; updatedAt: Date };
        },
      ];
      expect(upsertArg.where).toEqual({ pushToken });
      expect(upsertArg.create.userUuid).toBe(userUuid);
      expect(upsertArg.create.pushToken).toBe(pushToken);
      expect(upsertArg.create.isActive).toBe(true);
      expect(upsertArg.create.lastActiveAt).toBeInstanceOf(Date);
      expect(upsertArg.update.userUuid).toBe(userUuid);
      expect(upsertArg.update.isActive).toBe(true);

      expect(result).toBe(created);
    });

    it('동일 유저 동일 토큰 재등록 — soft-detach 0건, upsert update path', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 0 });
      devicesUpsert.mockResolvedValue({
        uuid: 'device-uuid-1',
        userUuid,
        pushToken,
        isActive: true,
      });

      await service.register(userUuid, validDto);

      const [updateManyArg] = devicesUpdateMany.mock.calls[0] as [
        { where: { pushToken: string; NOT: { userUuid: string } } },
      ];
      expect(updateManyArg.where.NOT).toEqual({ userUuid });
      expect(devicesUpsert).toHaveBeenCalledTimes(1);
    });

    it('다른 유저의 토큰 재할당 — updateMany soft-detach 후 upsert update', async () => {
      const newUserUuid = 'user-uuid-2';
      devicesUpdateMany.mockResolvedValue({ count: 1 });
      devicesUpsert.mockResolvedValue({
        uuid: 'device-uuid-1',
        userUuid: newUserUuid,
        pushToken,
        isActive: true,
      });

      await service.register(newUserUuid, { ...validDto });

      const [updateManyArg] = devicesUpdateMany.mock.calls[0] as [
        { where: { pushToken: string; NOT: { userUuid: string } } },
      ];
      expect(updateManyArg.where).toEqual({
        pushToken,
        NOT: { userUuid: newUserUuid },
      });

      const [upsertArg] = devicesUpsert.mock.calls[0] as [
        { update: { userUuid: string } },
      ];
      expect(upsertArg.update.userUuid).toBe(newUserUuid);
    });

    it('optional 필드가 없을 때 null로 설정', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 0 });
      devicesUpsert.mockResolvedValue({ uuid: 'd1', userUuid, pushToken });

      await service.register(userUuid, { pushToken });

      const [upsertArg] = devicesUpsert.mock.calls[0] as [
        {
          create: {
            deviceName: null;
            deviceModel: null;
            appVersion: null;
            osVersion: null;
          };
        },
      ];
      expect(upsertArg.create.deviceName).toBeNull();
      expect(upsertArg.create.deviceModel).toBeNull();
      expect(upsertArg.create.appVersion).toBeNull();
      expect(upsertArg.create.osVersion).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('정상 비활성화 — count=1', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.deactivate(userUuid, pushToken),
      ).resolves.toBeUndefined();

      const [arg] = devicesUpdateMany.mock.calls[0] as [
        {
          where: { pushToken: string; userUuid: string };
          data: { isActive: boolean; updatedAt: Date };
        },
      ];
      expect(arg.where).toEqual({ pushToken, userUuid });
      expect(arg.data.isActive).toBe(false);
      expect(arg.data.updatedAt).toBeInstanceOf(Date);
    });

    it('존재하지 않는 토큰 — DeviceNotFoundException throw', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deactivate(userUuid, pushToken),
      ).rejects.toBeInstanceOf(DeviceNotFoundException);
    });

    it('DeviceNotFoundException errorCode 확인', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 0 });

      try {
        await service.deactivate(userUuid, pushToken);
        fail('예외가 throw되지 않음');
      } catch (e) {
        expect((e as DeviceNotFoundException).errorCode).toBe(
          'DEVICE_NOT_FOUND',
        );
      }
    });
  });

  describe('findActiveByUser', () => {
    it('활성 디바이스 배열 반환', async () => {
      const devices = [
        { uuid: 'd1', pushToken: 'token1' },
        { uuid: 'd2', pushToken: 'token2' },
      ];
      devicesFindMany.mockResolvedValue(devices);

      const result = await service.findActiveByUser(userUuid);

      expect(devicesFindMany).toHaveBeenCalledWith({
        where: { userUuid, isActive: true },
        select: { uuid: true, pushToken: true },
      });
      expect(result).toEqual(devices);
    });

    it('활성 디바이스 없을 때 빈 배열 반환', async () => {
      devicesFindMany.mockResolvedValue([]);

      const result = await service.findActiveByUser(userUuid);

      expect(result).toEqual([]);
    });
  });

  describe('markInactive', () => {
    it('특정 UUID 비활성화 — updateMany 사용으로 not-found 시 무해', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 1 });

      await expect(service.markInactive('d1')).resolves.toBeUndefined();

      const [arg] = devicesUpdateMany.mock.calls[0] as [
        {
          where: { uuid: string };
          data: { isActive: boolean; updatedAt: Date };
        },
      ];
      expect(arg.where).toEqual({ uuid: 'd1' });
      expect(arg.data.isActive).toBe(false);
      expect(arg.data.updatedAt).toBeInstanceOf(Date);
    });

    it('디바이스가 이미 삭제된 경우 (count=0) — throw 없이 완료', async () => {
      devicesUpdateMany.mockResolvedValue({ count: 0 });

      await expect(service.markInactive('d1')).resolves.toBeUndefined();
    });
  });
});
