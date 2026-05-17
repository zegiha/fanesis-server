import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { DocumentBuilder, getSchemaPath, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ErrorResponseDto } from './common/dtos/error-response.dto';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  const config = new DocumentBuilder()
    .setTitle('Fanesis API')
    .setDescription('Fanesis 백엔드 API 명세 (Swift 클라이언트용)')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addTag('auth', '인증 / 토큰 관련 엔드포인트')
    .addTag('app', '서버 상태 / 공용 엔드포인트')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    extraModels: [ErrorResponseDto],
  });
  attachGlobalErrorResponses(document);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(configService.get<number>('app.port', 3000));
}
void bootstrap();

/**
 * 모든 operation에 기본 에러 응답(400/401/500)을 자동 첨부한다.
 * 컨트롤러에서 이미 같은 status code 응답을 명시한 경우는 덮어쓰지 않는다.
 */
function attachGlobalErrorResponses(document: OpenAPIObject): void {
  const errorSchema = { $ref: getSchemaPath(ErrorResponseDto) };
  const defaults: Record<string, { description: string }> = {
    '400': { description: 'Bad Request — 잘못된 요청 또는 유효성 검증 실패' },
    '401': { description: 'Unauthorized — 인증 실패 또는 토큰 무효' },
    '500': { description: 'Internal Server Error — 서버 내부 오류' },
  };

  for (const pathItem of Object.values(document.paths)) {
    for (const method of [
      'get',
      'post',
      'put',
      'patch',
      'delete',
      'options',
      'head',
    ] as const) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | { responses?: Record<string, unknown> }
        | undefined;
      if (!operation) continue;
      operation.responses ??= {};
      for (const [status, meta] of Object.entries(defaults)) {
        if (operation.responses[status]) continue;
        operation.responses[status] = {
          description: meta.description,
          content: { 'application/json': { schema: errorSchema } },
        };
      }
    }
  }
}
