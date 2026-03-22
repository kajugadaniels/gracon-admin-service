import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { EncryptionModule } from './common/crypto/encryption.module';
import { AuditModule } from './common/audit/audit.module';
import { AppMailerModule } from './common/mailer/mailer.module';
import { DocsAuthMiddleware } from './common/security/docs-auth.middleware';
import { AdminAuthModule } from './modules/auth/admin-auth.module';
import { ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    ThrottlerModule.forRoot([
      { name: 'general', ttl: 60_000, limit: 30 },
      { name: 'auth', ttl: 60_000, limit: 5 },
      { name: 'strict', ttl: 600_000, limit: 10 },
    ]),

    // Global common modules
    PrismaModule,
    EncryptionModule,
    AuditModule,
    AppMailerModule,

    // Feature modules
    AdminAuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    DocsAuthMiddleware,
  ],
})
export class AppModule {}
