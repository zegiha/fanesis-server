import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsTimeZone } from 'class-validator';

export class UpdateTimezoneDto {
  @ApiProperty({
    description:
      'IANA timezone 식별자 (예: Asia/Seoul). 변경 시 language도 자동 재도출된다 ' +
      '(Asia/Seoul → ko, 그 외 → en).',
    example: 'America/New_York',
  })
  @IsString()
  @IsNotEmpty()
  @IsTimeZone()
  timezone!: string;
}
