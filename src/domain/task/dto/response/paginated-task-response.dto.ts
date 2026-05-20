import { ApiProperty } from '@nestjs/swagger';
import { Tasks } from '@/generated/prisma/client';
import { TaskResponseDto } from './task-response.dto';

export class PaginatedTaskResponseDto {
  @ApiProperty({
    description: '태스크 목록',
    type: [TaskResponseDto],
  })
  items!: TaskResponseDto[];

  @ApiProperty({
    description: '필터 조건에 매칭되는 전체 항목 수',
    example: 137,
  })
  total!: number;

  @ApiProperty({
    description: '현재 페이지 번호 (1부터 시작)',
    example: 1,
  })
  page!: number;

  @ApiProperty({
    description: '페이지당 항목 수',
    example: 20,
  })
  limit!: number;

  @ApiProperty({
    description: '다음 페이지 존재 여부',
    example: true,
  })
  hasMore!: boolean;

  static fromEntities(
    tasks: Tasks[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedTaskResponseDto {
    const dto = new PaginatedTaskResponseDto();
    dto.items = tasks.map((t) => TaskResponseDto.fromEntity(t));
    dto.total = total;
    dto.page = page;
    dto.limit = limit;
    dto.hasMore = page * limit < total;
    return dto;
  }
}
