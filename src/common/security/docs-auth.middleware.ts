// Basic-auth middleware protecting /docs and /redoc in production.
// Admin API docs expose admin endpoint structure — must never be public.
import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class DocsAuthMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const user = this.config.get<string>('DOCS_BASIC_AUTH_USER');
    const pass = this.config.get<string>('DOCS_BASIC_AUTH_PASS');

    if (!user || !pass) {
      res
        .status(503)
        .json({ statusCode: 503, message: 'Documentation not available.' });
      return;
    }

    const authHeader = req.headers['authorization'] ?? '';

    if (!authHeader.startsWith('Basic ')) {
      res
        .set('WWW-Authenticate', 'Basic realm="Admin API Documentation"')
        .status(401)
        .json({ statusCode: 401, message: 'Authentication required.' });
      return;
    }

    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    const [reqUser, reqPass] = decoded.split(':');

    const userMatch = crypto.timingSafeEqual(
      Buffer.from(reqUser ?? ''),
      Buffer.from(user),
    );
    const passMatch = crypto.timingSafeEqual(
      Buffer.from(reqPass ?? ''),
      Buffer.from(pass),
    );

    if (!userMatch || !passMatch) {
      res
        .set('WWW-Authenticate', 'Basic realm="Admin API Documentation"')
        .status(401)
        .json({ statusCode: 401, message: 'Invalid credentials.' });
      return;
    }

    next();
  }
}
