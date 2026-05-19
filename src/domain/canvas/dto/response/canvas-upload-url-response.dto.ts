import { ApiProperty } from '@nestjs/swagger';

export class CanvasUploadUrlResponseDto {
  @ApiProperty({
    description: 'R2 오브젝트 스토리지 업로드용 Presigned PUT URL',
    example:
      'https://bucket.r2.cloudflarestorage.com/canvases/uuid/2026-05-19/abc123.bin?X-Amz-Signature=...',
  })
  presignedUrl!: string;

  @ApiProperty({
    description: '업로드 확인 시 서버에 전달할 버전 키',
    example: 'aBcDeFgHiJ',
  })
  versionKey!: string;
}
