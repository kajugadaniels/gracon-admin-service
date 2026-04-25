// Query parameters for the paginated admin certificates list.
// Mirrors the admin frontend's `CertificateFilters` shape one-to-one.
import {
  IsOptional,
  IsString,
  IsInt,
  IsBoolean,
  IsIn,
  Min,
  Max,
  Length,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** Identity types currently issued certificates for. */
export type AdminCertificateIdentityType = 'NID' | 'FIN';

/** Public-facing status of a certificate as shown on the dashboard. */
export type AdminCertificateStatusFilter = 'ACTIVE' | 'EXPIRED' | 'REVOKED';

const IDENTITY_TYPES: AdminCertificateIdentityType[] = ['NID', 'FIN'];
const STATUSES: AdminCertificateStatusFilter[] = ['ACTIVE', 'EXPIRED', 'REVOKED'];

export class QueryCertificatesDto {
  @ApiPropertyOptional({
    description:
      'Search across the certificate subject CN and the owner email.',
    example: 'Ishimwe',
  })
  @IsOptional()
  @IsString()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({
    description:
      'Filter by identity type. NID = national ID holder, FIN = foreign identity.',
    enum: IDENTITY_TYPES,
  })
  @IsOptional()
  @IsIn(IDENTITY_TYPES)
  identityType?: AdminCertificateIdentityType;

  @ApiPropertyOptional({
    description:
      'Filter by certificate status. EXPIRED is derived from notAfter < now; ' +
      'REVOKED is the persisted flag; ACTIVE is everything else.',
    enum: STATUSES,
  })
  @IsOptional()
  @IsIn(STATUSES)
  status?: AdminCertificateStatusFilter;

  @ApiPropertyOptional({
    description: 'ISO alpha-2 country code from the certificate subject.',
    example: 'RW',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;

  @ApiPropertyOptional({
    description:
      'When true, only return certificates expiring within the next 30 days.',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value;
  })
  expiringSoon?: boolean;

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
