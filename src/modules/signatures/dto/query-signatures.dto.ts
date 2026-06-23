// Query parameters for the paginated admin signatures list.
// All fields are optional — no filter = return every key pair across all
// users, paginated. The shape mirrors the admin frontend's
// `SignatureFilters` type so wiring stays one-to-one.
import {
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  IsIn,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PersonalKeyAlgorithm } from '@gracon/database';

/**
 * Public-facing status of a signature on the admin dashboard.
 * Derived in the service layer from the linked certificate's revocation
 * state and the key pair's `isActive` flag.
 */
export type AdminSignatureStatusFilter = 'ACTIVE' | 'REVOKED';

const ALGORITHMS: PersonalKeyAlgorithm[] = ['RSA_2048', 'ED25519'];
const STATUSES: AdminSignatureStatusFilter[] = ['ACTIVE', 'REVOKED'];

export class QuerySignaturesDto {
  @ApiPropertyOptional({
    description:
      'Full-text search across the signer\'s display name and email. ' +
      'Case-insensitive partial match.',
    example: 'Ishimwe',
  })
  @IsOptional()
  @IsString()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by signature key algorithm.',
    enum: ALGORITHMS,
  })
  @IsOptional()
  @IsIn(ALGORITHMS)
  algorithm?: PersonalKeyAlgorithm;

  @ApiPropertyOptional({
    description:
      'Filter by signature status. ACTIVE means the key pair is active and ' +
      'its certificate is not revoked; REVOKED means either side has been revoked.',
    enum: STATUSES,
  })
  @IsOptional()
  @IsIn(STATUSES)
  status?: AdminSignatureStatusFilter;

  @ApiPropertyOptional({
    description: 'Lower bound on key pair createdAt (ISO 8601).',
    example: '2024-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    description: 'Upper bound on key pair createdAt (ISO 8601).',
    example: '2024-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based).', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Page size (max 100).',
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
