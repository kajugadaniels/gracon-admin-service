// Query parameters for the paginated user list.
// Supports search, status filters, and date range filtering.
// All fields are optional — no filter = return all users paginated.
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsDateString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IdentityType } from '@gracon/database';

export class QueryUsersDto {
  @ApiPropertyOptional({
    description:
      'Full-text search across first name, last name, and email address. ' +
      'Case-insensitive. Partial matches are supported.',
    example: 'Ishimwe',
  })
  @IsOptional()
  @IsString()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filter by account active status. ' +
      'true = active accounts only. false = deactivated accounts only. ' +
      'Omit to return all.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value;
  })
  isActive?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by ID verification status. ' +
      'true = verified users only. false = unverified users only.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value;
  })
  isIdVerified?: boolean;

  @ApiPropertyOptional({
    description:
      'Filter by email verification status. ' +
      'true = email verified. false = email not yet verified.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value;
  })
  isVerified?: boolean;

  @ApiPropertyOptional({
    enum: IdentityType,
    description:
      'Filter by identity source. NID returns Rwandan citizen identity users; FIN returns foreign identity users with platform accounts.',
    example: IdentityType.FIN,
  })
  @IsOptional()
  @IsEnum(IdentityType)
  identityType?: IdentityType;

  @ApiPropertyOptional({
    description:
      'Return only users registered on or after this date (ISO 8601).',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description:
      'Return only users registered on or before this date (ISO 8601).',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    description: 'Page number. Starts at 1.',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description:
      'Number of users per page. Maximum 100. ' +
      'Requesting more than 100 per page is rejected.',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
