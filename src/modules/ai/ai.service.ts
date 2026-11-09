import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Clinic, InsurancePlan } from '../../generated/prisma/client';
import {
  ChatHistoryMessage,
  ILlmProvider,
  LLM_PROVIDER,
} from './interfaces/llm-provider.interface';
import {
  DR_PAPI_DISCLAIMER,
  DR_PAPI_FALLBACK_REPLY,
  buildDrPapiSystemPrompt,
} from '../../prompts';

export type LeadIntent = 'INSURANCE_INTEREST' | 'CLINIC_APPOINTMENT' | null;

export interface AiReply {
  message: string;
  detectedLeadIntent: LeadIntent;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILlmProvider,
  ) {}

  /**
   * Generates a grounded, safety-constrained reply for an inbound WhatsApp
   * message using live clinic/insurance context pulled from the database.
   */
  async generateReply(
    userMessage: string,
    history: ChatHistoryMessage[],
    operation = 'whatsapp_reply',
  ): Promise<AiReply> {
    const systemPrompt = await this.buildSystemPrompt();

    let rawReply: string;
    try {
      rawReply = await this.llmProvider.generateCompletion({
        systemPrompt,
        userPrompt: userMessage,
        history,
        operation,
      });
    } catch (error) {
      this.logger.error(
        `LLM generation failed, falling back to safe default reply: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      rawReply = DR_PAPI_FALLBACK_REPLY;
    }

    const message = this.appendDisclaimerIfMissing(rawReply);
    const detectedLeadIntent = this.detectLeadIntent(userMessage, rawReply);

    return { message, detectedLeadIntent };
  }

  /**
   * Builds the system prompt, injecting real-time active clinic and
   * insurance plan data from Postgres so responses stay grounded in fact.
   */
  public async buildSystemPrompt(): Promise<string> {
    const [clinics, insurancePlans] = await Promise.all([
      this.prisma.clinic.findMany({ where: { isActive: true } }),
      this.prisma.insurancePlan.findMany({ where: { isActive: true } }),
    ]);

    const clinicContext = clinics.length
      ? clinics
          .map(
            (clinic: Clinic) =>
              `- ${clinic.name} | ${clinic.address}, ${clinic.city} | Phone: ${clinic.phone} | Services: ${clinic.services.join(', ')}`,
          )
          .join('\n')
      : 'No active clinics currently on file.';

    const insuranceContext = insurancePlans.length
      ? insurancePlans
          .map(
            (plan: InsurancePlan) =>
              `- ${plan.name} | KES ${plan.monthlyCost.toFixed(2)}/month | Perks: ${plan.coveragePerks.join(', ')} | Signup: ${plan.signupUrl}`,
          )
          .join('\n')
      : 'No active insurance plans currently on file.';

    return buildDrPapiSystemPrompt({ clinicContext, insuranceContext });
  }

  /**
   * Ensures every outbound message carries the mandatory medical disclaimer
   * footer, without duplicating it if the model already included one.
   */
  private appendDisclaimerIfMissing(reply: string): string {
    if (reply.includes('Disclaimer: I am an AI assistant')) {
      return reply;
    }
    return `${reply}${DR_PAPI_DISCLAIMER}`;
  }

  /**
   * Lightweight keyword-based lead intent detection over both the user's
   * message and the assistant's reply, used to auto-create Lead records.
   */
  private detectLeadIntent(userMessage: string, reply: string): LeadIntent {
    const combined = `${userMessage} ${reply}`.toLowerCase();

    const appointmentKeywords = [
      'appointment',
      'book',
      'schedule',
      'visit',
      'come in',
      'see a dentist',
      'available slot',
    ];
    const insuranceKeywords = [
      'insurance',
      'plan',
      'coverage',
      'sign up',
      'signup',
      'monthly cost',
      'premium',
    ];

    const wantsAppointment = appointmentKeywords.some((keyword) =>
      combined.includes(keyword),
    );
    const wantsInsurance = insuranceKeywords.some((keyword) =>
      combined.includes(keyword),
    );

    if (wantsAppointment) return 'CLINIC_APPOINTMENT';
    if (wantsInsurance) return 'INSURANCE_INTEREST';
    return null;
  }
}
