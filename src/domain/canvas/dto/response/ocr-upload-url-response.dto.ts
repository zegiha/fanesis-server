import { ApiProperty } from '@nestjs/swagger';

export class OcrUploadUrlResponseDto {
  @ApiProperty({
    description: 'R2 오브젝트 스토리지 OCR 이미지 업로드용 Presigned PUT URL',
    example:
      'https://bucket.r2.cloudflarestorage.com/ocr/canvas-uuid/abc123.jpg?X-Amz-Signature=...',
  })
  presignedUrl!: string;

  @ApiProperty({
    description: 'OCR 처리 요청 시 서버에 전달할 OCR 키',
    example: 'aBcDeFgHiJ',
  })
  ocrKey!: string;
}
