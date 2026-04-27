import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class DecryptSensitiveIdentifierDto {
  @ApiProperty({
    description:
      'Documented legitimate reason for revealing the full identifier. ' +
      'Every decrypt request is logged with this reason.',
    example:
      'Requested for a regulator-led account review tied to an active investigation case.',
    minLength: 20,
    maxLength: 500,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(500)
  reason: string;
}
