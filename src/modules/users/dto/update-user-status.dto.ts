import { IsBoolean, IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserStatusDto {
  @ApiProperty({
    description:
      'Set to true to activate the account. ' +
      'Set to false to deactivate it. ' +
      'A deactivated user cannot log in and all their active sessions ' +
      'are immediately revoked.',
    example: false,
  })
  @IsBoolean()
  isActive: boolean;

  @ApiPropertyOptional({
    description:
      'Reason for the status change. ' +
      'Recorded in AdminAuditLog.metadata. ' +
      'Required when deactivating — strongly recommended always.',
    example: 'Suspicious login pattern detected from multiple countries.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
