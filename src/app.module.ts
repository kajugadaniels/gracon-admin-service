// Root module for the admin service.
// Registers all global modules and the throttler guard.
// Feature modules are registered here once built in subsequent steps.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { AuditModule } from './common/audit/audit.module';

// Throttler guard — applied globally via APP_GUARD
// Admin service uses tighter limits than auth service
// because admin actions are more sensitive
import { ThrottlerGuard } from '@nestjs/throttler';
import { DocsAuthMiddleware } from './common/security';

@Module({
  imports: [
    // Load .env globally across all modules
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting — three named tiers
    // admin endpoints are tighter because the actions are higher impact
    ThrottlerModule.forRoot([
      {
        // Default — all endpoints not using a named decorator
        name: 'general',
        ttl: 60_000,
        limit: 30, // stricter than auth service — admin panel is not high-volume
      },
      {
        // Login and token endpoints
        name: 'auth',
        ttl: 60_000,
        limit: 5,
      },
      {
        // High-impact actions: user status changes, decrypt NID, create admin
        name: 'strict',
        ttl: 600_000,
        limit: 10,
      },
    ]),

    // Global common modules — injectable everywhere
    PrismaModule,
    EncryptionModule,
    AuditModule,

    // Feature modules will be added here in subsequent steps
  ],
  providers: [
    // Apply rate limiting globally to all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    DocsAuthMiddleware,
  ],
})
export class AppModule {}
