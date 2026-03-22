/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ThrottlerExceptionFilter } from './common/filters/throttler-exception.filter';
import { DocsAuthMiddleware } from './common/security/docs-auth.middleware';
import { buildHelmetConfig } from './common/security/helmet.config';
import { buildCorsConfig } from './common/security/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Clean production logs — suppress verbose NestJS startup output
    logger:
      process.env.APP_ENV === 'production'
        ? ['error', 'warn']
        : ['log', 'debug', 'error', 'verbose', 'warn'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3001);
  const env = config.get<string>('APP_ENV', 'development');
  const adminFrontend = config.get<string>(
    'ADMIN_FRONTEND_URL',
    'http://localhost:4001',
  );
  const isProd = env === 'production';

  // ── Security headers ────────────────────────────────────────────
  // Helmet must be first — sets headers on every response
  app.use(helmet(buildHelmetConfig(env)));

  // ── CORS ────────────────────────────────────────────────────────
  // Only the admin frontend origin is allowed
  app.enableCors(buildCorsConfig(adminFrontend));

  // ── Global prefix ───────────────────────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ── Global validation pipe ──────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown fields
      forbidNonWhitelisted: true, // throw 400 on unknown fields
      transform: true, // auto-cast to DTO types
    }),
  );

  // ── Global exception filters ────────────────────────────────────
  app.useGlobalFilters(new ThrottlerExceptionFilter());

  // ── Swagger API Documentation ───────────────────────────────────
  // Open in development — protected by basic auth in production
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ID Verification Platform — Admin API')
    .setDescription(
      'Internal admin REST API. ' +
        'All endpoints require admin JWT authentication. ' +
        'Not for public access.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Admin JWT access token (8h expiry)',
        in: 'header',
      },
      'admin-jwt',
    )
    .addTag('auth', 'Admin authentication — login, logout, token refresh')
    .addTag('admins', 'Admin account management — create, list, deactivate')
    .addTag('users', 'User account management and status controls')
    .addTag('verifications', 'ID verification attempt history and details')
    .addTag('audit', 'Admin action audit trail')
    .addTag('security-events', 'User security event log')
    .addTag('stats', 'Platform statistics and metrics')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  if (isProd) {
    // Production — require basic auth before serving docs
    const docsMiddleware = app
      .get(DocsAuthMiddleware)
      .use.bind(app.get(DocsAuthMiddleware));
    app.use(['/docs', '/docs/json', '/redoc'], docsMiddleware);
  }

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    customSiteTitle: 'Admin API — ID Verify',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      tagsSorter: 'alpha',
    },
  });

  // Register DocsAuthMiddleware as a provider so ConfigService is injectable
  app.get(DocsAuthMiddleware);

  await app.listen(port);

  if (!isProd) {
    console.log(
      `[${env.toUpperCase()}] Admin API → http://localhost:${port}/api/v1`,
    );
    console.log(
      `[${env.toUpperCase()}] Swagger    → http://localhost:${port}/docs`,
    );
  }
}

void bootstrap();
