// Query parameters for the paginated verification attempts list.
// Supports filtering by outcome, user, date range, and score thresholds.
import {
  IsOptional,
  IsBoolean,
  IsString,
  IsUUID,
  IsInt,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryVerificationsDto {
  @ApiPropertyOptional({
    description:
      'Filter by outcome. true = passed attempts only. false = failed only.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  passed?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by a specific user UUID. ' +
      'Returns all verification attempts for that user only.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  @ApiPropertyOptional({
    description:
      'Filter by IP address. Useful for investigating suspicious origins.',
    example: '197.243.11.45',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  ipAddress?: string;

  @ApiPropertyOptional({
    description: 'Return attempts submitted on or after this date (ISO 8601).',
    example: '2024-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Return attempts submitted on or before this date (ISO 8601).',
    example: '2024-11-30T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    description:
      'Minimum composite score (0–100). ' +
      'Use with maximum to find attempts in a specific score range.',
    example: 70.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  scoreMin?: number;

  @ApiPropertyOptional({
    description: 'Maximum composite score (0–100).',
    example: 79.9,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  scoreMax?: number;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
