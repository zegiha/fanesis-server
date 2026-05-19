import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class SendPushDto {
  @ApiProperty({
    description: '알림을 받을 유저의 UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    format: 'uuid',
  })
  @IsUUID()
  userUuid!: string;

  @ApiProperty({
    description:
      'true면 silent push(content-available:1, 화면 표시 없음), false면 alert push(알림 표시)',
    example: false,
  })
  @IsBoolean()
  silent!: boolean;

  @ApiPropertyOptional({
    description: '알림 제목. silent=false일 때 필수, silent=true일 때 무시됨.',
    example: '오늘 할 일을 확인하세요',
    required: false,
  })
  @ValidateIf((o: SendPushDto) => !o.silent)
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional({
    description: '알림 본문. silent=false일 때 필수, silent=true일 때 무시됨.',
    example: '지금 시작할 시간이에요',
    required: false,
  })
  @ValidateIf((o: SendPushDto) => !o.silent)
  @IsString()
  @IsNotEmpty()
  body?: string;

  @ApiPropertyOptional({
    description: 'APNs payload에 추가될 임의 JSON 데이터',
    example: { taskUuid: 'a1b2c3d4-...', type: 'task-reminder' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
