import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BookingService } from './booking.service';
import { BookingController } from './booking.controller';
import { AiModule } from '../ai/ai.module';
import { PrismaModule } from '../../common/prisma/prisma.module';

@Module({
  imports: [ConfigModule, AiModule, PrismaModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
