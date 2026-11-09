import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ConfigModule, WhatsappModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
