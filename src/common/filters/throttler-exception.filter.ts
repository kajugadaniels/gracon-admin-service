// Converts ThrottlerException to a clean JSON 429 response.
// Identical to the one in api/auth/ — both services need consistent error shapes.
import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Response } from 'express';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(_exception: ThrottlerException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    res.status(HttpStatus.TOO_MANY_REQUESTS).set('Retry-After', '60').json({
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      error: 'Too Many Requests',
      message: 'Too many requests. Please wait before trying again.',
      retryAfter: 60,
    });
  }
}
