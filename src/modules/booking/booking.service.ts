/**
 * booking.service.ts
 *
 * Multi-turn, deterministic appointment booking service.
 *
 * State machine:
 *   COLLECTING  →  (all fields valid)  →  AWAITING_CONFIRMATION
 *   AWAITING_CONFIRMATION  →  (CONFIRM)  →  Appointment created + draft deleted
 *   Any state  →  (CANCEL_BOOKING / DECLINE while COLLECTING)  →  draft deleted
 *
 * The LLM only EXTRACTS. Every branch decision is made by TypeScript code.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  BookingDraft,
  Clinic,
  MessageLog,
  PrismaClient,
} from '../../generated/prisma/client';
import { DateTime } from 'luxon';
import {
  ILlmProvider,
  LLM_PROVIDER,
} from '../ai/interfaces/llm-provider.interface';
import {
  BOOKING_EXTRACTION_SYSTEM_PROMPT,
  buildBookingExtractionPrompt,
} from '../../prompts';
import {
  BookingConfig,
  DEFAULT_TZ,
  DEFAULT_OPEN_DAYS,
  DEFAULT_OPEN_TIME,
  DEFAULT_CLOSE_TIME,
  DEFAULT_SLOT_MINUTES,
  anchors,
  nairobiNow,
  toScheduledAt,
  validateSlot,
  daySlots,
  openDayNames,
  snapToSlot,
} from './booking-time.util';
import {
  BookingLang,
  t,
  ASK_SERVICE,
  ASK_DATE_TIME,
  ASK_NAME,
  ASK_CLINIC,
  CLINIC_NOT_FOUND,
  SERVICE_NOT_OFFERED,
  SLOT_PAST,
  SLOT_CLOSED_DAY,
  SLOT_OUTSIDE_HOURS,
  SLOT_NOT_ON_BOUNDARY,
  SLOT_TAKEN,
  READ_BACK,
  BOOKING_AWAITING_CONFIRMATION,
  BOOKING_CONFIRMED,
  EMERGENCY_GUIDANCE,
  BOOKING_CANCELLED,
  PARSE_FAILURE,
} from './booking.messages';
import { IsIn, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

// ── Extraction result shape ───────────────────────────────────────────────────

type BookingAction =
  | 'PROVIDE_DETAILS'
  | 'CONFIRM'
  | 'DECLINE'
  | 'CANCEL_BOOKING'
  | 'UNRELATED';

class BookingExtractionResult {
  @IsIn(['PROVIDE_DETAILS', 'CONFIRM', 'DECLINE', 'CANCEL_BOOKING', 'UNRELATED'])
  action!: BookingAction;

  @IsOptional()
  @IsString()
  clientName?: string | null;

  @IsOptional()
  @IsString()
  service?: string | null;

  @IsOptional()
  @IsString()
  clinicName?: string | null;

  @IsOptional()
  @IsString()
  preferredDate?: string | null;

  @IsOptional()
  @IsString()
  preferredTime?: string | null;

  @IsOptional()
  @IsString()
  rawDateMentioned?: string | null;

  @IsIn(['en', 'sw'])
  language!: string;

  triageFlag!: boolean;

  @IsNumber()
  confidence!: number;
}

// ── Public result types ───────────────────────────────────────────────────────

export interface BookingResult {
  success: boolean;
  appointmentId?: string;
  clientName?: string;
  scheduledAt?: Date;
  scheduledAtFormatted?: string;
  service?: string;
  clinicName?: string;
  confirmationMessage: string;
  error?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);
  private readonly cfg: BookingConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILlmProvider,
  ) {
    this.cfg = this.loadConfig();
  }

  // ── Config ────────────────────────────────────────────────────────────────

  private loadConfig(): BookingConfig {
    const parseOpenDays = (raw: string | undefined): number[] => {
      if (!raw) return DEFAULT_OPEN_DAYS;
      return raw.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
    };

    return {
      timezone: this.configService.get<string>('BOOKING_TIMEZONE') ?? DEFAULT_TZ,
      openDays: parseOpenDays(this.configService.get<string>('BOOKING_OPEN_DAYS')),
      openTime: this.configService.get<string>('BOOKING_OPEN_TIME') ?? DEFAULT_OPEN_TIME,
      closeTime: this.configService.get<string>('BOOKING_CLOSE_TIME') ?? DEFAULT_CLOSE_TIME,
      slotMinutes: parseInt(
        this.configService.get<string>('BOOKING_SLOT_MINUTES') ?? String(DEFAULT_SLOT_MINUTES),
        10,
      ),
      draftTtlMinutes: parseInt(
        this.configService.get<string>('BOOKING_DRAFT_TTL_MINUTES') ?? '30',
        10,
      ),
    };
  }

  // ── Draft TTL check ───────────────────────────────────────────────────────

  /**
   * Returns true if the draft is fresh enough to continue.
   */
  isDraftFresh(draft: BookingDraft): boolean {
    const updatedAt = DateTime.fromJSDate(draft.updatedAt).setZone(this.cfg.timezone);
    const now = nairobiNow(this.cfg);
    return now.diff(updatedAt, 'minutes').minutes < this.cfg.draftTtlMinutes;
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  /**
   * Handles a single turn in an active booking draft conversation.
   * Called by VoicePipelineService when a draft is found for the user.
   *
   * @param userMessage  The patient's latest message text.
   * @param senderPhone  WhatsApp sender ID (used as phone for the appointment).
   * @param userId       Resolved Prisma User.id.
   * @returns A string reply to send back to the patient.
   */
  async handleDraftTurn(
    userMessage: string,
    senderPhone: string,
    userId: string,
  ): Promise<{ reply: string; triageFlag: boolean }> {
    // 1. Load or create draft
    const draft = await this.prisma.bookingDraft.upsert({
      where: { userId },
      update: {},
      create: { userId, language: 'en' },
    });

    const lang = (draft.language ?? 'en') as BookingLang;

    if (
      draft.status === 'AWAITING_CONFIRMATION' &&
      /\b(?:is|are|was|were|has|have|did)\b.{0,50}\b(?:appointment|booking|slot)\b.{0,40}\b(?:confirm(?:ed)?|booked|saved)\b|\b(?:confirm(?:ed)?|booked|saved)\b.{0,40}\b(?:appointment|booking|slot)\b/i.test(
        userMessage,
      )
    ) {
      return {
        reply: t(BOOKING_AWAITING_CONFIRMATION, lang),
        triageFlag: false,
      };
    }

    // 2. Load context for LLM
    const [clinics, recentLogs] = await Promise.all([
      this.prisma.clinic.findMany({ where: { isActive: true } }),
      this.prisma.messageLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 4,
      }),
    ]);

    const clinicContext = clinics.length
      ? clinics.map((c: Clinic) => `- ID: ${c.id} | Name: ${c.name} | Services: ${c.services.join(', ')}`).join('\n')
      : 'No specific clinics configured — use "Dr. Papi Dental Clinic" as default.';

    const history = recentLogs
      .reverse()
      .map((l: MessageLog) => `${l.role === 'assistant' ? 'Assistant' : 'Patient'}: ${l.content}`)
      .join('\n');

    const dateAnchors = anchors(this.cfg);

    const draftSnapshot = JSON.stringify({
      service: draft.service,
      clinicId: draft.clinicId,
      date: draft.date,
      time: draft.time,
      clientName: draft.clientName,
      status: draft.status,
    }, null, 2);

    const systemPrompt = [
      BOOKING_EXTRACTION_SYSTEM_PROMPT,
      '\n',
      buildBookingExtractionPrompt({
        ...dateAnchors,
        clinicContext,
        currentDraft: draftSnapshot,
        recentHistory: history,
      }),
    ].join('');

    // 3. Call LLM with retry-once on parse failure
    let extraction: BookingExtractionResult | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await this.llmProvider.generateCompletion({
          systemPrompt,
          userPrompt: userMessage,
          responseFormat: 'json',
          operation: 'booking_extraction',
        });
        const parsed = JSON.parse(this.stripFences(raw));
        const obj = Object.assign(new BookingExtractionResult(), parsed);
        const errors = validateSync(obj);
        if (errors.length === 0) {
          extraction = obj;
          break;
        }
        this.logger.warn(`Booking extraction validation failed (attempt ${attempt + 1}): ${JSON.stringify(errors)}`);
      } catch (err) {
        this.logger.warn(`Booking extraction parse failed (attempt ${attempt + 1}): ${err}`);
      }
    }

    if (!extraction) {
      return { reply: t(PARSE_FAILURE, lang), triageFlag: false };
    }

    const triageFlag = !!extraction.triageFlag;

    // 4. Emergency handling — reply urgently and signal triage to caller
    if (triageFlag) {
      const clinic = clinics[0] ?? null;
      const reply = t(EMERGENCY_GUIDANCE, lang, {
        clinicName: clinic?.name ?? 'Dr. Papi Dental Clinic',
        clinicPhone: clinic?.phone ?? 'the nearest clinic',
      });
      return { reply, triageFlag: true };
    }

    // 5. CANCEL / DECLINE while collecting
    if (
      extraction.action === 'CANCEL_BOOKING' ||
      (extraction.action === 'DECLINE' && draft.status === 'COLLECTING')
    ) {
      await this.prisma.bookingDraft.delete({ where: { userId } });
      return { reply: t(BOOKING_CANCELLED, lang), triageFlag: false };
    }

    // 6. UNRELATED — don't touch the draft
    if (extraction.action === 'UNRELATED') {
      // Let the caller fall through to normal pipeline; reply will come from there.
      // We return an empty string as the signal — caller must check.
      return { reply: '', triageFlag: false };
    }

    // 7. Merge non-null fields into draft
    const updates: Partial<{
      service: string;
      clinicId: string | null;
      date: string;
      time: string;
      clientName: string;
      rawDateMentioned: string;
      language: string;
      status: string;
    }> = {};

    // Update language
    if (extraction.language === 'sw' || extraction.language === 'en') {
      updates.language = extraction.language;
    }
    const effectiveLang = (updates.language ?? draft.language ?? 'en') as BookingLang;

    // ── Resolve clinic ────────────────────────────────────────────────────
    let resolvedClinic: Clinic | null = null;

    if (extraction.clinicName) {
      const match = this.fuzzyMatchClinic(extraction.clinicName, clinics);
      if (match) {
        updates.clinicId = match.id;
        resolvedClinic = match;
      } else {
        // No match — ask user to choose
        const clinicList = clinics.map((c: Clinic, i: number) => `${i + 1}. ${c.name}`).join('\n');
        await this.saveDraft(userId, updates);
        return {
          reply: t(CLINIC_NOT_FOUND, effectiveLang, {
            name: extraction.clinicName,
            clinicList,
          }),
          triageFlag: false,
        };
      }
    } else if (!draft.clinicId && clinics.length === 1) {
      // Auto-select the only active clinic
      updates.clinicId = clinics[0].id;
      resolvedClinic = clinics[0];
    } else if (draft.clinicId) {
      resolvedClinic = clinics.find((c: Clinic) => c.id === draft.clinicId) ?? null;
    }

    // ── Resolve service ───────────────────────────────────────────────────
    if (extraction.service) {
      const effectiveClinic = resolvedClinic ?? (draft.clinicId ? clinics.find((c: Clinic) => c.id === draft.clinicId) ?? null : null);
      if (effectiveClinic && effectiveClinic.services.length > 0) {
        const match = effectiveClinic.services.find((s: string) =>
          s.toLowerCase().includes(extraction!.service!.toLowerCase()) ||
          extraction!.service!.toLowerCase().includes(s.toLowerCase()),
        );
        if (match) {
          updates.service = match;
        } else {
          const serviceList = effectiveClinic.services.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');
          await this.saveDraft(userId, updates);
          return {
            reply: t(SERVICE_NOT_OFFERED, effectiveLang, {
              service: extraction.service,
              clinic: effectiveClinic.name,
              serviceList,
            }),
            triageFlag: false,
          };
        }
      } else {
        // Clinic not configured with services — accept free text
        updates.service = extraction.service;
      }
    }

    // ── Resolve date/time and validate slot ───────────────────────────────
    if (extraction.preferredDate) {
      updates.date = extraction.preferredDate;
      if (extraction.rawDateMentioned) updates.rawDateMentioned = extraction.rawDateMentioned;
    }
    if (extraction.preferredTime) {
      updates.time = extraction.preferredTime;
      // If date or time changed while AWAITING_CONFIRMATION, revert to COLLECTING
      if (draft.status === 'AWAITING_CONFIRMATION') {
        updates.status = 'COLLECTING';
      }
    }
    if (extraction.preferredDate && draft.status === 'AWAITING_CONFIRMATION') {
      updates.status = 'COLLECTING';
    }

    // Merge into in-memory draft snapshot for validation below
    const mergedDate = updates.date ?? draft.date;
    const mergedTime = updates.time ?? draft.time;

    if (mergedDate && mergedTime) {
      const now = nairobiNow(this.cfg);
      const validation = validateSlot(mergedDate, mergedTime, now, this.cfg);

      if (validation !== 'OK') {
        await this.saveDraft(userId, updates);
        const reply = await this.buildSlotError(validation, mergedDate, mergedTime, effectiveLang, updates.clinicId ?? draft.clinicId ?? null);
        return { reply, triageFlag: false };
      }
    }

    // ── Resolve clientName ────────────────────────────────────────────────
    if (extraction.clientName) {
      updates.clientName = extraction.clientName;
      await this.prisma.user.update({
        where: { id: userId },
        data: { name: extraction.clientName },
      });
    }

    // Save all merged updates
    await this.saveDraft(userId, updates);

    // ── Re-read draft with updates for missing-field check ────────────────
    const updatedDraft = await this.prisma.bookingDraft.findUnique({ where: { userId } });
    if (!updatedDraft) {
      return { reply: t(PARSE_FAILURE, effectiveLang), triageFlag: false };
    }

    // ── 8. CONFIRM path ───────────────────────────────────────────────────
    if (
      extraction.action === 'CONFIRM' &&
      updatedDraft.status === 'AWAITING_CONFIRMATION'
    ) {
      return this.finalizeBooking(updatedDraft, senderPhone, effectiveLang, clinics);
    }

    // ── 9. Check for missing required fields ──────────────────────────────
    const missing = this.collectMissingFields(updatedDraft);
    if (missing.length > 0) {
      // Ask for at most 2 missing items per turn
      const questions = missing.slice(0, 2).map((f) => this.askForField(f, effectiveLang)).join('\n');
      return { reply: questions, triageFlag: false };
    }

    // ── 10. All present & valid — move to AWAITING_CONFIRMATION ──────────
    await this.prisma.bookingDraft.update({
      where: { userId },
      data: { status: 'AWAITING_CONFIRMATION' },
    });

    const resolvedClinicName =
      clinics.find((c: Clinic) => c.id === updatedDraft.clinicId)?.name ??
      'Dr. Papi Dental Clinic';
    const formattedDate = this.formatDate(updatedDraft.date!, effectiveLang);
    const formattedTime = this.format24hTime(updatedDraft.time!);

    return {
      reply: t(READ_BACK, effectiveLang, {
        service: updatedDraft.service!,
        date: formattedDate,
        time: formattedTime,
        clinic: resolvedClinicName,
        name: updatedDraft.clientName!,
      }),
      triageFlag: false,
    };
  }

  // ── Finalize booking ──────────────────────────────────────────────────────

  private async finalizeBooking(
    draft: BookingDraft,
    senderPhone: string,
    lang: BookingLang,
    clinics: Clinic[],
  ): Promise<{ reply: string; triageFlag: boolean }> {
    const scheduledAt = toScheduledAt(draft.date!, draft.time!, this.cfg);
    const clinic = clinics.find((c) => c.id === draft.clinicId) ?? null;

    try {
      const appointment = await this.prisma.$transaction(async (tx) => {
        const db = tx as unknown as PrismaClient;
        // Re-check slot is free within the transaction
        if (draft.clinicId) {
          const conflict = await db.appointment.findFirst({
            where: {
              clinicId: draft.clinicId,
              scheduledAt,
              status: { in: ['BOOKED', 'CONFIRMED'] },
            },
          });
          if (conflict) throw new Error('SLOT_CONFLICT');
        }

        const appt = await db.appointment.create({
          data: {
            userId: draft.userId,
            clientName: draft.clientName!,
            phone: senderPhone,
            clinicId: draft.clinicId ?? undefined,
            clinicName: clinic?.name ?? 'Dr. Papi Dental Clinic',
            service: draft.service!,
            scheduledAt,
            status: 'BOOKED',
            bookedVia: 'AI_AGENT',
            notes: [
              draft.rawDateMentioned ? `Raw date: "${draft.rawDateMentioned}"` : null,
            ].filter(Boolean).join(' | ') || undefined,
          },
        });

        await db.bookingDraft.delete({ where: { userId: draft.userId } });
        return appt;
      });

      const formattedDate = this.formatDate(draft.date!, lang);
      const formattedTime = this.format24hTime(draft.time!);

      return {
        reply: t(BOOKING_CONFIRMED, lang, {
          name: appointment.clientName,
          service: appointment.service,
          date: formattedDate,
          time: formattedTime,
          clinic: appointment.clinicName ?? 'Dr. Papi Dental Clinic',
          ref: appointment.id.slice(0, 8).toUpperCase(),
        }),
        triageFlag: false,
      };
    } catch (err: unknown) {
      const isConflict =
        (err instanceof Error && err.message === 'SLOT_CONFLICT') ||
        (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002');

      if (isConflict) {
        // Reset time and offer alternatives
        await this.prisma.bookingDraft.update({
          where: { userId: draft.userId },
          data: { status: 'COLLECTING', time: null },
        });
        const alternatives = await this.nextFreeSlots(draft.clinicId, scheduledAt, 3);
        const altText = alternatives
          .map((d) => `• ${this.format24hTime(d.toFormat('HH:mm'))} on ${this.formatDate(d.toISODate()!, lang)}`)
          .join('\n');
        return {
          reply: t(SLOT_TAKEN, lang, { alternatives: altText }),
          triageFlag: false,
        };
      }

      this.logger.error(`Booking finalization error: ${err}`);
      return {
        reply: t(PARSE_FAILURE, lang),
        triageFlag: false,
      };
    }
  }

  // ── Next free slots ───────────────────────────────────────────────────────

  /**
   * Queries active appointments for a clinic and returns the nearest `count`
   * free slot times within opening hours, starting from `fromUtc`.
   */
  async nextFreeSlots(
    clinicId: string | null,
    fromUtc: Date,
    count: number = 3,
  ): Promise<DateTime[]> {
    const from = DateTime.fromJSDate(fromUtc).setZone(this.cfg.timezone);
    const slots = daySlots(this.cfg);
    const results: DateTime[] = [];

    // Look ahead up to 14 days
    for (let dayOffset = 0; dayOffset < 14 && results.length < count; dayOffset++) {
      const day = from.plus({ days: dayOffset });
      const dayIso = day.toISODate()!;

      if (!this.cfg.openDays.includes(day.weekday)) continue;

      for (const slot of slots) {
        if (results.length >= count) break;

        const candidate = toScheduledAt(dayIso, slot, this.cfg);
        const candidateDt = DateTime.fromJSDate(candidate);
        if (candidateDt <= DateTime.fromJSDate(fromUtc)) continue;

        if (clinicId) {
          const conflict = await this.prisma.appointment.findFirst({
            where: {
              clinicId,
              scheduledAt: candidate,
              status: { in: ['BOOKED', 'CONFIRMED'] },
            },
          });
          if (conflict) continue;
        }

        results.push(DateTime.fromJSDate(candidate).setZone(this.cfg.timezone));
      }
    }

    return results;
  }

  // ── Admin / REST helpers ──────────────────────────────────────────────────

  async getAllAppointments(status?: string) {
    return this.prisma.appointment.findMany({
      where: status ? { status } : {},
      orderBy: { scheduledAt: 'asc' },
      include: {
        user: { select: { id: true, whatsappId: true, name: true } },
      },
    });
  }

  async getAppointmentById(id: string) {
    return this.prisma.appointment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, whatsappId: true, name: true } },
      },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.appointment.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Compatibility wrapper for the manual-booking endpoint.
   * Feeds the text turn into the draft pipeline.
   */
  async bookFromTranscript(
    transcript: string,
    senderPhone: string = '+254712345678',
  ): Promise<BookingResult> {
    const user = await this.prisma.user.upsert({
      where: { whatsappId: senderPhone },
      update: {},
      create: { whatsappId: senderPhone, name: `User ${senderPhone.slice(-4)}` },
    });

    const { reply, triageFlag } = await this.handleDraftTurn(
      transcript,
      senderPhone,
      user.id,
    );

    return {
      success: !triageFlag,
      confirmationMessage: reply,
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async saveDraft(
    userId: string,
    data: Partial<{
      service: string;
      clinicId: string | null;
      date: string;
      time: string;
      clientName: string;
      rawDateMentioned: string;
      language: string;
      status: string;
    }>,
  ): Promise<void> {
    if (Object.keys(data).length === 0) return;
    await this.prisma.bookingDraft.update({ where: { userId }, data });
  }

  private collectMissingFields(draft: BookingDraft): string[] {
    const missing: string[] = [];
    if (!draft.service) missing.push('service');
    // Only require clinic if there are multiple
    // (single-clinic auto-selection was handled earlier)
    if (!draft.clinicId) missing.push('clinic');
    if (!draft.date || !draft.time) missing.push('datetime');
    if (!draft.clientName) missing.push('name');
    return missing;
  }

  private askForField(field: string, lang: BookingLang): string {
    switch (field) {
      case 'service':  return t(ASK_SERVICE, lang);
      case 'clinic':   return t(ASK_CLINIC, lang, { clinicList: '' }).split('\n')[0]; // just the question
      case 'datetime': return t(ASK_DATE_TIME, lang);
      case 'name':     return t(ASK_NAME, lang);
      default:         return '';
    }
  }

  private async buildSlotError(
    validation: string,
    dateIso: string,
    timeHHmm: string,
    lang: BookingLang,
    clinicId: string | null,
  ): Promise<string> {
    switch (validation) {
      case 'PAST':
        return t(SLOT_PAST, lang);
      case 'CLOSED_DAY': {
        const dt = DateTime.fromISO(dateIso, { zone: this.cfg.timezone });
        return t(SLOT_CLOSED_DAY, lang, {
          dayName: dt.weekdayLong ?? dateIso,
          openDays: openDayNames(this.cfg),
        });
      }
      case 'OUTSIDE_HOURS':
        return t(SLOT_OUTSIDE_HOURS, lang, {
          openTime: this.cfg.openTime,
          closeTime: this.cfg.closeTime,
        });
      case 'NOT_ON_SLOT_BOUNDARY': {
        const nearest = snapToSlot(timeHHmm, this.cfg);
        return t(SLOT_NOT_ON_BOUNDARY, lang, {
          slotMinutes: String(this.cfg.slotMinutes),
          nearestSlot: nearest,
        });
      }
      default:
        return t(SLOT_PAST, lang);
    }
  }

  private fuzzyMatchClinic(name: string, clinics: Clinic[]): Clinic | null {
    const lower = name.toLowerCase();
    // Exact match first
    const exact = clinics.find((c) => c.name.toLowerCase() === lower);
    if (exact) return exact;
    // Contains match
    const contains = clinics.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        lower.includes(c.name.toLowerCase()),
    );
    if (contains.length === 1) return contains[0];
    return null;
  }

  private formatDate(dateIso: string, lang: BookingLang): string {
    const dt = DateTime.fromISO(dateIso, { zone: this.cfg.timezone });
    if (lang === 'sw') {
      // Swahili date format: "Jumatatu, 26 Oktoba 2026"
      return dt.setLocale('sw').toFormat('cccc, d LLLL yyyy');
    }
    return dt.toFormat('cccc, d MMMM yyyy'); // e.g. "Monday, 26 October 2026"
  }

  private format24hTime(timeHHmm: string): string {
    const [h, m] = timeHHmm.split(':').map(Number);
    const dt = DateTime.now().set({ hour: h, minute: m });
    return dt.toFormat('h:mm a'); // e.g. "10:00 AM"
  }

  private stripFences(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return clean;
  }
}
