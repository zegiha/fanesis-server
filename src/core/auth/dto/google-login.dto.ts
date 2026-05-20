import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsTimeZone } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google이 발급한 ID 토큰 (JWT)',
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...',
  })
  @IsString()
  @IsNotEmpty()
  idToken!: string;

  @ApiProperty({
    description:
      '클라이언트의 IANA timezone (예: iOS TimeZone.current.identifier). ' +
      '신규 가입 시 language 도출에 사용된다 (Asia/Seoul → ko, 그 외 → en). ' +
      '기존 유저 재로그인 시에는 무시되며, 변경하려면 PATCH /users/me/timezone 사용.',
    example: 'Asia/Seoul',
  })
  @IsString()
  @IsNotEmpty()
  @IsTimeZone()
  timezone!: string;
}
