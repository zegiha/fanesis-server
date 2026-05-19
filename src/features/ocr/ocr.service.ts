import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ImageAnnotatorClient } from '@google-cloud/vision';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly client: ImageAnnotatorClient;

  constructor(private readonly configService: ConfigService) {
    const credentialsJson =
      this.configService.get<string>('googleVision.credentialsJson') ?? '';

    if (credentialsJson) {
      this.client = new ImageAnnotatorClient({
        credentials: JSON.parse(credentialsJson) as Record<string, unknown>,
      });
    } else {
      // 개발 환경: Application Default Credentials(ADC) 사용
      this.client = new ImageAnnotatorClient();
    }
  }

  async analyze(imageBuffer: Buffer, languageHints: string[]): Promise<string> {
    const [result] = await this.client.documentTextDetection({
      image: { content: imageBuffer.toString('base64') },
      imageContext: { languageHints },
    });
    return (result.fullTextAnnotation?.text ?? '').replace(/\n/g, ' ').trim();
  }
}
