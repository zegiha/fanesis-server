import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class ByDateFocusSessionQueryDto {
  @ApiProperty({
    description:
      '조회 대상 날짜 (YYYY-MM-DD). 사용자 timezone(users.timezone) 기준으로 started_at을 버켓팅한다.',
    example: '2026-05-20',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must match YYYY-MM-DD format',
  })
  date!: string;
}
