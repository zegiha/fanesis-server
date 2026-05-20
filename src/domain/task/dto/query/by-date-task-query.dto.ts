import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ByDateTaskQueryDto {
  @ApiProperty({
    description: '예약 날짜 (YYYY-MM-DD)',
    example: '2026-05-20',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must match YYYY-MM-DD format',
  })
  date!: string;
}
