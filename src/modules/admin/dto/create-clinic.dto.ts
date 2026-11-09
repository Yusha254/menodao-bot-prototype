import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateClinicDto {
  @ApiProperty({ example: 'BrightSmile Dental - Downtown' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: '120 Main Street' })
  @IsString()
  @MinLength(2)
  address: string;

  @ApiProperty({ example: 'Nairobi' })
  @IsString()
  @MinLength(2)
  city: string;

  @ApiProperty({ example: '+254700111222' })
  @IsString()
  @MinLength(6)
  phone: string;

  @ApiProperty({
    example: ['General Checkup', 'Teeth Cleaning', 'Root Canal'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  services: string[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateClinicDto extends PartialType(CreateClinicDto) {}
