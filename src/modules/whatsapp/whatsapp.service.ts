import { createHash } from 'crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  VoicePipelineService,
  VOICE_NOTE_FALLBACK_REPLY,
} from '../voice-pipeline/voice-pipeline.service';
import { WhatsappApiClient } from './whatsapp-api.client';
import { FlaresendApiClient } from './flaresend-api.client';
import {
  IWhatsappClient,
  WHATSAPP_CLIENT,
} from './interfaces/whatsapp-provider.interface';
import { LlmImageInput } from '../ai/interfaces/llm-provider.interface';
import { WhatsappIdentityService } from './whatsapp-identity.service';
import {
  WhatsappContact,
  WhatsappTextMessage,
  WhatsappWebhookPayload,
} from './whatsapp-webhook.types';
import {
  FlaresendWebhookPayload,
  FlaresendMessageData,
  FlaresendImageMessage,
} from './flaresend-webhook.types';
import { WaboxappWebhookPayload } from './waboxapp-webhook.types';

const WABOXAPP_INBOUND_DEDUPE_TTL_MS = 30_000;
const MAX_TRACKED_WABOXAPP_INBOUND_MESSAGES = 1_000;

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly recentWaboxappInboundMessages = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly voicePipelineService: VoicePipelineService,
    @Inject(WHATSAPP_CLIENT)
    private readonly whatsappClient: IWhatsappClient,
    private readonly flaresendApiClient: FlaresendApiClient,
    private readonly metaApiClient: WhatsappApiClient,
    private readonly whatsappIdentityService: WhatsappIdentityService,
  ) {}

  /**
   * Normalizes a phone number / JID into pure international digits.
   * e.g., "254712345678@s.whatsapp.net", "+254712345678", or "254712345678" -> "254712345678"
   */
  public normalizePhoneNumber(phone: string): string {
    return (phone || '')
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@g\.us$/i, '')
      .replace(/[^\d]/g, '');
  }

  private normalizeWhatsappIdentity(value: string): string {
    const identity = value.trim();
    return identity.toLowerCase().endsWith('@lid')
      ? identity.toLowerCase()
      : this.normalizePhoneNumber(identity);
  }

  private isLid(identity: string): boolean {
    return identity.endsWith('@lid');
  }

  /**
   * Entry point for processing inbound webhooks from supported WhatsApp providers.
   * Dynamically inspects payload structure and delegates to the appropriate handler.
   */
  async processWebhookPayload(payload: any): Promise<void> {
    if (!payload || typeof payload !== 'object') {
      this.logger.warn('Received empty or invalid webhook payload.');
      return;
    }

    if (payload.event === 'message') {
      this.logger.log('Received Waboxapp message webhook.');
      await this.processWaboxappWebhook(payload as WaboxappWebhookPayload);
      return;
    }

    if (payload.event === 'ack') {
      const acknowledgment = payload.message?.ack ?? payload.m?.ack;
      const messageId = payload.m?.uid ?? payload.message?.uid ?? 'unknown';
      const customUid =
        payload.m?.custom_uid ?? payload.message?.custom_uid ?? 'unknown';
      const acknowledgmentStatus: Record<number, string> = {
        0: 'not sent to WhatsApp servers',
        1: 'sent to WhatsApp servers',
        2: 'delivered to recipient',
        3: 'read by recipient',
      };
      this.logger.log(
        `Waboxapp acknowledgment: status=${acknowledgmentStatus[acknowledgment ?? -1] ?? 'unknown'}, ` +
          `ack=${acknowledgment ?? 'unknown'}, messageId=${messageId}, customUid=${customUid}.`,
      );
      return;
    }

    // Detect Flaresend webhook payload
    if (
      payload.event === 'message_received' ||
      (payload.data && payload.data.from)
    ) {
      await this.processFlaresendWebhook(payload as FlaresendWebhookPayload);
      return;
    }

    // Detect Meta WhatsApp Cloud API webhook payload
    if (payload.object === 'whatsapp_business_account') {
      await this.processMetaWebhook(payload as WhatsappWebhookPayload);
      return;
    }

    this.logger.warn(
      `Ignoring webhook payload: unrecognized structure (event=${payload.event}, object=${payload.object})`,
    );
  }

  private async processWaboxappWebhook(
    payload: WaboxappWebhookPayload,
  ): Promise<void> {
    const expectedToken = this.configService.get<string>('WABOXAPP_API_TOKEN');
    if (!expectedToken) {
      this.logger.warn(
        'Rejecting Waboxapp webhook because WABOXAPP_API_TOKEN is not configured.',
      );
      return;
    }

    if (payload.token !== expectedToken) {
      this.logger.warn('Rejecting Waboxapp webhook: API token mismatch.');
      return;
    }

    const sender = payload.contact?.uid;
    if (!sender) {
      this.logger.warn(
        `Waboxapp message webhook missing sender (uid=${payload.uid ?? 'unknown'}).`,
      );
      return;
    }

    const normalizedPhone = this.normalizePhoneNumber(sender);
    if (!normalizedPhone) {
      this.logger.warn('Could not parse sender phone number from Waboxapp.');
      return;
    }

    const messageText = payload.message?.body?.text?.trim();
    if (!messageText) {
      const messageType = payload.message?.body?.type ?? 'unknown';
      this.logger.warn(
        `Skipping unsupported Waboxapp message type "${messageType}" ` +
          `(sender=***${normalizedPhone.slice(-4)}).`,
      );
      return;
    }

    if (
      this.whatsappClient.isRecentlySentTextMessage?.(
        normalizedPhone,
        messageText,
      )
    ) {
      this.logger.warn(
        `Ignoring Waboxapp webhook that echoes a recent outbound message ` +
          `(sender=***${normalizedPhone.slice(-4)}, textLength=${messageText.length}).`,
      );
      return;
    }

    const inboundMessageKey = createHash('sha256')
      .update(`${normalizedPhone}\0${messageText}`)
      .digest('hex');
    const now = Date.now();
    for (const [key, expiresAt] of this.recentWaboxappInboundMessages) {
      if (expiresAt <= now) {
        this.recentWaboxappInboundMessages.delete(key);
      }
    }

    if (
      (this.recentWaboxappInboundMessages.get(inboundMessageKey) ?? 0) > now
    ) {
      this.logger.warn(
        `Ignoring duplicate Waboxapp message without a provider message ID ` +
          `(sender=***${normalizedPhone.slice(-4)}, textLength=${messageText.length}).`,
      );
      return;
    }

    while (
      this.recentWaboxappInboundMessages.size >=
      MAX_TRACKED_WABOXAPP_INBOUND_MESSAGES
    ) {
      const oldestKey = this.recentWaboxappInboundMessages.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.recentWaboxappInboundMessages.delete(oldestKey);
    }
    this.recentWaboxappInboundMessages.set(
      inboundMessageKey,
      now + WABOXAPP_INBOUND_DEDUPE_TTL_MS,
    );

    const messageId = payload.message?.uid ?? '';
    this.logger.log(
      `Processing Waboxapp text message (sender=***${normalizedPhone.slice(-4)}, ` +
        `messageId=${messageId || 'unknown'}, textLength=${messageText.length}).`,
    );

    try {
      await this.handleUserTextMessage({
        senderId: normalizedPhone,
        fallbackPhone: normalizedPhone,
        messageId,
        messageText,
      });
      this.logger.log(
        `Finished processing Waboxapp message ${messageId || 'with unknown ID'} ` +
          `from ***${normalizedPhone.slice(-4)}.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process Waboxapp message ${messageId || 'with unknown ID'} ` +
          `from ***${normalizedPhone.slice(-4)}: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
      this.recentWaboxappInboundMessages.delete(inboundMessageKey);
      throw error;
    }
  }

  /**
   * Processes inbound webhook from Flaresend.
   */
  private async processFlaresendWebhook(
    payload: FlaresendWebhookPayload,
  ): Promise<void> {
    if (payload.event && payload.event !== 'message_received') {
      this.logger.debug(
        `Ignoring non-message Flaresend event: "${payload.event}"`,
      );
      return;
    }

    const data: FlaresendMessageData | undefined = payload.data;
    if (!data || !data.from) {
      this.logger.warn('Flaresend webhook missing message data or sender.');
      return;
    }

    // Ignore self-sent messages to avoid infinite loops
    if (data.fromMe === true || data.key?.fromMe === true) {
      return;
    }

    // Ignore WhatsApp status / broadcasts
    if (data.from === 'status@broadcast' || data.from.endsWith('@broadcast')) {
      return;
    }

    // Ignore group chats for private clinic bookings
    if (data.from.endsWith('@g.us')) {
      this.logger.debug(`Ignoring group message from ${data.from}`);
      return;
    }

    const whatsappId = this.normalizeWhatsappIdentity(data.from);
    if (!whatsappId) {
      this.logger.warn(
        'Could not parse WhatsApp sender identity from Flaresend.',
      );
      return;
    }

    const contactName = data.pushName || data.name || undefined;

    const imageMessage = data.message?.imageMessage;
    if (imageMessage) {
      const metadata: Record<string, unknown> = imageMessage;
      const fields = Object.keys(metadata)
        .filter((field) => /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(field))
        .sort()
        .slice(0, 30);
      const mimetype =
        typeof metadata.mimetype === 'string' &&
        /^[\w.+-]+\/[\w.+-]+$/.test(metadata.mimetype)
          ? metadata.mimetype
          : 'unknown';
      const rawSize = metadata.fileLength ?? metadata.fileSize;
      const fileSize =
        (typeof rawSize === 'number' &&
          Number.isSafeInteger(rawSize) &&
          rawSize >= 0) ||
        (typeof rawSize === 'string' && /^\d{1,15}$/.test(rawSize))
          ? String(rawSize)
          : 'unknown';

      this.logger.log(
        `Received Flaresend image metadata (fields=${fields.join(',') || 'none'}, ` +
          `mimetype=${mimetype}, fileSize=${fileSize}).`,
      );
    }

    const messageText =
      this.extractFlaresendMessageText(data) ??
      (imageMessage
        ? 'Please describe this image and share what you would like to know.'
        : null);
    if (messageText && /^\d{6}$/.test(messageText)) {
      const linked = await this.whatsappIdentityService.verifyLinkCode(
        whatsappId,
        messageText,
      );
      if (!linked) {
        return;
      }

      const confirmation =
        'Your phone number is verified and linked to this WhatsApp account. You can now message the dental assistant for help with dental care and appointments.';
      const user = await this.prisma.user.findUnique({
        where: { whatsappId },
        select: { id: true },
      });
      if (user) {
        await this.prisma.messageLog.create({
          data: {
            userId: user.id,
            role: 'assistant',
            content: confirmation,
          },
        });
      }

      await this.whatsappClient.sendTextMessage(linked.phone, confirmation);
      this.logger.log(
        `Sent registration confirmation to linked WhatsApp identity (${this.isLid(whatsappId) ? 'LID' : 'phone'}).`,
      );
      return;
    }

    // Handle inbound audio / voice notes
    if (data.message?.audioMessage) {
      const linkedUser = await this.prisma.user.findUnique({
        where: { whatsappId },
        select: { phone: true },
      });
      const recipientPhone =
        linkedUser?.phone ?? (this.isLid(whatsappId) ? undefined : whatsappId);
      if (!recipientPhone) {
        this.logger.warn('Ignoring voice note from an unlinked WhatsApp LID.');
        return;
      }
      let audioBuffer: Buffer;
      try {
        audioBuffer = await this.flaresendApiClient.downloadAudio(
          data.message.audioMessage,
        );
      } catch (error) {
        this.logger.warn(
          `Unable to download Flaresend voice note: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        await this.whatsappClient.sendTextMessage(
          recipientPhone,
          VOICE_NOTE_FALLBACK_REPLY,
        );
        return;
      }

      const result = await this.voicePipelineService.processVoicePipeline(
        audioBuffer,
        recipientPhone,
        undefined,
        whatsappId,
      );
      await this.whatsappClient.sendTextMessage(
        recipientPhone,
        result.patientMessage || VOICE_NOTE_FALLBACK_REPLY,
      );
      return;
    }

    if (!messageText) {
      this.logger.warn(
        `Received unsupported Flaresend message payload from ${this.isLid(whatsappId) ? 'LID' : 'phone identity'}; skipping.`,
      );
      return;
    }

    await this.handleUserTextMessage({
      senderId: whatsappId,
      fallbackPhone: this.isLid(whatsappId) ? undefined : whatsappId,
      messageId: data.id,
      messageText,
      contactName,
      imageMessage,
    });
  }

  /**
   * Processes inbound webhook from Meta WhatsApp Cloud API.
   * Preserved for direct Meta integration.
   */
  private async processMetaWebhook(
    payload: WhatsappWebhookPayload,
  ): Promise<void> {
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const { value } = change;

        if (!value.messages || value.messages.length === 0) {
          continue;
        }

        for (const message of value.messages) {
          const contact = value.contacts?.find(
            (item) => item.wa_id === message.from,
          );
          await this.handleMetaInboundMessage(message, contact);
        }
      }
    }
  }

  /**
   * Handles a single inbound Meta WhatsApp message (text or voice note).
   */
  private async handleMetaInboundMessage(
    message: WhatsappTextMessage,
    contact?: WhatsappContact,
  ): Promise<void> {
    try {
      await this.whatsappClient.markMessageAsRead(message.id);
    } catch {
      // Non-fatal; continue processing even if read receipt fails.
    }

    const normalizedPhone = this.normalizePhoneNumber(message.from);

    // Handle Inbound Voice Notes / Audio with Meta Graph API
    if (message.type === 'audio' && message.audio?.id) {
      this.logger.log(
        `Received Meta WhatsApp voice note (${message.audio.id}) from ${normalizedPhone}`,
      );
      try {
        const audioBuffer = await this.metaApiClient.downloadMedia(
          message.audio.id,
        );
        const result = await this.voicePipelineService.processVoicePipeline(
          audioBuffer,
          normalizedPhone,
        );
        const replyText =
          result.patientMessage || 'Ujumbe wako wa sauti umepokelewa. Asante!';
        await this.whatsappClient.sendTextMessage(normalizedPhone, replyText);
        return;
      } catch (error) {
        this.logger.error(
          `Failed to process Meta WhatsApp audio note from ${normalizedPhone}: ${error}`,
        );
        await this.whatsappClient.sendTextMessage(
          normalizedPhone,
          'Samahani, hatukuweza kusikiliza ujumbe wako wa sauti vizuri. Tafadhali jaribu kutuma tena au uandike kwa maneno.',
        );
        return;
      }
    }

    const messageText = this.extractMetaMessageText(message);
    if (!messageText) {
      this.logger.warn(
        `Received unsupported Meta message type "${message.type}" from ${normalizedPhone}; skipping.`,
      );
      return;
    }

    await this.handleUserTextMessage({
      senderId: normalizedPhone,
      fallbackPhone: normalizedPhone,
      messageId: message.id,
      messageText,
      contactName: contact?.profile?.name,
    });
  }

  /**
   * Shared business logic for processing user text messages across both Flaresend and Meta:
   * updates user profile, logs conversation, invokes AI engine, detects leads, and sends reply.
   */
  private async handleUserTextMessage(params: {
    senderId: string;
    fallbackPhone?: string;
    messageId: string;
    messageText: string;
    contactName?: string;
    imageMessage?: FlaresendImageMessage;
  }): Promise<void> {
    const {
      senderId,
      fallbackPhone,
      messageId,
      messageText,
      contactName,
      imageMessage,
    } = params;

    try {
      await this.whatsappClient.markMessageAsRead(messageId);
    } catch {
      // Non-fatal
    }

    let user = await this.prisma.user.findUnique({
      where: { whatsappId: senderId },
    });
    if (!user && !fallbackPhone) {
      this.logger.warn('Ignoring a message from an unlinked WhatsApp LID.');
      return;
    }

    if (!user && fallbackPhone) {
      user = await this.prisma.user.findUnique({
        where: { phone: fallbackPhone },
      });
    }

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          whatsappId: senderId,
          ...(contactName ? { name: contactName } : {}),
          ...(fallbackPhone && !user.phone ? { phone: fallbackPhone } : {}),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          whatsappId: senderId,
          phone: fallbackPhone,
          name: contactName,
        },
      });
    }

    const recipientPhone = user.phone ?? fallbackPhone;
    if (!recipientPhone) {
      this.logger.warn('Cannot reply because this user has no verified phone.');
      return;
    }

    const staticReply = this.configService
      .get<string>('WHATSAPP_STATIC_REPLY')
      ?.trim();
    let replyText: string;
    if (staticReply) {
      this.logger.log('Using WHATSAPP_STATIC_REPLY; skipping AI generation.');
      replyText = staticReply;
      await this.prisma.messageLog.createMany({
        data: [
          { userId: user.id, role: 'user', content: messageText },
          { userId: user.id, role: 'assistant', content: replyText },
        ],
      });
    } else {
      let image: LlmImageInput | undefined;
      if (imageMessage) {
        try {
          image = await this.flaresendApiClient.downloadImage(imageMessage);
        } catch (error) {
          replyText =
            'Sorry, I could not open that image. Please resend a clear JPEG, PNG, or WebP under 10 MB, or describe your question in text.';
          this.logger.warn(
            `Flaresend image processing failed: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          );
          await this.prisma.messageLog.createMany({
            data: [
              { userId: user.id, role: 'user', content: messageText },
              { userId: user.id, role: 'assistant', content: replyText },
            ],
          });
          await this.whatsappClient.sendTextMessage(recipientPhone, replyText);
          return;
        }
      }

      const result = await this.voicePipelineService.processTextPipeline(
        messageText,
        recipientPhone,
        undefined,
        undefined,
        senderId,
        image,
      );
      replyText = result.patientMessage;
    }

    await this.whatsappClient.sendTextMessage(recipientPhone, replyText);
  }

  /**
   * Extracts plain text from Flaresend / Baileys message shapes.
   */
  private extractFlaresendMessageText(
    data: FlaresendMessageData,
  ): string | null {
    const msg = data.message;
    if (!msg) return null;

    if (msg.conversation && typeof msg.conversation === 'string') {
      return msg.conversation.trim();
    }
    if (msg.extendedTextMessage?.text) {
      return msg.extendedTextMessage.text.trim();
    }
    if (msg.buttonsResponseMessage?.selectedDisplayText) {
      return msg.buttonsResponseMessage.selectedDisplayText.trim();
    }
    if (msg.templateButtonReplyMessage?.selectedDisplayText) {
      return msg.templateButtonReplyMessage.selectedDisplayText.trim();
    }
    if (msg.interactiveResponseMessage?.body?.text) {
      return msg.interactiveResponseMessage.body.text.trim();
    }
    if (msg.imageMessage?.caption) {
      return msg.imageMessage.caption.trim();
    }
    if (msg.videoMessage?.caption) {
      return msg.videoMessage.caption.trim();
    }

    return null;
  }

  /**
   * Extracts plain text from Meta Cloud API message shapes.
   */
  private extractMetaMessageText(message: WhatsappTextMessage): string | null {
    if (message.type === 'text' && message.text?.body) {
      return message.text.body.trim();
    }
    if (message.type === 'button' && message.button?.text) {
      return message.button.text.trim();
    }
    if (message.type === 'interactive') {
      if (message.interactive?.button_reply?.title) {
        return message.interactive.button_reply.title.trim();
      }
      if (message.interactive?.list_reply?.title) {
        return message.interactive.list_reply.title.trim();
      }
    }
    return null;
  }
}
