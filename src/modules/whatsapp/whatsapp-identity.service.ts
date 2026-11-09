import { createHash, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  IWhatsappClient,
  WHATSAPP_CLIENT,
} from './interfaces/whatsapp-provider.interface';

const PAIRING_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_REQUESTS_PER_HOUR = 5;
const CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const MAX_TRACKED_SENDERS = 10_000;

@Injectable()
export class WhatsappIdentityService {
  private readonly logger = new Logger(WhatsappIdentityService.name);
  private readonly codeAttempts = new Map<
    string,
    { attempts: number; expiresAt: number }
  >();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(WHATSAPP_CLIENT)
    private readonly whatsappClient: IWhatsappClient,
  ) {}

  async startPhoneLinking(rawPhone: string): Promise<void> {
    const phone = this.normalizePhone(rawPhone);
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    await this.prisma.phoneRegistrationChallenge.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(now.getTime() - CHALLENGE_RETENTION_MS),
        },
      },
    });
    const recentRequest =
      await this.prisma.phoneRegistrationChallenge.findFirst({
        where: {
          phone,
          createdAt: { gte: new Date(now.getTime() - RESEND_COOLDOWN_MS) },
        },
        select: { id: true },
      });

    if (recentRequest) {
      throw new HttpException(
        'Please wait one minute before requesting another code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const requestCount = await this.prisma.phoneRegistrationChallenge.count({
      where: { phone, createdAt: { gte: hourAgo } },
    });
    if (requestCount >= MAX_REQUESTS_PER_HOUR) {
      throw new HttpException(
        'Too many linking codes were requested for this number. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = randomUUID();
    const code = randomInt(100000, 1000000).toString();

    await this.prisma.phoneRegistrationChallenge.updateMany({
      where: { phone, linkedAt: null, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });

    await this.prisma.phoneRegistrationChallenge.create({
      data: {
        id,
        phone,
        codeHash: this.hashCode(id, code),
        expiresAt: new Date(now.getTime() + PAIRING_TTL_MS),
        consentedAt: now,
      },
    });

    try {
      await this.whatsappClient.sendTextMessage(
        phone,
        `Your WhatsApp verification code is:\n\n${code}\n\nReply to this chat with the 6-digit code to finish linking your number. It expires in 10 minutes.`,
      );
    } catch (error) {
      try {
        await this.prisma.phoneRegistrationChallenge.update({
          where: { id },
          data: { expiresAt: new Date() },
        });
      } catch (cleanupError) {
        this.logger.error(
          `Could not invalidate failed phone linking challenge ${id}: ${
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError)
          }`,
        );
      }
      throw error;
    }
  }

  async verifyLinkCode(
    whatsappId: string,
    input: string,
  ): Promise<{ phone: string } | null> {
    const code = input.trim();
    if (!/^\d{6}$/.test(code) || !this.canAttemptCode(whatsappId)) {
      return null;
    }

    const now = new Date();
    const activeChallenges =
      await this.prisma.phoneRegistrationChallenge.findMany({
        where: { expiresAt: { gt: now } },
        select: {
          id: true,
          phone: true,
          codeHash: true,
          expiresAt: true,
          consentedAt: true,
        },
      });
    const challenge = activeChallenges.find((candidate) =>
      this.matchesCode(candidate.id, code, candidate.codeHash),
    );

    if (!challenge) {
      this.recordFailedAttempt(whatsappId);
      this.logger.warn('Rejected invalid or expired WhatsApp linking code.');
      return null;
    }

    return this.prisma.$transaction(async (transaction) => {
      const currentChallenge =
        await transaction.phoneRegistrationChallenge.findUnique({
          where: { id: challenge.id },
        });
      if (!currentChallenge || currentChallenge.expiresAt <= new Date()) {
        return null;
      }

      if (currentChallenge.linkedAt) {
        if (currentChallenge.linkedWhatsappId !== whatsappId) {
          return null;
        }
        this.codeAttempts.delete(whatsappId);
        return { phone: challenge.phone };
      }

      const linkedUser = await transaction.user.findUnique({
        where: { whatsappId },
        select: { id: true, phone: true },
      });
      if (linkedUser?.phone && linkedUser.phone !== challenge.phone) {
        return null;
      }

      const legacyPhoneUser = linkedUser
        ? null
        : await transaction.user.findUnique({
            where: { whatsappId: challenge.phone },
            select: { id: true, phone: true },
          });
      if (legacyPhoneUser?.phone && legacyPhoneUser.phone !== challenge.phone) {
        return null;
      }

      const phoneOwner = await transaction.user.findUnique({
        where: { phone: challenge.phone },
        select: { id: true },
      });
      const existingUserId = linkedUser?.id ?? legacyPhoneUser?.id;
      if (phoneOwner && phoneOwner.id !== existingUserId) {
        return null;
      }

      const claimedChallenge =
        await transaction.phoneRegistrationChallenge.updateMany({
          where: {
            id: challenge.id,
            linkedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { linkedAt: new Date(), linkedWhatsappId: whatsappId },
        });
      if (claimedChallenge.count !== 1) {
        throw new HttpException(
          'This verification code has already been used or expired.',
          HttpStatus.CONFLICT,
        );
      }

      if (linkedUser) {
        await transaction.user.update({
          where: { whatsappId },
          data: {
            phone: challenge.phone,
            phoneVerifiedAt: now,
            phoneConsentAt: challenge.consentedAt,
          },
        });
      } else if (legacyPhoneUser) {
        await transaction.user.update({
          where: { id: legacyPhoneUser.id },
          data: {
            whatsappId,
            phone: challenge.phone,
            phoneVerifiedAt: now,
            phoneConsentAt: challenge.consentedAt,
          },
        });
      } else {
        await transaction.user.create({
          data: {
            whatsappId,
            phone: challenge.phone,
            phoneVerifiedAt: now,
            phoneConsentAt: challenge.consentedAt,
          },
        });
      }

      this.codeAttempts.delete(whatsappId);
      this.logger.log(
        `Linked verified phone to WhatsApp identity (${whatsappId.endsWith('@lid') ? 'LID' : 'phone'}).`,
      );
      return { phone: challenge.phone };
    });
  }

  private canAttemptCode(whatsappId: string): boolean {
    const now = Date.now();
    for (const [sender, attempt] of this.codeAttempts) {
      if (attempt.expiresAt <= now) {
        this.codeAttempts.delete(sender);
      }
    }

    const attempt = this.codeAttempts.get(whatsappId);
    if (attempt && attempt.expiresAt > now) {
      return attempt.attempts < MAX_CODE_ATTEMPTS;
    }

    return true;
  }

  private recordFailedAttempt(whatsappId: string): void {
    if (!this.codeAttempts.has(whatsappId)) {
      while (this.codeAttempts.size >= MAX_TRACKED_SENDERS) {
        const oldestSender = this.codeAttempts.keys().next().value;
        if (oldestSender === undefined) {
          break;
        }
        this.codeAttempts.delete(oldestSender);
      }
    }

    const now = Date.now();
    const previous = this.codeAttempts.get(whatsappId);
    this.codeAttempts.set(
      whatsappId,
      previous && previous.expiresAt > now
        ? { attempts: previous.attempts + 1, expiresAt: previous.expiresAt }
        : { attempts: 1, expiresAt: now + ATTEMPT_WINDOW_MS },
    );
  }

  private matchesCode(id: string, code: string, expectedHash: string): boolean {
    const actualHash = this.hashCode(id, code);
    const actual = Buffer.from(actualHash, 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hashCode(id: string, code: string): string {
    return this.hash(`${id}:${code}`);
  }

  private normalizePhone(rawPhone: string): string {
    const trimmed = rawPhone.trim();
    const compact = trimmed.replace(/[\s().-]/g, '');
    if (!/^\+?[1-9]\d{7,14}$/.test(compact)) {
      throw new BadRequestException(
        'Enter a valid phone number in international format, including its country code.',
      );
    }
    return compact.replace(/^\+/, '');
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
