import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsTimeZone } from 'class-validator';

export class AppleLoginDto {
  @ApiProperty({
    description: 'Apple이 발급한 identity token (JWT)',
    example: 'eyJraWQiOiJBQkNERUZHSElKS0wi...',
  })
  @IsString()
  @IsNotEmpty()
  identityToken!: string;

  @ApiProperty({
    description:
      '첫 로그인 시 Apple SDK가 제공하는 이메일. 이후 로그인에서는 전송하지 않는다. ' +
      'Hide My Email 선택 시 Apple 릴레이 주소일 수 있다.',
    example: 'user@privaterelay.appleid.com',
    required: false,
  })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({
    description:
      '첫 로그인 시 Apple SDK가 제공하는 전체 이름. 이후 로그인에서는 전송하지 않는다.',
    example: '홍길동',
    required: false,
  })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiProperty({
    description:
      '클라이언트의 IANA timezone. 신규 가입 시 language 도출에 사용된다. ' +
      '기존 유저 재로그인 시에는 무시된다.',
    example: 'Asia/Seoul',
  })
  @IsString()
  @IsNotEmpty()
  @IsTimeZone()
  timezone!: string;
}
