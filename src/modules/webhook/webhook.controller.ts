import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { WhatsappService } from '../whatsapp/whatsapp.service';

@ApiTags('Webhook')
@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
  ) {}

  /**
   * Webhook verification endpoint.
   * - For Meta: checks hub.verify_token and echoes back hub.challenge.
   * - For WhatsApp providers / General: returns 200 OK to confirm the webhook URL is active.
   */
  @Get()
  @ApiOperation({
    summary: 'Webhook verification handshake',
    description:
      'Handles Meta Cloud API verification (hub.challenge) and provider endpoint pings.',
  })
  handleVerification(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    // 1. Meta verification handshake
    if (mode || verifyToken || challenge) {
      const expectedToken = this.configService.get<string>(
        'WEBHOOK_VERIFY_TOKEN',
      );

      if (mode === 'subscribe' && verifyToken === expectedToken) {
        this.logger.log('Meta webhook verification succeeded.');
        res.status(HttpStatus.OK).send(challenge);
        return;
      }

      this.logger.warn('Meta webhook verification failed: token mismatch.');
      throw new ForbiddenException('Webhook verification token mismatch.');
    }

    // 2. Provider or monitoring verification ping
    this.logger.log('Webhook verification ping received.');
    res
      .status(HttpStatus.OK)
      .json({ status: 'ok', message: 'Webhook endpoint active' });
  }

  /**
   * Receives inbound WhatsApp events from supported providers.
   * Responds 200 OK immediately and processes the message asynchronously.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleEvent(@Body() payload: any): Promise<{ status: string }> {
    if (payload?.event === 'message') {
      this.logger.log(
        `Waboxapp webhook received: event=message, uid=${payload.uid ?? 'unknown'}, ` +
          `messageId=${payload.message?.uid ?? 'unknown'}, ` +
          `messageType=${payload.message?.body?.type ?? 'unknown'}, ` +
          `textLength=${payload.message?.body?.text?.length ?? 0}.`,
      );
    } else if (payload?.event === 'ack') {
      const acknowledgment = payload.message?.ack ?? payload.m?.ack;
      this.logger.log(
        `Waboxapp webhook received: event=ack, ack=${acknowledgment ?? 'unknown'}, ` +
          `messageId=${payload.m?.uid ?? payload.message?.uid ?? 'unknown'}, ` +
          `customUid=${payload.m?.custom_uid ?? payload.message?.custom_uid ?? 'unknown'}.`,
      );
    } else if (payload?.event === 'message_received') {
      const message = payload.data?.message;
      const messageText =
        message?.conversation ?? message?.extendedTextMessage?.text ?? '';
      const sender = payload.data?.from ?? '';
      this.logger.log(
        `Flaresend webhook received: event=message_received, ` +
          `senderType=${sender.endsWith('@lid') ? 'lid' : 'phone'}, ` +
          `messageId=${payload.data?.id ?? 'unknown'}, ` +
          `textLength=${typeof messageText === 'string' ? messageText.length : 0}.`,
      );
    } else {
      this.logger.log(
        `Webhook received: event=${payload?.event ?? 'unknown'}, payload omitted.`,
      );
    }

    this.whatsappService.processWebhookPayload(payload).catch((error) => {
      this.logger.error(
        `Unhandled error while processing webhook payload: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    return { status: 'received' };
  }

  /**
   * Dedicated Flaresend endpoint alias (/webhook/flaresend).
   * Supports users who specify /webhook/flaresend in their dashboard.
   */
  @Post('flaresend')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleFlaresendEvent(
    @Body() payload: any,
  ): Promise<{ status: string }> {
    return this.handleEvent(payload);
  }

  /**
   * Dedicated Waboxapp endpoint alias (/webhook/waboxapp).
   */
  @Post('waboxapp')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async handleWaboxappEvent(@Body() payload: any): Promise<{ status: string }> {
    return this.handleEvent(payload);
  }
}
