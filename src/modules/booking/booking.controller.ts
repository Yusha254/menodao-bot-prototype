import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BookingService } from './booking.service';

@ApiTags('Appointments & Bookings')
@Controller('api/v1/appointments')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Get()
  @ApiOperation({ summary: 'List all booked appointments/events' })
  async getAppointments(@Query('status') status?: string) {
    return this.bookingService.getAllAppointments(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment details by ID' })
  async getAppointmentById(@Param('id') id: string) {
    return this.bookingService.getAppointmentById(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update appointment status (CONFIRMED, CANCELLED, COMPLETED)',
  })
  async updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.bookingService.updateStatus(id, status);
  }

  @Post('manual')
  @ApiOperation({ summary: 'Manually create or simulate booking from message' })
  async createFromMessage(
    @Body('text') text: string,
    @Body('senderPhone') senderPhone?: string,
  ) {
    return this.bookingService.bookFromTranscript(
      text,
      senderPhone || '+254712345678',
    );
  }
}
