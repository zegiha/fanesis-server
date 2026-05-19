import { ApiProperty } from '@nestjs/swagger';

export class CanvasUploadUrlResponseDto {
  @ApiProperty({
    description: 'R2 오브젝트 스토리지 업로드용 Presigned PUT URL',
    example:
      'https://bucket.r2.cloudflarestorage.com/canvases/uuid/2026-05-19/abc123.bin?X-Amz-Signature=...',
  })
  presignedUrl!: string;

  @ApiProperty({
    description: '업로드 확인 시 사용할 버전 토큰 (5분 유효)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  versionToken!: string;
}
