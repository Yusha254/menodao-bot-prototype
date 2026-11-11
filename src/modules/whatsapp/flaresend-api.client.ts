import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  createDecipheriv,
  createHmac,
  hkdfSync,
  timingSafeEqual,
} from 'crypto';
import { Readable } from 'stream';
import { LlmImageInput } from '../ai/interfaces/llm-provider.interface';
import { IWhatsappClient } from './interfaces/whatsapp-provider.interface';
import {
  FlaresendAudioMessage,
  FlaresendImageMessage,
} from './flaresend-webhook.types';

interface FlaresendSendResponse {
  success?: boolean;
  failed_recipients?: string[];
  invalid_recipients?: string[];
}

const MAX_INBOUND_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ENCRYPTED_IMAGE_BYTES = MAX_INBOUND_IMAGE_BYTES + 26;
const MAX_INBOUND_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_ENCRYPTED_AUDIO_BYTES = MAX_INBOUND_AUDIO_BYTES + 26;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const SUPPORTED_AUDIO_TYPES = new Set(['audio/ogg', 'audio/opus']);

@Injectable()
export class FlaresendApiClient implements IWhatsappClient {
  private readonly logger = new Logger(FlaresendApiClient.name);
  private readonly http: AxiosInstance;
  private readonly mediaHttp: AxiosInstance;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('FLARESEND_BASE_URL') ??
      'https://api.flaresend.com';
    this.apiKey = this.configService.get<string>('FLARESEND_API_KEY') ?? '';

    this.http = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    this.mediaHttp = axios.create({
      timeout: 15000,
      maxRedirects: 0,
      maxContentLength: MAX_ENCRYPTED_AUDIO_BYTES,
      maxBodyLength: MAX_ENCRYPTED_AUDIO_BYTES,
    });
  }

  /**
   * Cleans a phone number / JID into pure international digits without '+' or '@s.whatsapp.net'
   * e.g., "254712345678@s.whatsapp.net" or "+254712345678" -> "254712345678"
   */
  private formatRecipient(to: string): string {
    return to
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@g\.us$/i, '')
      .replace(/[^\d]/g, '');
  }

  private maskRecipient(recipient: string): string {
    return `***${recipient.slice(-4)}`;
  }

  /**
   * Sends a plain text message to a WhatsApp user via the FlareSend API.
   * Endpoint: POST /send-message
   */
  async sendTextMessage(to: string, body: string): Promise<void> {
    const recipient = this.formatRecipient(to);

    if (!recipient) {
      this.logger.error('Cannot send message: invalid recipient phone.');
      throw new Error('Invalid recipient phone.');
    }

    try {
      const response = await this.http.post<FlaresendSendResponse>(
        '/send-message',
        {
          recipients: [recipient],
          type: 'text',
          text: body,
        },
      );

      const data = response.data;
      const matchesRecipient = (entries: string[] | undefined) =>
        entries?.some((entry) => this.formatRecipient(entry) === recipient) ??
        false;

      if (matchesRecipient(data?.invalid_recipients)) {
        this.logger.warn(
          `FlareSend recipient ${this.maskRecipient(recipient)} is not registered on WhatsApp.`,
        );
        throw new Error('Recipient is not registered on WhatsApp.');
      }

      if (matchesRecipient(data?.failed_recipients)) {
        this.logger.error(
          `FlareSend message delivery failed for ${this.maskRecipient(recipient)}.`,
        );
        throw new Error('WhatsApp message delivery failed.');
      }

      if (data?.success !== true) {
        throw new Error('FlareSend did not confirm the message was sent.');
      }

      this.logger.log(
        `FlareSend sent a text message to ${this.maskRecipient(recipient)}.`,
      );
    } catch (error) {
      const details = axios.isAxiosError(error)
        ? `HTTP ${error.response?.status ?? 'no response'}`
        : error instanceof Error
          ? error.message
          : 'Unknown error';
      this.logger.error(
        `Failed to send FlareSend WhatsApp message to ${this.maskRecipient(recipient)}: ${details}`,
      );
      throw error;
    }
  }

  /**
   * Marks an inbound message as read.
   * FlareSend handles session state internally or does not expose a mark-as-read endpoint.
   */
  async markMessageAsRead(messageId: string): Promise<void> {
    this.logger.debug(
      `FlareSend does not require manual mark-as-read for message ${messageId}.`,
    );
  }

  async downloadImage(message: FlaresendImageMessage): Promise<LlmImageInput> {
    const mimeType = message.mimetype?.split(';')[0]?.toLowerCase();
    if (!mimeType || !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
      throw new Error('Unsupported WhatsApp image type.');
    }

    const imageData = await this.downloadAndDecryptMedia(
      message,
      'Image',
      MAX_INBOUND_IMAGE_BYTES,
    );

    if (!this.hasValidImageSignature(imageData, mimeType)) {
      throw new Error('WhatsApp image content does not match its media type.');
    }

    return { mimeType, data: imageData };
  }

  async downloadAudio(message: FlaresendAudioMessage): Promise<Buffer> {
    const mimeType = message.mimetype?.split(';')[0]?.toLowerCase();
    if (!mimeType || !SUPPORTED_AUDIO_TYPES.has(mimeType)) {
      throw new Error('Unsupported WhatsApp voice note type.');
    }

    const audioData = await this.downloadAndDecryptMedia(
      message,
      'Audio',
      MAX_INBOUND_AUDIO_BYTES,
    );
    if (!audioData.subarray(0, 4).equals(Buffer.from('OggS'))) {
      throw new Error(
        'WhatsApp voice note content is not a valid Ogg audio file.',
      );
    }

    return audioData;
  }

  /**
   * Downloads and decrypts encrypted media from WhatsApp's trusted media hosts.
   */
  private async downloadAndDecryptMedia(
    message: FlaresendImageMessage,
    mediaType: 'Image' | 'Audio',
    maxBytes: number,
  ): Promise<Buffer> {
    const mediaName = mediaType.toLowerCase();
    const maxEncryptedBytes = maxBytes + 26;
    const mediaKey = this.decodeMediaKey(message.mediaKey, mediaName);
    const declaredSize = this.readFileSize(
      message.fileLength ?? message.fileSize,
      mediaName,
    );
    if (declaredSize !== undefined && declaredSize > maxBytes) {
      throw new Error(
        `WhatsApp ${mediaName} exceeds the maximum supported size.`,
      );
    }

    const mediaUrl = this.getMediaUrl(message, mediaName);
    let response: AxiosResponse<Readable>;
    try {
      response = await this.mediaHttp.get<Readable>(mediaUrl.toString(), {
        responseType: 'stream',
      });
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      this.logger.warn(
        `Flaresend ${mediaName} download failed (${status ? `HTTP ${status}` : 'network error'}).`,
      );
      throw new Error(`Unable to download the WhatsApp ${mediaName}.`);
    }

    const responseSize = Number(response.headers['content-length']);
    if (Number.isFinite(responseSize) && responseSize > maxEncryptedBytes) {
      response.data.destroy();
      throw new Error(
        `WhatsApp ${mediaName} exceeds the maximum supported size.`,
      );
    }

    const encryptedChunks: Buffer[] = [];
    let encryptedSize = 0;
    try {
      for await (const chunk of response.data) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        encryptedSize += bytes.length;
        if (encryptedSize > maxEncryptedBytes) {
          response.data.destroy();
          throw new Error(
            `WhatsApp ${mediaName} exceeds the maximum supported size.`,
          );
        }
        encryptedChunks.push(bytes);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          `WhatsApp ${mediaName} exceeds the maximum supported size.`
      ) {
        throw error;
      }
      this.logger.warn(`Flaresend ${mediaName} download stream failed.`);
      throw new Error(`Unable to download the WhatsApp ${mediaName}.`);
    }
    const encrypted = Buffer.concat(encryptedChunks, encryptedSize);

    if (encrypted.length < 26 || encrypted.length > maxEncryptedBytes) {
      throw new Error(`WhatsApp ${mediaName} has an invalid encrypted size.`);
    }

    const ciphertext = encrypted.subarray(0, -10);
    const receivedMac = encrypted.subarray(-10);
    const expandedKeys = Buffer.from(
      hkdfSync(
        'sha256',
        mediaKey,
        Buffer.alloc(0),
        Buffer.from(`WhatsApp ${mediaType} Keys`),
        112,
      ),
    );
    const iv = expandedKeys.subarray(0, 16);
    const cipherKey = expandedKeys.subarray(16, 48);
    const macKey = expandedKeys.subarray(48, 80);
    const expectedMac = createHmac('sha256', macKey)
      .update(iv)
      .update(ciphertext)
      .digest()
      .subarray(0, 10);

    if (!timingSafeEqual(receivedMac, expectedMac)) {
      throw new Error(`WhatsApp ${mediaName} integrity verification failed.`);
    }

    let mediaData: Buffer;
    try {
      const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv);
      mediaData = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
    } catch {
      throw new Error(`Unable to decrypt the WhatsApp ${mediaName}.`);
    }

    if (
      mediaData.length === 0 ||
      mediaData.length > maxBytes ||
      (declaredSize !== undefined && mediaData.length !== declaredSize)
    ) {
      throw new Error(`WhatsApp ${mediaName} has an invalid size.`);
    }

    return mediaData;
  }

  async downloadMedia(mediaId: string): Promise<Buffer> {
    const errorMsg = `Media download is not supported by FlareSend API for media ID: ${mediaId}.`;
    this.logger.warn(errorMsg);
    throw new Error(errorMsg);
  }

  private decodeMediaKey(value: unknown, mediaName: string): Buffer {
    let mediaKey: Buffer;
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      mediaKey = Buffer.from(value);
    } else if (typeof value === 'string') {
      const base64 = value
        .replace(/^data:[^,]*;base64,/, '')
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        throw new Error(`WhatsApp ${mediaName} is missing a valid media key.`);
      }
      mediaKey = Buffer.from(base64, 'base64');
    } else if (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      value.type === 'Buffer' &&
      'data' in value &&
      Array.isArray(value.data) &&
      value.data.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
      )
    ) {
      mediaKey = Buffer.from(value.data);
    } else {
      throw new Error(`WhatsApp ${mediaName} is missing a valid media key.`);
    }

    if (mediaKey.length !== 32) {
      throw new Error(`WhatsApp ${mediaName} has an invalid media key.`);
    }
    return mediaKey;
  }

  private readFileSize(value: unknown, mediaName: string): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const fileSize =
      typeof value === 'number'
        ? value
        : typeof value === 'string' && /^\d{1,15}$/.test(value)
          ? Number(value)
          : NaN;
    if (!Number.isSafeInteger(fileSize) || fileSize < 0) {
      throw new Error(`WhatsApp ${mediaName} has an invalid file size.`);
    }
    return fileSize;
  }

  private getMediaUrl(message: FlaresendImageMessage, mediaName: string): URL {
    let mediaUrl: URL;
    try {
      if (message.url) {
        mediaUrl = new URL(message.url);
      } else if (
        message.directPath?.startsWith('/') &&
        !message.directPath.startsWith('//') &&
        !message.directPath.includes('\\')
      ) {
        mediaUrl = new URL(message.directPath, 'https://mmg.whatsapp.net');
      } else {
        throw new Error('Missing media URL.');
      }
    } catch {
      throw new Error(`WhatsApp ${mediaName} has an invalid media URL.`);
    }

    const hostname = mediaUrl.hostname.toLowerCase();
    if (
      mediaUrl.protocol !== 'https:' ||
      (hostname !== 'whatsapp.net' && !hostname.endsWith('.whatsapp.net')) ||
      (mediaUrl.port !== '' && mediaUrl.port !== '443') ||
      mediaUrl.username !== '' ||
      mediaUrl.password !== ''
    ) {
      throw new Error(`WhatsApp ${mediaName} has an unsupported media URL.`);
    }
    return mediaUrl;
  }

  private hasValidImageSignature(data: Buffer, mimeType: string): boolean {
    switch (mimeType) {
      case 'image/jpeg':
        return (
          data.length >= 3 &&
          data[0] === 0xff &&
          data[1] === 0xd8 &&
          data[2] === 0xff
        );
      case 'image/png':
        return data
          .subarray(0, 8)
          .equals(
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
          );
      case 'image/webp':
        return (
          data.length >= 12 &&
          data.toString('ascii', 0, 4) === 'RIFF' &&
          data.toString('ascii', 8, 12) === 'WEBP'
        );
      default:
        return false;
    }
  }
}
