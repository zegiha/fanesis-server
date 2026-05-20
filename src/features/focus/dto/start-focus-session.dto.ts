import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

export enum FocusSessionKindDto {
  focus = 'focus',
  break = 'break',
}

export class StartFocusSessionDto {
  @ApiProperty({
    description: '세션 종류 (focus=집중, break=휴식).',
    enum: FocusSessionKindDto,
    example: FocusSessionKindDto.focus,
  })
  @IsEnum(FocusSessionKindDto)
  kind!: FocusSessionKindDto;

  @ApiProperty({
    description:
      '집중 대상 task UUID. 시작 시점에 필수. 본인 소유가 아니면 404.',
    format: 'uuid',
    example: '11111111-2222-3333-4444-555555555555',
  })
  @IsUUID()
  taskUuid!: string;
}
