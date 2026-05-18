import { ApiProperty } from '@nestjs/swagger';

export class AvailableCalendarDto {
  @ApiProperty({
    description:
      'Google calendar ID (예: primary, foo@group.calendar.google.com)',
    example: 'primary',
  })
  externalCalendarId!: string;

  @ApiProperty({
    description: '캘린더 표시 이름',
    example: 'leeseoyul@gmail.com',
  })
  summary!: string;

  @ApiProperty({ description: '주(primary) 캘린더 여부', example: true })
  isPrimary!: boolean;

  @ApiProperty({
    description: '이미 Fanesis에 구독 중인지 여부',
    example: false,
  })
  isSubscribed!: boolean;
}
