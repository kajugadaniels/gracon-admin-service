// Validates required environment variables at application startup.
// The service crashes immediately with a clear error message if any
// required variable is missing or malformed.
// This prevents silent failures like broken invite links or wrong secrets.
import { plainToInstance } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsIn,
  IsOptional,
  Min,
  Max,
  validateSync,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  APP_ENV: string;

  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1024)
  @Max(65535)
  APP_PORT: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @MinLength(32, {
    message:
      'ADMIN_JWT_SECRET must be at least 32 characters. ' +
      "Generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
  })
  ADMIN_JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_JWT_ACCESS_EXPIRY: string;

  @IsString()
  @IsNotEmpty()
  ADMIN_JWT_REFRESH_EXPIRY: string;

  @IsString()
  @MinLength(32, {
    message:
      'ENCRYPTION_SECRET must be at least 32 characters. ' +
      'It must match the value in api/auth/ exactly.',
  })
  ENCRYPTION_SECRET: string;

  // Critical — if missing, invite emails contain "undefined/set-password"
  @IsString()
  @IsNotEmpty({
    message:
      'ADMIN_FRONTEND_URL is required. ' +
      'Set it to the admin frontend URL e.g. http://localhost:4001',
  })
  ADMIN_FRONTEND_URL: string;

  // Optional extra allowed origins for CORS, comma-separated.
  // Leave empty unless another trusted frontend needs to call this API.
  @IsOptional()
  @IsString()
  FRONTEND_URLS?: string;

  @IsString()
  @IsNotEmpty()
  MAIL_HOST: string;

  @IsString()
  @IsNotEmpty()
  MAIL_USER: string;

  @IsString()
  @IsNotEmpty()
  MAIL_PASS: string;

  @IsString()
  @IsNotEmpty()
  MAIL_FROM: string;

  @IsString()
  @IsNotEmpty()
  SIGNATURE_SERVICE_URL: string;

  @IsString()
  @IsNotEmpty()
  SIGNATURE_SERVICE_USERNAME: string;

  @IsString()
  @IsNotEmpty()
  SIGNATURE_SERVICE_PASSWORD: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(
      `\n\n❌ Environment validation failed:\n${messages}\n\n` +
        `Check your .env file against .env.example\n`,
    );
  }

  return validated;
}
