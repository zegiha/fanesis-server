import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsNumber()
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(16)
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @MinLength(16)
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @MinLength(1)
  GOOGLE_IOS_CLIENT_ID!: string;

  // Google Calendar OAuth (web client - separate from iOS sign-in)
  @IsString()
  @IsOptional()
  GOOGLE_CALENDAR_CLIENT_ID: string = '';

  @IsString()
  @IsOptional()
  GOOGLE_CALENDAR_CLIENT_SECRET: string = '';

  @IsString()
  @IsOptional()
  GOOGLE_CALENDAR_REDIRECT_URI: string = '';

  @IsString()
  @IsOptional()
  GOOGLE_CALENDAR_WEBHOOK_BASE_URL: string = '';

  @IsString()
  @IsOptional()
  MOBILE_DEEP_LINK_CALENDAR_SUCCESS: string = '';

  @IsString()
  @IsOptional()
  MOBILE_DEEP_LINK_CALENDAR_FAILURE: string = '';

  // AES-256-GCM key, base64-encoded 32 bytes
  @IsString()
  @IsOptional()
  ENCRYPTION_KEY: string = '';

  @IsString()
  @IsOptional()
  REDIS_URL: string = '';

  @IsString()
  @IsOptional()
  APPLE_KEY_ID: string = '';

  @IsString()
  @IsOptional()
  APPLE_TEAM_ID: string = '';

  @IsString()
  @IsOptional()
  APPLE_PRIVATE_KEY: string = '';

  @IsString()
  @IsOptional()
  REMINDER_LEAD_MINUTES: string = '1';

  @IsString()
  @IsOptional()
  R2_BUCKET: string = '';

  @IsString()
  @IsOptional()
  R2_ENDPOINT: string = '';

  @IsString()
  @IsOptional()
  R2_ACCESS_KEY: string = '';

  @IsString()
  @IsOptional()
  R2_SECRET_KEY: string = '';

  @IsString()
  @IsOptional()
  GOOGLE_VISION_API_KEY: string = '';

  @IsString()
  @MinLength(1)
  APPLE_BUNDLE_ID!: string;

  @IsString()
  @IsOptional()
  APPLE_ENVIRONMENT: string = 'Sandbox';

  // Apple Root CA - G3 (DER, base64 인코딩). Apple PKI 사이트에서 다운로드.
  @IsString()
  @IsOptional()
  APPLE_ROOT_CA_G3: string = '';
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map(
          (e) =>
            `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
        )
        .join('\n')}`,
    );
  }
  return validated;
}
