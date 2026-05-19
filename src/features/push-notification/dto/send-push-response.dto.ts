import { ApiProperty } from '@nestjs/swagger';

export class SendPushResponseDto {
  @ApiProperty({
    description: '큐에 투입된 push job 수 (유저의 활성 디바이스 수와 동일)',
    example: 2,
  })
  jobsEnqueued!: number;
}
