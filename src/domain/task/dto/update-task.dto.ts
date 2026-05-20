import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsISO8601, IsOptional, ValidateIf } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({
    description:
      '완료 시각 (ISO 8601). 미완료로 되돌리려면 null을 전달한다. 미전달 시 현재 값 유지.',
    example: '2026-05-20T10:30:00.000Z',
    nullable: true,
    type: String,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsISO8601()
  doneDate?: string | null;
}
