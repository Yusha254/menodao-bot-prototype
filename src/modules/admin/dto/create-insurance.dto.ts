import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInsuranceDto {
  @ApiProperty({ example: 'BrightSmile Family Plus' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 35.0 })
  @IsNumber()
  @Min(0)
  monthlyCost: number;

  @ApiProperty({
    example: ['4 free cleanings per year', '40% off orthodontics'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  coveragePerks: string[];

  @ApiProperty({
    example: 'https://brightsmile.example.com/insurance/family-plus',
  })
  @IsUrl({ require_tld: false })
  signupUrl: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateInsuranceDto extends PartialType(CreateInsuranceDto) {}
