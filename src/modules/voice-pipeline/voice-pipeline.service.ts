import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AssemblyAiService } from '../assemblyai/assemblyai.service';
import {
  ILlmProvider,
  LLM_PROVIDER,
} from '../ai/interfaces/llm-provider.interface';
import { randomUUID } from 'crypto';
import { BookingService } from '../booking/booking.service';
import {
  BORDER_AGENT_SYSTEM_PROMPT,
  INTENT_CLASSIFIER_SYSTEM_PROMPT,
  SYNTHETIC_STEWARD_SYSTEM_PROMPT,
  buildBorderAgentUserPrompt,
  buildIntentClassificationPrompt,
  buildSyntheticStewardUserPrompt,
} from '../../prompts';

export type IntentType =
  'CLINICAL_INTAKE' | 'HEALTH_EDUCATION' | 'BOOKING_SESSION';

export interface ClinicalIntakeSchema {
  primary_symptom: string;
  patient_verbatim_quote: string;
  anatomical_location: string;
  duration_and_onset: string;
  pain_character: string;
  functional_impact: string;
  previous_interventions: string;
  immediate_triage_flag: boolean;
  confidence_score: number;
}

export interface PipelineExecutionResult {
  intakeUuid: string;
  senderPhone: string;
  transcript: string;
  detectedLanguage?: string;
  intent: IntentType;
  intentConfidence: number;
  clinicalIntake?: ClinicalIntakeSchema;
  bookingResult?: { confirmationMessage: string };
  healthEducationReply?: string;
  patientMessage: string;
  ttsAudioBase64?: string; // Optional synthesized audio
  status: 'completed' | 'failed';
  error?: string;
}

const STATIC_CLINICAL_RECEIPT_SWAHILI =
  'Asante. Ujumbe wako wa sauti umepokelewa na kuandaliwa daktari wetu (Dr. Ruwa). ' +
  'Tutawasiliana nawe hivi karibuni kupitia nambari hii kupanga muda wa kuonana na daktari au kukupa maelekezo zaidi.\n\n---\n*Dr. Papi Foundation*';

@Injectable()
export class VoicePipelineService {
  private readonly logger = new Logger(VoicePipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly assemblyAiService: AssemblyAiService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILlmProvider,
    private readonly bookingService: BookingService,
  ) {}

  /**
   * Main asynchronous pipeline processor for voice notes.
   */
  async processVoicePipeline(
    audioSource: Buffer | string,
    senderPhone: string = 'simulator-user',
    intakeUuid?: string,
  ): Promise<PipelineExecutionResult> {
    const sessionUuid = intakeUuid || randomUUID();
    this.logger.log(
      `Starting voice pipeline execution [${sessionUuid}] for ${senderPhone}`,
    );

    try {
      // Step 1: Transcribe via AssemblyAI (Universal-3.5-Pro)
      const sttResult =
        await this.assemblyAiService.transcribeAudio(audioSource);
      const transcript = sttResult.text;

      if (!transcript || transcript.trim().length === 0) {
        throw new Error('Received empty transcript from audio source.');
      }

      // Step 2: Route through common processing pipeline
      return await this.processTextPipeline(
        transcript,
        senderPhone,
        sessionUuid,
        sttResult.languageCode,
      );
    } catch (error) {
      this.logger.error(
        `Voice pipeline error [${sessionUuid}]: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        intakeUuid: sessionUuid,
        senderPhone,
        transcript: '',
        intent: 'HEALTH_EDUCATION',
        intentConfidence: 0,
        patientMessage:
          'Samahani, hatukuweza kusikiliza ujumbe wako vizuri. Tafadhali jaribu kutuma tena au uandike kwa maneno.',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Processes inbound text or transcribed voice messages through the dual-path router.
   *
   * ROUTING PRIORITY:
   *   1. If the user has a fresh BookingDraft → route to BookingService.handleDraftTurn()
   *      (skips the intent classifier entirely).
   *   2. Stale drafts are deleted and the message goes through the normal classifier.
   *   3. BOOKING_SESSION → BookingService.handleDraftTurn() (creates a new draft).
   *   4. CLINICAL_INTAKE → Border Agent.
   *   5. HEALTH_EDUCATION → Synthetic Steward.
   */
  async processTextPipeline(
    transcriptText: string,
    senderPhone: string = 'simulator-user',
    intakeUuid?: string,
    detectedLanguage?: string,
    // Keep an opaque provider identity (for example a WhatsApp LID) separate
    // from the phone used for appointment records and outbound replies.
    whatsappId: string = senderPhone,
  ): Promise<PipelineExecutionResult> {
    const sessionUuid = intakeUuid || randomUUID();
    this.logger.log(
      `Routing message [${sessionUuid}]: "${transcriptText.substring(0, 60)}..."`,
    );

    // Ensure User exists in database
    const user = await this.prisma.user.upsert({
      where: { whatsappId },
      update: {},
      create: {
        whatsappId,
        name: `User ${senderPhone.slice(-4)}`,
      },
    });

    // Log inbound user message
    await this.prisma.messageLog.create({
      data: {
        userId: user.id,
        role: 'user',
        content: `[Session: ${sessionUuid}] ${transcriptText}`,
      },
    });

    // ── PRIORITY 1: Active booking draft check ────────────────────────────────
    const existingDraft = await this.prisma.bookingDraft.findUnique({
      where: { userId: user.id },
    });

    if (existingDraft) {
      if (this.bookingService.isDraftFresh(existingDraft)) {
        this.logger.log(
          `[${sessionUuid}] Active booking draft found — routing to handleDraftTurn()`,
        );
        return this.runBookingDraftTurn(
          transcriptText,
          senderPhone,
          user.id,
          sessionUuid,
          detectedLanguage,
        );
      } else {
        // Stale draft — delete it and continue to classifier
        this.logger.log(
          `[${sessionUuid}] Stale booking draft found — deleting and re-classifying`,
        );
        await this.prisma.bookingDraft.delete({ where: { userId: user.id } });
      }
    }

    // ── PRIORITY 2: Intent classifier gateway ─────────────────────────────────
    const classification = await this.classifyIntent(transcriptText);
    this.logger.log(
      `Intent classified [${sessionUuid}]: ${classification.intent} (${classification.confidence})`,
    );

    if (classification.intent === 'BOOKING_SESSION') {
      this.logger.log(
        `[${sessionUuid}] BOOKING_SESSION — starting new draft turn`,
      );
      return this.runBookingDraftTurn(
        transcriptText,
        senderPhone,
        user.id,
        sessionUuid,
        detectedLanguage,
      );
    }

    if (classification.intent === 'CLINICAL_INTAKE') {
      // Path 1: Border Agent (Clinical Extraction)
      const clinicalSchema = await this.executeBorderAgent(transcriptText);

      // Persist to Clinical Queue / Leads table
      await this.prisma.lead.create({
        data: {
          userId: user.id,
          type: 'CLINICAL_INTAKE',
          notes: JSON.stringify({
            sessionUuid,
            detectedLanguage,
            clinicalData: clinicalSchema,
          }),
          status: clinicalSchema.immediate_triage_flag
            ? 'URGENT_TRIAGE'
            : 'NEW',
        },
      });

      // Log outbound receipt
      await this.prisma.messageLog.create({
        data: {
          userId: user.id,
          role: 'assistant',
          content: STATIC_CLINICAL_RECEIPT_SWAHILI,
        },
      });

      return {
        intakeUuid: sessionUuid,
        senderPhone,
        transcript: transcriptText,
        detectedLanguage,
        intent: 'CLINICAL_INTAKE',
        intentConfidence: classification.confidence,
        clinicalIntake: clinicalSchema,
        patientMessage: STATIC_CLINICAL_RECEIPT_SWAHILI,
        status: 'completed',
      };
    } else {
      // Path 2: Synthetic Steward (Health Education)
      const stewardReply = await this.executeSyntheticSteward(transcriptText);

      // Log outbound education message
      await this.prisma.messageLog.create({
        data: {
          userId: user.id,
          role: 'assistant',
          content: stewardReply,
        },
      });

      return {
        intakeUuid: sessionUuid,
        senderPhone,
        transcript: transcriptText,
        detectedLanguage,
        intent: 'HEALTH_EDUCATION',
        intentConfidence: classification.confidence,
        healthEducationReply: stewardReply,
        patientMessage: stewardReply,
        status: 'completed',
      };
    }
  }

  // ── Shared booking draft runner ───────────────────────────────────────────

  private async runBookingDraftTurn(
    transcriptText: string,
    senderPhone: string,
    userId: string,
    sessionUuid: string,
    detectedLanguage?: string,
  ): Promise<PipelineExecutionResult> {
    const { reply, triageFlag } = await this.bookingService.handleDraftTurn(
      transcriptText,
      senderPhone,
      userId,
    );

    // If UNRELATED — fall through to Health Education path
    if (reply === '') {
      const stewardReply = await this.executeSyntheticSteward(transcriptText);
      await this.prisma.messageLog.create({
        data: { userId, role: 'assistant', content: stewardReply },
      });
      return {
        intakeUuid: sessionUuid,
        senderPhone,
        transcript: transcriptText,
        detectedLanguage,
        intent: 'HEALTH_EDUCATION',
        intentConfidence: 0.7,
        healthEducationReply: stewardReply,
        patientMessage: stewardReply,
        status: 'completed',
      };
    }

    // If triageFlag — ALSO run the Border Agent so a Lead is created
    if (triageFlag) {
      try {
        const clinicalSchema = await this.executeBorderAgent(transcriptText);
        await this.prisma.lead.create({
          data: {
            userId,
            type: 'CLINICAL_INTAKE',
            notes: JSON.stringify({
              sessionUuid,
              source: 'booking_triage_flag',
              detectedLanguage,
              clinicalData: clinicalSchema,
            }),
            status: 'URGENT_TRIAGE',
          },
        });
      } catch (e) {
        this.logger.warn(`Border agent run after triageFlag failed: ${e}`);
      }
    }

    await this.prisma.messageLog.create({
      data: { userId, role: 'assistant', content: reply },
    });

    return {
      intakeUuid: sessionUuid,
      senderPhone,
      transcript: transcriptText,
      detectedLanguage,
      intent: 'BOOKING_SESSION',
      intentConfidence: 1,
      bookingResult: { confirmationMessage: reply },
      patientMessage: reply,
      status: 'completed',
    };
  }

  /**
   * Gateway Intent Classifier: Separates Booking Session, Clinical Intake, and Health Education.
   */
  private async classifyIntent(
    transcript: string,
  ): Promise<{ intent: IntentType; confidence: number }> {
    const prompt = buildIntentClassificationPrompt(transcript);

    try {
      const result = await this.llmProvider.generateCompletion({
        systemPrompt: INTENT_CLASSIFIER_SYSTEM_PROMPT,
        userPrompt: prompt,
        operation: 'voice_intent_classification',
      });

      const cleaned = this.extractJsonString(result);
      const parsed = JSON.parse(cleaned);
      let intent: IntentType = 'HEALTH_EDUCATION';
      if (parsed.intent === 'BOOKING_SESSION') intent = 'BOOKING_SESSION';
      else if (parsed.intent === 'CLINICAL_INTAKE') intent = 'CLINICAL_INTAKE';
      const confidence =
        typeof parsed.confidence === 'number' ? parsed.confidence : 0.95;

      return { intent, confidence };
    } catch (error) {
      this.logger.warn(
        `Intent classification parsing failed, using fallback heuristic: ${error}`,
      );
      // Fallback heuristics (booking-specific — no "see a dentist" overlap with clinical)
      const lower = transcript.toLowerCase();
      const bookingKeywords = [
        'book',
        'schedule',
        'appointment',
        'reserve',
        'session',
        'miadi',
        'panga',
        'slot',
        'nafasi',
        'tarehe',
      ];
      const clinicalKeywords = [
        'maumivu',
        'jino',
        'meno',
        'pain',
        'ache',
        'hurt',
        'bleed',
        'damu',
        'uvimbe',
        'swelling',
        'kuuma',
        'tibu',
      ];

      if (bookingKeywords.some((k) => lower.includes(k))) {
        return { intent: 'BOOKING_SESSION', confidence: 0.85 };
      }
      if (clinicalKeywords.some((k) => lower.includes(k))) {
        return { intent: 'CLINICAL_INTAKE', confidence: 0.8 };
      }
      return {
        intent: 'HEALTH_EDUCATION',
        confidence: 0.8,
      };
    }
  }

  /**
   * Path 1: The Border Agent - Extracts non-diagnostic clinical context.
   */
  private async executeBorderAgent(
    transcript: string,
  ): Promise<ClinicalIntakeSchema> {
    const systemPrompt = BORDER_AGENT_SYSTEM_PROMPT;
    const userPrompt = buildBorderAgentUserPrompt(transcript);

    try {
      const response = await this.llmProvider.generateCompletion({
        systemPrompt,
        userPrompt,
        operation: 'voice_clinical_intake',
      });

      const cleaned = this.extractJsonString(response);
      return JSON.parse(cleaned) as ClinicalIntakeSchema;
    } catch (error) {
      this.logger.error(`Border agent clinical extraction error: ${error}`);
      return {
        primary_symptom: 'Dental consultation request',
        patient_verbatim_quote: transcript,
        anatomical_location: 'unspecified',
        duration_and_onset: 'unspecified',
        pain_character: 'unspecified',
        functional_impact: 'unspecified',
        previous_interventions: 'none mentioned',
        immediate_triage_flag: false,
        confidence_score: 0.7,
      };
    }
  }

  /**
   * Path 2: The Synthetic Steward - Conversational Health Education.
   */
  private async executeSyntheticSteward(transcript: string): Promise<string> {
    const systemPrompt = SYNTHETIC_STEWARD_SYSTEM_PROMPT;
    const userPrompt = buildSyntheticStewardUserPrompt(transcript);

    const response = await this.llmProvider.generateCompletion({
      systemPrompt,
      userPrompt,
      operation: 'voice_health_education',
    });

    return response.trim();
  }

  /**
   * Strips markdown code blocks (```json ... ```) from LLM output to guarantee valid JSON parse.
   */
  private extractJsonString(raw: string): string {
    let clean = raw.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return clean;
  }
}
