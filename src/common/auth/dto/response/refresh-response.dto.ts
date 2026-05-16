import { ApiProperty } from '@nestjs/swagger';

export class RefreshResponseDto {
  @ApiProperty({
    description: '새로 발급된 Access Token (JWT, 만료 1시간)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...',
  })
  accessToken!: string;
}
