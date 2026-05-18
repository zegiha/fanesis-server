import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsString } from 'class-validator';

export class SubscribeCalendarsDto {
  @ApiProperty({
    description: '구독할 Google calendar ID 목록',
    example: ['primary', 'work@group.calendar.google.com'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  externalCalendarIds!: string[];
}
