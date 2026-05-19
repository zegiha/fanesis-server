import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, MinLength } from 'class-validator';

export class ConfirmCanvasDto {
  @ApiProperty({
    description: '캔버스 날짜 (YYYY-MM-DD 형식)',
    example: '2026-05-19',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description: '업로드 URL 발급 시 받은 버전 토큰 (JWT)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @MinLength(1)
  versionToken!: string;
}
