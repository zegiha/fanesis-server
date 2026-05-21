import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AppleVerifyDto {
  @ApiProperty({
    description:
      'StoreKit 2에서 발급된 JWS 서명 트랜잭션. ' +
      'Transaction.currentEntitlements 또는 purchase 콜백에서 획득한다. ' +
      '구매 확인 및 구독 복원(restore) 모두 이 엔드포인트를 사용한다.',
    example: 'eyJhbGciOiJFUzI1NiIsIng1YyI6...',
  })
  @IsString()
  @IsNotEmpty()
  jwsTransaction!: string;
}
