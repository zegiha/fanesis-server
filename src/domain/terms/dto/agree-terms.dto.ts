import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class AgreeTermsDto {
  @ApiProperty({
    description: '약관 동의 여부 (true: 동의, false: 철회)',
    example: true,
  })
  @IsBoolean()
  agreed!: boolean;
}
