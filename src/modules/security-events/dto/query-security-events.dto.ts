import {
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  IsDateString,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SecurityEvent } from '@gracon/database';

export class QuerySecurityEventsDto {
  @ApiPropertyOptional({
    description: 'Filter by a specific user UUID.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    enum: SecurityEvent,
    description: 'Filter by event type.',
    example: SecurityEvent.LOGIN_FAILED,
  })
  @IsOptional()
  @IsEnum(SecurityEvent)
  eventType?: SecurityEvent;

  @ApiPropertyOptional({
    description: 'Filter by originating IP address.',
    example: '197.243.55.100',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'Return events on or after this date (ISO 8601).',
    example: '2024-11-19T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Return events on or before this date (ISO 8601).',
    example: '2024-11-19T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;
}
