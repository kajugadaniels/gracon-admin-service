import {
  IsOptional,
  IsUUID,
  IsString,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AdminAction } from '@prisma/client';

export class QueryAuditDto {
  @ApiPropertyOptional({
    description: 'Filter by the admin who performed the action.',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsOptional()
  @IsUUID('4')
  adminId?: string;

  @ApiPropertyOptional({
    description: 'Filter by the user who was affected by the action.',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @IsOptional()
  @IsUUID('4')
  targetUserId?: string;

  @ApiPropertyOptional({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    enum: AdminAction,
    description: 'Filter by a specific action type.',
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    example: AdminAction.USER_DEACTIVATED,
  })
  @IsOptional()
  @IsEnum(AdminAction)
  action?: AdminAction;

  @ApiPropertyOptional({
    description: 'Return actions performed on or after this date (ISO 8601).',
    example: '2024-11-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Return actions performed on or before this date (ISO 8601).',
    example: '2024-11-30T23:59:59.999Z',
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
