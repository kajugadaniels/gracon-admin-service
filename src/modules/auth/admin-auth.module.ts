import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),

    // JWT module configured with ADMIN_JWT_SECRET — separate from api/auth/
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('ADMIN_JWT_SECRET');
        if (!secret) throw new Error('ADMIN_JWT_SECRET is not set');
        return {
          secret,
          signOptions: {
            // Cast required: config.get returns string, but @nestjs/jwt expects
            // the ms StringValue branded type — safe at runtime, jsonwebtoken
            // accepts any valid duration string
            expiresIn: config.get('ADMIN_JWT_ACCESS_EXPIRY', '8h') as '8h',
            issuer:   'id-verification-admin',
            audience: 'id-verification-admin-panel',
          },
        };
      },
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtStrategy, AdminAuthGuard],
  exports: [AdminAuthService, AdminJwtStrategy, PassportModule, AdminAuthGuard],
})
export class AdminAuthModule {}
