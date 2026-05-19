import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CanvasUploadUrlDto {
  @ApiProperty({
    description: '캔버스 날짜 (YYYY-MM-DD 형식)',
    example: '2026-05-19',
  })
  @IsDateString()
  date!: string;
}
