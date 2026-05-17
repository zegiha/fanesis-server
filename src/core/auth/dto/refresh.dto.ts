import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsNotEmpty, IsString } from 'class-validator';

export class RefreshDto {
  @ApiProperty({
    description: '로그인 시 발급받은 Refresh Token (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  })
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  refreshToken!: string;
}
