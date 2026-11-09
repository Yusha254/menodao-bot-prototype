import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Lead, Appointment, User } from '../../generated/prisma/client';
import { VoicePipelineService } from '../voice-pipeline/voice-pipeline.service';
import { AssemblyAiService } from '../assemblyai/assemblyai.service';
import {
  VOICE_AGENT_SIMULATOR_GREETING,
  VOICE_AGENT_SIMULATOR_SYSTEM_PROMPT,
} from '../../prompts';

@ApiTags('Simulator')
@Controller()
export class SimulatorController {
  private readonly logger = new Logger(SimulatorController.name);

  constructor(
    private readonly voicePipelineService: VoicePipelineService,
    private readonly assemblyAiService: AssemblyAiService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Serves the interactive browser-based test playground.
   */
  @Get('playground')
  @ApiOperation({ summary: 'Dr. Papi Voice Agent Test Playground' })
  getPlayground(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(this.getPlaygroundHtml());
  }

  /**
   * Obtains a secure temporary token for the official AssemblyAI Voice Agent API (wss://agents.assemblyai.com/v1/ws).
   */
  @Get('api/v1/simulator/voice-agent-token')
  @ApiOperation({
    summary: 'Obtain temporary AssemblyAI Voice Agent API token',
  })
  async getVoiceAgentToken() {
    try {
      const token = await this.assemblyAiService.createVoiceAgentToken(
        300,
        8640,
      );
      return { token };
    } catch (error) {
      this.logger.error(`Error generating Voice Agent token: ${error}`);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate AssemblyAI Voice Agent token. Check your ASSEMBLY_AI_API_KEY in .env.',
      };
    }
  }

  /**
   * Obtains a secure, temporary AssemblyAI WebSocket streaming token
   * for client-side live microphone transcription (STT fallback).
   */
  @Get('api/v1/simulator/realtime-token')
  @ApiOperation({
    summary: 'Obtain temporary AssemblyAI WebSocket token for live streaming',
  })
  async getRealtimeToken() {
    try {
      const token = await this.assemblyAiService.createTemporaryToken(480);
      return { token };
    } catch (error) {
      this.logger.error(`Error generating realtime token: ${error}`);
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate AssemblyAI realtime token. Ensure ASSEMBLY_AI_API_KEY is configured.',
      };
    }
  }

  /**
   * Processes a live conversational turn through the grounded dual-path AI router.
   */
  @Post('api/v1/simulator/live-turn')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit live conversation utterance to the dual-path pipeline',
  })
  async processLiveTurn(
    @Body('text') text: string,
    @Body('senderPhone') senderPhone?: string,
    @Body('sessionId') sessionId?: string,
  ) {
    if (!text || text.trim().length === 0) {
      return {
        status: 'failed',
        error: 'Utterance text cannot be empty.',
      };
    }

    return await this.voicePipelineService.processTextPipeline(
      text,
      senderPhone || '+254700112233',
      sessionId,
    );
  }

  /**
   * Handles recorded microphone audio or uploaded audio file (.ogg, .wav, .mp3)
   * and runs the complete AssemblyAI + Dual-Path Voice Pipeline.
   */
  @Post('api/v1/simulator/voice-note')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('audio'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Submit voice note for AssemblyAI transcription & routing',
  })
  async submitVoiceNote(
    @UploadedFile() file: Express.Multer.File,
    @Body('senderPhone') senderPhone?: string,
  ) {
    if (!file || !file.buffer) {
      return {
        status: 'failed',
        error: 'No audio file provided in request.',
      };
    }

    this.logger.log(
      `Received simulator audio note (${file.mimetype}, ${file.size} bytes) from ${
        senderPhone || 'simulator-user'
      }`,
    );

    const result = await this.voicePipelineService.processVoicePipeline(
      file.buffer,
      senderPhone || '+254712345678',
    );

    return result;
  }

  /**
   * Direct text simulation endpoint.
   */
  @Post('api/v1/simulator/text-message')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit text message to the dual-path pipeline' })
  async submitTextMessage(
    @Body('text') text: string,
    @Body('senderPhone') senderPhone?: string,
  ) {
    if (!text || text.trim().length === 0) {
      return {
        status: 'failed',
        error: 'Text message cannot be empty.',
      };
    }

    return await this.voicePipelineService.processTextPipeline(
      text,
      senderPhone || '+254712345678',
    );
  }

  /**
   * Retrieves the current Clinical Queue for clinician review.
   */
  @Get('api/v1/simulator/clinical-queue')
  @ApiOperation({ summary: 'Fetch clinical intake submissions from database' })
  async getClinicalQueue() {
    const leads = await this.prisma.lead.findMany({
      where: { type: 'CLINICAL_INTAKE' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { user: true },
    });

    return leads.map((lead: Lead & { user: User }) => {
      let parsedNotes: any = {};
      try {
        parsedNotes = JSON.parse(lead.notes || '{}');
      } catch {
        parsedNotes = { raw: lead.notes };
      }
      return {
        id: lead.id,
        status: lead.status,
        createdAt: lead.createdAt,
        phone: lead.user.phone ?? lead.user.whatsappId,
        userName: lead.user.name,
        ...parsedNotes,
      };
    });
  }

  /**
   * Retrieves all booked appointments for confirmation in the playground dashboard.
   */
  @Get('api/v1/simulator/appointments')
  @ApiOperation({
    summary: 'Fetch all booked appointments for the playground dashboard',
  })
  async getSimulatorAppointments() {
    const appointments = await this.prisma.appointment.findMany({
      orderBy: { scheduledAt: 'asc' },
      include: { user: true },
    });

    return appointments.map((appt: Appointment & { user: User }) => {
      const scheduledDate = new Date(appt.scheduledAt);
      return {
        id: appt.id,
        userId: appt.userId,
        clientName: appt.clientName,
        phone: appt.phone,
        service: appt.service,
        clinicName: appt.clinicName || 'Dr. Papi Dental Clinic',
        scheduledAt: appt.scheduledAt,
        scheduledAtFormatted: scheduledDate.toLocaleDateString('en-KE', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        status: appt.status,
        bookedVia: appt.bookedVia,
        notes: appt.notes,
        createdAt: appt.createdAt,
      };
    });
  }

  /**
   * Updates an appointment status from the playground dashboard.
   */
  @Patch('api/v1/simulator/appointments/:id/status')
  @ApiOperation({ summary: 'Update appointment status' })
  async updateSimulatorAppointmentStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.prisma.appointment.update({
      where: { id },
      data: { status: status || 'CONFIRMED' },
    });
  }

  private getPlaygroundHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dr. Papi Foundation — Voice Agent Playground</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at 10% 20%, rgba(16, 24, 40, 0.95) 0%, rgba(10, 15, 29, 0.98) 90.2%);
      --card-bg: rgba(22, 32, 54, 0.7);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent-teal: #00d2b4;
      --accent-cyan: #00b4d8;
      --accent-blue: #3a86ff;
      --accent-amber: #f59e0b;
      --accent-rose: #f43f5e;
      --accent-emerald: #10b981;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #090d16;
      background-image: var(--bg-gradient);
      color: var(--text-main);
      font-family: var(--font-sans);
      min-height: 100vh;
      padding: 24px;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 28px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .logo-badge {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue));
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 20px;
      color: #051329;
      box-shadow: 0 0 20px rgba(0, 210, 180, 0.35);
    }

    .brand-title h1 {
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .brand-title p {
      font-size: 13px;
      color: var(--text-muted);
    }

    .badge-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: rgba(0, 210, 180, 0.1);
      border: 1px solid rgba(0, 210, 180, 0.25);
      font-size: 12px;
      color: var(--accent-teal);
      font-weight: 600;
    }

    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent-teal);
      box-shadow: 0 0 8px var(--accent-teal);
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.95); opacity: 0.8; }
      50% { transform: scale(1.15); opacity: 1; }
      100% { transform: scale(0.95); opacity: 0.8; }
    }

    .grid {
      display: grid;
      grid-template-columns: 1.05fr 1.15fr;
      gap: 24px;
    }

    @media (max-width: 980px) {
      .grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 18px;
      padding: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
    }

    .card-title {
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .tabs {
      display: flex;
      gap: 6px;
      background: rgba(10, 15, 29, 0.8);
      padding: 4px;
      border-radius: 12px;
      margin-bottom: 20px;
    }

    .tab-btn {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 9px 8px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .tab-btn.active {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }

    .tab-btn.live-active {
      background: linear-gradient(135deg, rgba(0, 210, 180, 0.2), rgba(58, 134, 255, 0.2));
      border: 1px solid rgba(0, 210, 180, 0.3);
      color: var(--accent-teal);
    }

    /* Live Phone Call Container */
    .call-card {
      border: 1px solid rgba(0, 210, 180, 0.2);
      background: radial-gradient(circle at 50% 30%, rgba(0, 210, 180, 0.05), rgba(10, 15, 29, 0.95));
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }

    .call-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue));
      margin: 0 auto 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 34px;
      box-shadow: 0 0 25px rgba(0, 210, 180, 0.3);
      transition: transform 0.3s;
    }

    .call-avatar.speaking {
      animation: call-pulse 1.5s infinite;
    }

    @keyframes call-pulse {
      0% { box-shadow: 0 0 0 0 rgba(0, 210, 180, 0.7); }
      70% { box-shadow: 0 0 0 22px rgba(0, 210, 180, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 210, 180, 0); }
    }

    .call-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-main);
    }

    .call-state {
      font-size: 13px;
      color: var(--accent-teal);
      margin-top: 4px;
      font-weight: 600;
    }

    .visualizer-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 36px;
      margin: 18px 0;
    }

    .vis-bar {
      width: 4px;
      height: 6px;
      background: var(--accent-teal);
      border-radius: 3px;
      transition: height 0.08s ease;
    }

    .live-stream-box {
      background: rgba(0, 0, 0, 0.35);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px;
      min-height: 80px;
      text-align: left;
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 18px;
    }

    .live-stream-label {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
    }

    .live-partial-text {
      color: var(--text-main);
      font-style: italic;
    }

    .call-actions {
      display: flex;
      justify-content: center;
      gap: 16px;
    }

    .btn-call-start {
      background: linear-gradient(135deg, var(--accent-emerald), #059669);
      color: white;
      border: none;
      padding: 12px 28px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
      transition: transform 0.2s;
    }

    .btn-call-start:hover { transform: scale(1.04); }

    .btn-call-end {
      background: linear-gradient(135deg, var(--accent-rose), #dc2626);
      color: white;
      border: none;
      padding: 12px 28px;
      border-radius: 9999px;
      font-weight: 700;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 16px rgba(244, 63, 94, 0.4);
      transition: transform 0.2s;
    }

    .btn-call-end:hover { transform: scale(1.04); }

    .record-box {
      border: 2px dashed rgba(255, 255, 255, 0.12);
      border-radius: 14px;
      padding: 26px 20px;
      text-align: center;
      margin-bottom: 16px;
    }

    .mic-btn {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      border: none;
      background: linear-gradient(135deg, #f43f5e, #e11d48);
      color: white;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 6px 20px rgba(244, 63, 94, 0.4);
      transition: transform 0.2s;
      margin-bottom: 12px;
    }

    .mic-btn:hover { transform: scale(1.05); }
    .mic-btn.recording {
      background: #dc2626;
      animation: mic-pulse 1.2s infinite;
    }

    @keyframes mic-pulse {
      0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
      70% { box-shadow: 0 0 0 20px rgba(220, 38, 38, 0); }
      100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
    }

    .upload-label {
      display: inline-block;
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      color: var(--text-muted);
      margin-top: 10px;
    }

    textarea, input[type="text"] {
      width: 100%;
      background: rgba(10, 15, 29, 0.9);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 12px;
      color: var(--text-main);
      font-family: inherit;
      font-size: 14px;
      outline: none;
    }

    textarea:focus, input[type="text"]:focus { border-color: var(--accent-teal); }

    .preset-title {
      font-size: 11px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }

    .preset-chips { display: flex; flex-wrap: wrap; gap: 6px; }

    .chip {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 5px 9px;
      font-size: 11px;
      cursor: pointer;
      color: #cbd5e1;
    }

    .chip:hover {
      background: rgba(0, 210, 180, 0.15);
      border-color: var(--accent-teal);
      color: var(--accent-teal);
    }

    .btn-submit {
      width: 100%;
      background: linear-gradient(135deg, var(--accent-teal), var(--accent-blue));
      color: #031422;
      font-weight: 700;
      font-size: 14px;
      padding: 12px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0, 210, 180, 0.3);
      margin-top: 14px;
    }

    /* Inspector / Results */
    .inspector-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
    }

    .intent-tag {
      padding: 5px 12px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .tag-clinical {
      background: rgba(244, 63, 94, 0.15);
      color: #fb7185;
      border: 1px solid rgba(244, 63, 94, 0.3);
    }

    .tag-education {
      background: rgba(0, 210, 180, 0.15);
      color: var(--accent-teal);
      border: 1px solid rgba(0, 210, 180, 0.3);
    }

    .tag-booking {
      background: rgba(16, 185, 129, 0.2);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.4);
    }

    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-booked { background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge-confirmed { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); }
    .badge-completed { background: rgba(168, 85, 247, 0.2); color: #d8b4fe; border: 1px solid rgba(168, 85, 247, 0.4); }
    .badge-cancelled { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); }

    .dash-filter-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 5px 10px;
      border-radius: 8px;
      font-size: 11px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }
    .dash-filter-btn.active {
      background: var(--accent-teal);
      color: #031422;
      border-color: var(--accent-teal);
    }
    .dash-filter-btn:hover:not(.active) {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-main);
    }

    .appt-card {
      background: rgba(10, 15, 29, 0.7);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 14px;
      margin-bottom: 10px;
      transition: border-color 0.2s;
    }
    .appt-card:hover {
      border-color: rgba(0, 210, 180, 0.35);
    }
    .appt-action-btn {
      padding: 4px 9px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.2s;
    }
    .appt-action-btn:hover { opacity: 0.85; }

    .transcript-box {
      background: rgba(10, 15, 29, 0.7);
      border-left: 3px solid var(--accent-blue);
      padding: 12px 14px;
      border-radius: 0 10px 10px 0;
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 14px;
    }

    .json-viewer {
      background: #070b13;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #a7f3d0;
      overflow-x: auto;
      max-height: 300px;
      line-height: 1.4;
      white-space: pre-wrap;
    }

    .reply-bubble {
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 12px;
      padding: 14px;
      font-size: 13px;
      color: #ecfdf5;
      line-height: 1.5;
      margin-top: 12px;
    }

    .call-log-list {
      max-height: 380px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 12px;
    }

    .call-msg {
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.4;
      max-width: 90%;
    }

    .call-msg.user {
      align-self: flex-end;
      background: rgba(58, 134, 255, 0.15);
      border: 1px solid rgba(58, 134, 255, 0.3);
      color: #93c5fd;
    }

    .call-msg.assistant {
      align-self: flex-start;
      background: rgba(0, 210, 180, 0.15);
      border: 1px solid rgba(0, 210, 180, 0.3);
      color: #a7f3d0;
    }

    .triage-alert {
      background: rgba(220, 38, 38, 0.2);
      border: 1px solid #ef4444;
      color: #fca5a5;
      padding: 10px 14px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 6px;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="brand">
        <div class="logo-badge">DP</div>
        <div class="brand-title">
          <h1>Dr. Papi Foundation — Voice Agent Playground</h1>
          <p>AssemblyAI Official Voice Agent API (End-to-End Real-Time Speech In / Speech Out)</p>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <a href="/admin/dashboard" style="display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 9999px; background: rgba(58, 134, 255, 0.15); border: 1px solid rgba(58, 134, 255, 0.3); font-size: 12px; color: #93c5fd; font-weight: 600; text-decoration: none;">
          🦷 Admin Command Center
        </a>
        <div class="badge-status">
          <span class="badge-dot"></span>
          <span>Voice Agent API Live</span>
        </div>
      </div>
    </header>

    <div class="grid">
      <!-- Left Column: Input controls -->
      <div class="card">
        <h2 class="card-title">
          <span>🎙️</span> Inbound Voice & Live Calling Console
        </h2>

        <div class="tabs">
          <button class="tab-btn live-active" id="tab-live" onclick="setMode('live')">📞 Live Voice Agent (Official API)</button>
          <button class="tab-btn" id="tab-voice" onclick="setMode('voice')">🎙️ Voice Note</button>
          <button class="tab-btn" id="tab-text" onclick="setMode('text')">💬 Text</button>
        </div>

        <!-- 1. LIVE PHONE CALL SECTION -->
        <div id="section-live">
          <div class="call-card">
            <div class="call-avatar" id="live-avatar">🦷</div>
            <div class="call-title">Dr. Papi Voice Agent</div>
            <div class="call-state" id="live-call-status">Ready to call • Voice: Anna</div>

            <!-- Audio Visualizer Bars -->
            <div class="visualizer-container" id="vis-bars">
              <div class="vis-bar"></div><div class="vis-bar"></div><div class="vis-bar"></div>
              <div class="vis-bar"></div><div class="vis-bar"></div><div class="vis-bar"></div>
              <div class="vis-bar"></div><div class="vis-bar"></div><div class="vis-bar"></div>
              <div class="vis-bar"></div><div class="vis-bar"></div><div class="vis-bar"></div>
            </div>

            <!-- Live Streaming Transcript Preview -->
            <div class="live-stream-box">
              <div class="live-stream-label">Live Speech Stream (AssemblyAI Voice Agent API):</div>
              <div class="live-partial-text" id="live-transcript-stream">"Press 'Start Live Call' to speak directly with Dr. Papi..."</div>
            </div>

            <!-- Call Action Buttons -->
            <div class="call-actions">
              <button class="btn-call-start" id="btn-start-call" onclick="startLiveCall()">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                <span>Start Live Call</span>
              </button>
              <button class="btn-call-end" id="btn-end-call" onclick="endLiveCall()" style="display: none;">
                <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.58.9-1.07.5-2.03 1.18-2.88 2.01-.22.22-.53.33-.83.33-.31 0-.62-.12-.85-.35L.35 13.8a1.2 1.2 0 0 1 0-1.7C3.33 9.07 7.42 7.2 12 7.2s8.67 1.87 11.65 4.9c.47.47.47 1.23 0 1.7l-1.91 1.91c-.23.23-.54.35-.85.35-.3 0-.61-.11-.83-.33-.85-.83-1.81-1.51-2.88-2.01-.35-.16-.58-.51-.58-.9V9.72C15.15 9.25 13.6 9 12 9z"/></svg>
                <span>End Call</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 2. VOICE NOTE SECTION -->
        <div id="section-voice" style="display: none;">
          <div class="record-box">
            <button class="mic-btn" id="record-btn" onclick="toggleRecording()">
              <svg width="26" height="26" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              </svg>
            </button>
            <p id="record-status" style="font-size: 13px; font-weight: 600;">Click to Record WhatsApp Audio Note</p>
            <p id="record-timer" style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">00:00</p>
            
            <audio id="audio-preview" controls style="display: none; width: 100%; margin-top: 12px;"></audio>

            <div>
              <label for="audio-upload" class="upload-label">📁 Or choose an audio file (.ogg / .wav / .mp3)</label>
              <input type="file" id="audio-upload" style="display:none;" accept="audio/*" onchange="handleFileSelected(event)">
              <div id="file-name" style="font-size: 11px; color: var(--accent-teal); margin-top: 4px;"></div>
            </div>
          </div>
          <button class="btn-submit" id="submit-btn" onclick="submitPipeline()">
            <span>Process Voice Note via AssemblyAI</span>
          </button>
        </div>

        <!-- 3. TEXT SECTION -->
        <div id="section-text" style="display: none;">
          <textarea id="text-input" rows="4" placeholder="Andika ujumbe wako hapa (Swahili or English)..."></textarea>
          <button class="btn-submit" onclick="submitPipeline()">
            <span>Submit Text to AI Assistant</span>
          </button>
        </div>

        <div style="margin-top: 14px;">
          <label style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;">Simulated Caller Number:</label>
          <input type="text" id="sender-phone" value="+254712345678" style="padding: 8px 12px; font-size: 12px;">
        </div>

        <div class="sample-presets" style="margin-top: 14px;">
          <p class="preset-title">Test Prompts / Scenarios:</p>
          <div class="preset-chips">
            <span class="chip" onclick="loadPreset('book_tomorrow')">📅 Book: Cleaning tomorrow at 10 AM</span>
            <span class="chip" onclick="loadPreset('book_friday')">📅 Book: Check-up next Friday 2 PM</span>
            <span class="chip" onclick="loadPreset('book_swahili')">📅 Book (Swahili): Miadi ya kusafisha meno kesho saa nne</span>
            <span class="chip" onclick="loadPreset('clinical_sw')">🚨 Swahili Intake: Jino lauma sana</span>
            <span class="chip" onclick="loadPreset('clinical_en')">🚨 English Intake: Broken molar</span>
            <span class="chip" onclick="loadPreset('edu_sw')">🦷 Education: Dawa ya meno ya watoto</span>
            <span class="chip" onclick="loadPreset('edu_en')">🦷 Education: Bleeding gums</span>
          </div>
        </div>
      </div>

      <!-- Right Column: Inspector Output / Live Call Log & Bookings Dashboard -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--card-border); padding-bottom: 12px;">
          <div style="display: flex; gap: 8px;">
            <button class="tab-btn active" id="view-tab-inspector" onclick="switchRightView('inspector')">⚡ Live Inspector</button>
            <button class="tab-btn" id="view-tab-dashboard" onclick="switchRightView('dashboard')">📅 Bookings Dashboard <span id="dash-count-badge" style="background: var(--accent-teal); color: #051329; padding: 2px 7px; border-radius: 999px; font-size: 10px; font-weight: 800; margin-left: 4px;">0</span></button>
          </div>
          <span id="intent-badge" class="intent-tag" style="display: none;"></span>
        </div>

        <!-- 1. LIVE INSPECTOR VIEW -->
        <div id="inspector-view">
          <div id="inspector-placeholder" style="text-align: center; padding: 60px 20px; color: var(--text-muted); font-size: 13px;">
            <div style="font-size: 30px; margin-bottom: 8px;">🎧</div>
            Start a live phone call or test a message to experience conversational triage & instant booking confirmation.
          </div>

          <div id="inspector-content" style="display: none;">
            <div id="triage-box" class="triage-alert" style="display: none;">
              ⚠️ <strong>IMMEDIATE TRIAGE FLAGGED:</strong> Urgent dental condition detected.
            </div>

            <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">
              AssemblyAI Voice Agent Live Stream:
            </label>
            <div class="transcript-box" id="result-transcript"></div>

            <!-- Live Conversation Turn Log -->
            <div id="live-chat-history" style="display: block;">
              <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 6px;">
                Live Call Back-and-Forth Stream:
              </label>
              <div class="call-log-list" id="call-log-container"></div>
            </div>

            <!-- Booking Path -->
            <div id="result-booking-section" style="display: none;">
              <div style="background: rgba(16, 185, 129, 0.12); border: 1px solid rgba(16, 185, 129, 0.35); border-radius: 12px; padding: 16px; margin-top: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <span style="font-weight: 800; color: #10b981; font-size: 13px;">✅ APPOINTMENT STORED IN DATABASE</span>
                  <span id="booking-ref-badge" style="font-size: 11px; font-family: var(--font-mono); color: #a7f3d0; background: rgba(0,0,0,0.3); padding: 3px 8px; border-radius: 6px;"></span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; color: #e2e8f0; margin-bottom: 12px;">
                  <div><strong>👤 Client:</strong> <span id="booking-client">-</span></div>
                  <div><strong>🦷 Service:</strong> <span id="booking-service">-</span></div>
                  <div><strong>📅 Confirmed Date:</strong> <span id="booking-date" style="color: #6ee7b7; font-weight: 700;">-</span></div>
                  <div><strong>🏥 Clinic:</strong> <span id="booking-clinic">-</span></div>
                </div>
                <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 4px;">Outbound Confirmation Readback (Sent to Client):</label>
                <div class="reply-bubble" id="result-booking-receipt" style="white-space: pre-wrap; font-size: 13px; line-height: 1.5; margin-top: 0;"></div>
              </div>
            </div>

            <!-- Clinical Path -->
            <div id="result-clinical-section" style="display: none;">
              <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 10px; margin-bottom: 6px;">
                Extracted Clinical Schema (Border Agent JSON):
              </label>
              <div class="json-viewer" id="result-json"></div>
              
              <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 12px; margin-bottom: 6px;">
                Static Patient Receipt (Clinic Queue Saved):
              </label>
              <div class="reply-bubble" id="result-receipt"></div>
            </div>

            <!-- Education Path -->
            <div id="result-education-section" style="display: none;">
              <label style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-top: 10px; margin-bottom: 6px;">
                Synthetic Steward Educational Guidance:
              </label>
              <div class="reply-bubble" id="result-education-text"></div>
            </div>
          </div>
        </div>

        <!-- 2. BOOKINGS DASHBOARD VIEW -->
        <div id="dashboard-view" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div style="display: flex; gap: 6px;">
              <button class="dash-filter-btn active" onclick="filterAppointments('ALL', this)">All</button>
              <button class="dash-filter-btn" onclick="filterAppointments('BOOKED', this)">Booked</button>
              <button class="dash-filter-btn" onclick="filterAppointments('CONFIRMED', this)">Confirmed</button>
              <button class="dash-filter-btn" onclick="filterAppointments('COMPLETED', this)">Completed</button>
            </div>
            <button class="dash-filter-btn" onclick="loadAppointments()" style="display: flex; align-items: center; gap: 4px;">
              🔄 Refresh
            </button>
          </div>

          <div id="appointments-loading" style="text-align: center; padding: 30px; font-size: 12px; color: var(--text-muted); display: none;">
            <span class="spinner"></span> Loading appointments from database...
          </div>

          <div id="appointments-empty" style="text-align: center; padding: 40px 20px; font-size: 13px; color: var(--text-muted); display: none;">
            <div style="font-size: 28px; margin-bottom: 6px;">📅</div>
            No appointments found in database. Try asking the assistant to book a session!
          </div>

          <div id="appointments-list" style="max-height: 480px; overflow-y: auto; padding-right: 4px;">
            <!-- Rendered dynamically -->
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let activeMode = 'live';
    let mediaRecorder = null;
    let audioChunks = [];
    let audioBlob = null;
    let recordingStartTime = null;
    let timerInterval = null;

    // Live Voice Agent Variables
    let liveSocket = null;
    let audioContext = null;
    let audioStream = null;
    let processorNode = null;
    let isCallActive = false;
    let isSessionReady = false;
    let nextAudioPlayTime = 0;

    function setMode(mode) {
      activeMode = mode;
      document.getElementById('tab-live').className = 'tab-btn' + (mode === 'live' ? ' live-active active' : '');
      document.getElementById('tab-voice').className = 'tab-btn' + (mode === 'voice' ? ' active' : '');
      document.getElementById('tab-text').className = 'tab-btn' + (mode === 'text' ? ' active' : '');
      
      document.getElementById('section-live').style.display = mode === 'live' ? 'block' : 'none';
      document.getElementById('section-voice').style.display = mode === 'voice' ? 'block' : 'none';
      document.getElementById('section-text').style.display = mode === 'text' ? 'block' : 'none';
    }

    // =========================================================================
    // 1. OFFICIAL ASSEMBLYAI VOICE AGENT API (wss://agents.assemblyai.com/v1/ws)
    // =========================================================================
    async function startLiveCall() {
      const statusLabel = document.getElementById('live-call-status');
      const startBtn = document.getElementById('btn-start-call');
      const endBtn = document.getElementById('btn-end-call');
      const avatar = document.getElementById('live-avatar');

      statusLabel.innerText = 'Minting Voice Agent token...';
      startBtn.disabled = true;

      try {
        // Step 1: Mint temporary single-use token from backend (agents.assemblyai.com/v1/token)
        const tokenRes = await fetch('/api/v1/simulator/voice-agent-token');
        const tokenData = await tokenRes.json();

        if (!tokenData.token) {
          throw new Error(tokenData.error || 'Failed to obtain Voice Agent token. Check your ASSEMBLY_AI_API_KEY in .env');
        }

        document.getElementById('call-log-container').innerHTML = '';
        document.getElementById('inspector-placeholder').style.display = 'none';
        document.getElementById('inspector-content').style.display = 'block';

        // Step 2: Connect to the official Voice Agent WebSocket
        const wsUrl = 'wss://agents.assemblyai.com/v1/ws?token=' + encodeURIComponent(tokenData.token);
        liveSocket = new WebSocket(wsUrl);

        liveSocket.onopen = async () => {
          statusLabel.innerText = 'Connected • Initializing agent session...';
          isCallActive = true;
          startBtn.style.display = 'none';
          endBtn.style.display = 'flex';
          startBtn.disabled = false;

          // Step 3: Send session.update immediately
          const sessionConfig = {
            type: 'session.update',
            session: {
              system_prompt: ${JSON.stringify(VOICE_AGENT_SIMULATOR_SYSTEM_PROMPT)},
              greeting: ${JSON.stringify(VOICE_AGENT_SIMULATOR_GREETING)},
              output: {
                voice: 'anna',
                format: { encoding: 'audio/pcm' }
              }
            }
          };

          liveSocket.send(JSON.stringify(sessionConfig));
          console.log('Sent session.update to AssemblyAI Voice Agent');

          // Initialize Web Audio Context (24 kHz for Voice Agent API)
          audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
          nextAudioPlayTime = audioContext.currentTime;
        };

        liveSocket.onmessage = async (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === 'session.ready') {
              console.log('Voice Agent session ready:', msg.session_id);
              isSessionReady = true;
              statusLabel.innerText = 'Active Call • Listening...';
              // Start streaming microphone audio now that session is ready
              await startMicrophoneAudioStream();
              return;
            }

            if (msg.type === 'reply.started') {
              avatar.classList.add('speaking');
              statusLabel.innerText = 'Dr. Papi is speaking...';
            }

            if (msg.type === 'reply.audio' && msg.data) {
              // Decode base64 PCM16 audio and play back via Web Audio API at 24kHz
              playPcm16Chunk(msg.data);
            }

            if (msg.type === 'transcript.user.delta' && msg.text) {
              document.getElementById('live-transcript-stream').innerText = '"' + msg.text + '..."';
            }

            if (msg.type === 'transcript.user' && msg.text) {
              document.getElementById('live-transcript-stream').innerText = '"' + msg.text + '"';
              appendCallLog('user', msg.text);
            }

            if (msg.type === 'transcript.agent' && msg.text) {
              appendCallLog('assistant', msg.text);
            }

            if (msg.type === 'reply.done') {
              avatar.classList.remove('speaking');
              statusLabel.innerText = 'Listening to you...';
            }

            if (msg.type === 'error' || msg.error) {
              console.error('Voice Agent API error:', msg);
              statusLabel.innerText = 'Error: ' + (msg.error || msg.message);
            }

          } catch (err) {
            console.warn('Error parsing Voice Agent message:', err);
          }
        };

        liveSocket.onerror = (err) => {
          console.error('Voice Agent WebSocket error:', err);
          statusLabel.innerText = 'Voice Agent Connection Error';
        };

        liveSocket.onclose = (e) => {
          console.log('Voice Agent WebSocket closed:', e.code, e.reason);
          if (isCallActive) endLiveCall();
        };

      } catch (err) {
        alert('Live Call Setup Failed: ' + err.message);
        statusLabel.innerText = 'Call failed to initialize';
        startBtn.disabled = false;
      }
    }

    async function startMicrophoneAudioStream() {
      audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      const inputContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = inputContext.createMediaStreamSource(audioStream);
      const inputSampleRate = inputContext.sampleRate;
      
      let pcm24kBuffer = [];

      processorNode = inputContext.createScriptProcessor(2048, 1, 1);

      processorNode.onaudioprocess = (e) => {
        if (!isCallActive || !isSessionReady || !liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = e.inputBuffer.getChannelData(0);

        // Volume visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
        const rms = Math.sqrt(sum / inputData.length);
        animateVisualizer(rms > 0.01);

        // Resample from hardware rate to 24,000 Hz for Voice Agent API
        const resampled24k = resampleFloat32(inputData, inputSampleRate, 24000);

        // Convert Float32 to 16-bit PCM Linear
        for (let i = 0; i < resampled24k.length; i++) {
          let s = Math.max(-1, Math.min(1, resampled24k[i]));
          pcm24kBuffer.push(s < 0 ? s * 0x8000 : s * 0x7FFF);
        }

        // Send ~50ms chunks (1200 samples at 24kHz = 2400 bytes)
        const CHUNK_SIZE = 1200;
        while (pcm24kBuffer.length >= CHUNK_SIZE) {
          const chunk = pcm24kBuffer.splice(0, CHUNK_SIZE);
          const pcm16 = new Int16Array(chunk);
          
          // Base64 encode PCM16 binary buffer
          const bytes = new Uint8Array(pcm16.buffer);
          let binary = '';
          for (let b = 0; b < bytes.byteLength; b++) {
            binary += String.fromCharCode(bytes[b]);
          }
          const base64Audio = btoa(binary);

          liveSocket.send(JSON.stringify({
            type: 'input.audio',
            audio: base64Audio
          }));
        }
      };

      source.connect(processorNode);
      processorNode.connect(inputContext.destination);
    }

    function resampleFloat32(input, fromRate, toRate) {
      if (fromRate === toRate) return input;
      const ratio = fromRate / toRate;
      const outLength = Math.round(input.length / ratio);
      const output = new Float32Array(outLength);
      for (let i = 0; i < outLength; i++) {
        const originPos = i * ratio;
        const idx0 = Math.floor(originPos);
        const idx1 = Math.min(idx0 + 1, input.length - 1);
        const frac = originPos - idx0;
        output[i] = input[idx0] * (1 - frac) + input[idx1] * frac;
      }
      return output;
    }

    // Streams and plays raw base64 PCM16 audio chunks seamlessly at 24kHz
    function playPcm16Chunk(base64Audio) {
      if (!audioContext) return;
      
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);

      // Convert Int16 PCM to Float32 AudioBuffer
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
      }

      const audioBuffer = audioContext.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const bufferSource = audioContext.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSource.connect(audioContext.destination);

      // Schedule consecutive chunks to prevent gaps or audio overlapping
      const currentTime = audioContext.currentTime;
      if (nextAudioPlayTime < currentTime) {
        nextAudioPlayTime = currentTime;
      }
      bufferSource.start(nextAudioPlayTime);
      nextAudioPlayTime += audioBuffer.duration;
    }

    function appendCallLog(role, text) {
      const container = document.getElementById('call-log-container');
      const msgDiv = document.createElement('div');
      msgDiv.className = 'call-msg ' + role;
      msgDiv.innerHTML = '<strong>' + (role === 'user' ? '👤 You' : '🦷 Dr. Papi (AI)') + ':</strong> ' + text;
      container.appendChild(msgDiv);
      container.scrollTop = container.scrollHeight;
    }

    function endLiveCall() {
      isCallActive = false;
      isSessionReady = false;

      if (liveSocket) {
        try {
          liveSocket.send(JSON.stringify({ type: 'session.terminate' }));
          liveSocket.close();
        } catch(e) {}
        liveSocket = null;
      }

      if (audioStream) {
        audioStream.getTracks().forEach(t => t.stop());
        audioStream = null;
      }

      if (audioContext) {
        audioContext.close();
        audioContext = null;
      }

      document.getElementById('live-call-status').innerText = 'Call Ended • Ready to reconnect';
      document.getElementById('btn-start-call').style.display = 'flex';
      document.getElementById('btn-end-call').style.display = 'none';
      document.getElementById('live-avatar').classList.remove('speaking');
      animateVisualizer(false);
    }

    function animateVisualizer(active) {
      const bars = document.querySelectorAll('.vis-bar');
      bars.forEach((bar) => {
        if (active) {
          const h = Math.floor(Math.random() * 26) + 6;
          bar.style.height = h + 'px';
        } else {
          bar.style.height = '6px';
        }
      });
    }

    // ==========================================
    // 2. RECORDED VOICE NOTE & TEXT HANDLERS
    // ==========================================
    async function toggleRecording() {
      const btn = document.getElementById('record-btn');
      const statusText = document.getElementById('record-status');
      const timerText = document.getElementById('record-timer');

      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        btn.classList.remove('recording');
        statusText.innerText = 'Audio recorded! Click Process below.';
        clearInterval(timerInterval);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob);
          const preview = document.getElementById('audio-preview');
          preview.src = audioUrl;
          preview.style.display = 'block';
          stream.getTracks().forEach(t => t.stop());
        };

        mediaRecorder.start();
        btn.classList.add('recording');
        statusText.innerText = 'Recording voice note... (Click again to stop)';
        recordingStartTime = Date.now();
        timerInterval = setInterval(() => {
          const sec = Math.floor((Date.now() - recordingStartTime) / 1000);
          timerText.innerText = '00:' + (sec < 10 ? '0' : '') + sec;
        }, 500);

      } catch (err) {
        alert('Microphone access denied: ' + err.message);
      }
    }

    function handleFileSelected(event) {
      const file = event.target.files[0];
      if (file) {
        audioBlob = file;
        document.getElementById('file-name').innerText = 'Selected: ' + file.name;
        const preview = document.getElementById('audio-preview');
        preview.src = URL.createObjectURL(file);
        preview.style.display = 'block';
      }
    }

    function loadPreset(type) {
      setMode('text');
      const textMap = {
        book_tomorrow: 'Hi, I would like to book a dental cleaning appointment tomorrow at 10:00 AM. My name is Daniel Mwangi.',
        book_friday: 'Hello, could you please schedule a routine dental check-up for me next Friday at 2:30 PM? My name is Faith Wanjiku.',
        book_swahili: 'Habari, naomba kupanga miadi ya kusafisha meno kesho saa nne asubuhi. Jina langu ni Juma Hassan.',
        clinical_sw: 'Hujambo daktari, nina maumivu makali sana ya jino la nyuma upande wa kulia tangu juzi usiku. Siwezi kutafuna chakula wala kulala vizuri kwa sababu ya maumivu.',
        clinical_en: 'Hello Dr. Ruwa, I fell down yesterday and my lower front tooth got chipped. It is extremely sensitive and throbbing whenever I drink cold water.',
        edu_sw: 'Habari za Mombasa! Naomba kuuliza ni mara ngapi kwa siku ninapaswa kupiga mswaki, na je ni sawa kutumia dawa ya meno ya watu wazima kwa mtoto wa miaka mitatu?',
        edu_en: 'Why do my gums bleed slightly when I floss my teeth, and what is the best technique to prevent plaque buildup without hurting my gums?'
      };
      const input = document.getElementById('text-input');
      if (input) input.value = textMap[type] || '';
    }

    // ==========================================
    // 3. BOOKINGS DASHBOARD & RIGHT VIEW LOGIC
    // ==========================================
    let currentRightView = 'inspector';
    let currentApptFilter = 'ALL';
    let cachedAppointments = [];

    function switchRightView(view) {
      currentRightView = view;
      document.getElementById('view-tab-inspector').className = 'tab-btn' + (view === 'inspector' ? ' active' : '');
      document.getElementById('view-tab-dashboard').className = 'tab-btn' + (view === 'dashboard' ? ' active' : '');

      document.getElementById('inspector-view').style.display = view === 'inspector' ? 'block' : 'none';
      document.getElementById('dashboard-view').style.display = view === 'dashboard' ? 'block' : 'none';

      if (view === 'dashboard') {
        loadAppointments();
      }
    }

    async function loadAppointments(filter = currentApptFilter) {
      currentApptFilter = filter;
      const listEl = document.getElementById('appointments-list');
      const emptyEl = document.getElementById('appointments-empty');
      const loadingEl = document.getElementById('appointments-loading');

      if (loadingEl) loadingEl.style.display = 'block';

      try {
        const res = await fetch('/api/v1/simulator/appointments');
        const appointments = await res.json();
        cachedAppointments = appointments;

        // Update badge count
        const countBadge = document.getElementById('dash-count-badge');
        if (countBadge) countBadge.innerText = appointments.length;

        renderAppointmentList();
      } catch (err) {
        console.error('Failed to load appointments:', err);
      } finally {
        if (loadingEl) loadingEl.style.display = 'none';
      }
    }

    function filterAppointments(filter, btn) {
      currentApptFilter = filter;
      document.querySelectorAll('.dash-filter-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      renderAppointmentList();
    }

    function renderAppointmentList() {
      const listEl = document.getElementById('appointments-list');
      const emptyEl = document.getElementById('appointments-empty');
      if (!listEl) return;

      let filtered = cachedAppointments;
      if (currentApptFilter !== 'ALL') {
        filtered = cachedAppointments.filter(a => a.status === currentApptFilter);
      }

      if (filtered.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';
      listEl.innerHTML = filtered.map(appt => {
        let statusClass = 'badge-booked';
        if (appt.status === 'CONFIRMED') statusClass = 'badge-confirmed';
        else if (appt.status === 'COMPLETED') statusClass = 'badge-completed';
        else if (appt.status === 'CANCELLED') statusClass = 'badge-cancelled';

        let html = '<div class="appt-card" id="card-' + appt.id + '">';
        html += '<div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">';
        html += '<div><span class="status-badge ' + statusClass + '">' + appt.status + '</span>';
        html += '<span style="font-size: 11px; color: var(--text-muted); margin-left: 8px; font-family: var(--font-mono);">Ref: #' + appt.id.slice(0, 8).toUpperCase() + '</span></div>';
        html += '<div style="display: flex; gap: 4px;">';
        if (appt.status !== 'CONFIRMED') {
          html += '<button class="appt-action-btn" style="background: rgba(16, 185, 129, 0.2); color: #6ee7b7;" onclick="setApptStatus(&apos;' + appt.id + '&apos;, &apos;CONFIRMED&apos;)">✓ Confirm</button>';
        }
        if (appt.status !== 'COMPLETED') {
          html += '<button class="appt-action-btn" style="background: rgba(168, 85, 247, 0.2); color: #d8b4fe;" onclick="setApptStatus(&apos;' + appt.id + '&apos;, &apos;COMPLETED&apos;)">✓ Complete</button>';
        }
        if (appt.status !== 'CANCELLED') {
          html += '<button class="appt-action-btn" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5;" onclick="setApptStatus(&apos;' + appt.id + '&apos;, &apos;CANCELLED&apos;)">✕ Cancel</button>';
        }
        html += '</div></div>';
        html += '<div style="font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">🦷 ' + (appt.service || 'Dental Check-up') + '</div>';
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; color: #cbd5e1; margin-bottom: 8px;">';
        html += '<div>👤 <strong>Client:</strong> ' + (appt.clientName || 'Anonymous') + '</div>';
        html += '<div>📞 <strong>Phone:</strong> ' + (appt.phone || '-') + '</div>';
        html += '<div>📅 <strong>Date:</strong> <span style="color: #6ee7b7; font-weight: 600;">' + (appt.scheduledAtFormatted || new Date(appt.scheduledAt).toLocaleString()) + '</span></div>';
        html += '<div>🏥 <strong>Clinic:</strong> ' + (appt.clinicName || 'Dr. Papi Clinic') + '</div>';
        html += '</div>';
        if (appt.notes) {
          html += '<div style="font-size: 11px; color: var(--text-muted); background: rgba(0,0,0,0.25); padding: 6px 8px; border-radius: 6px;">📝 ' + appt.notes + '</div>';
        }
        html += '</div>';
        return html;
      }).join('');
    }

    async function setApptStatus(id, newStatus) {
      try {
        const res = await fetch('/api/v1/simulator/appointments/' + id + '/status', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });
        if (res.ok) {
          loadAppointments();
        }
      } catch (err) {
        alert('Failed to update status: ' + err.message);
      }
    }

    // Auto-fetch count on load & keep fresh
    window.addEventListener('DOMContentLoaded', () => {
      loadAppointments();
      setInterval(loadAppointments, 6000);
    });

    async function submitPipeline() {
      const senderPhoneInput = document.getElementById('sender-phone');
      const senderPhone = senderPhoneInput ? senderPhoneInput.value : '+254712345678';
      
      const placeholder = document.getElementById('inspector-placeholder');
      const content = document.getElementById('inspector-content');
      if (placeholder) placeholder.style.display = 'block';
      if (content) content.style.display = 'none';

      // Always switch to inspector view to see the turn response
      switchRightView('inspector');

      try {
        let response;
        if (activeMode === 'voice') {
          if (!audioBlob) {
            alert('Please record a voice note or choose an audio file first.');
            return;
          }
          const formData = new FormData();
          formData.append('audio', audioBlob, 'voicenote.webm');
          formData.append('senderPhone', senderPhone);

          response = await fetch('/api/v1/simulator/voice-note', {
            method: 'POST',
            body: formData,
          });
        } else {
          const textInput = document.getElementById('text-input');
          const text = textInput ? textInput.value.trim() : '';
          if (!text) {
            alert('Please enter text to test.');
            return;
          }
          response = await fetch('/api/v1/simulator/text-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, senderPhone }),
          });
        }

        const data = await response.json();
        renderResult(data);
        // Refresh dashboard in background so badge & list update
        loadAppointments();
      } catch (err) {
        alert('Pipeline execution failed: ' + err.message);
      }
    }

    function renderResult(data) {
      const placeholder = document.getElementById('inspector-placeholder');
      const content = document.getElementById('inspector-content');
      if (placeholder) placeholder.style.display = 'none';
      if (content) content.style.display = 'block';

      const badge = document.getElementById('intent-badge');
      if (badge) {
        badge.style.display = 'inline-block';
        if (data.intent === 'BOOKING_SESSION') {
          badge.className = 'intent-tag tag-booking';
          badge.innerText = 'INTENT: SESSION BOOKED (' + Math.round((data.intentConfidence || 0.95) * 100) + '%)';
        } else if (data.intent === 'CLINICAL_INTAKE') {
          badge.className = 'intent-tag tag-clinical';
          badge.innerText = 'INTENT: CLINICAL INTAKE (' + Math.round((data.intentConfidence || 0.95) * 100) + '%)';
        } else {
          badge.className = 'intent-tag tag-education';
          badge.innerText = 'INTENT: HEALTH EDUCATION (' + Math.round((data.intentConfidence || 0.95) * 100) + '%)';
        }
      }

      const bookingSec = document.getElementById('result-booking-section');
      const clinicalSec = document.getElementById('result-clinical-section');
      const eduSec = document.getElementById('result-education-section');
      const triageBox = document.getElementById('triage-box');
      const jsonView = document.getElementById('result-json');
      const receiptView = document.getElementById('result-receipt');
      const eduText = document.getElementById('result-education-text');
      const transcriptView = document.getElementById('result-transcript');

      if (data.intent === 'BOOKING_SESSION') {
        if (bookingSec) bookingSec.style.display = 'block';
        if (clinicalSec) clinicalSec.style.display = 'none';
        if (eduSec) eduSec.style.display = 'none';
        if (triageBox) triageBox.style.display = 'none';

        const bResult = data.bookingResult || {};
        const refBadge = document.getElementById('booking-ref-badge');
        const clientEl = document.getElementById('booking-client');
        const serviceEl = document.getElementById('booking-service');
        const dateEl = document.getElementById('booking-date');
        const clinicEl = document.getElementById('booking-clinic');
        const bookReceipt = document.getElementById('result-booking-receipt');

        if (refBadge) refBadge.innerText = '#' + (bResult.appointmentId ? bResult.appointmentId.slice(0, 8).toUpperCase() : 'BOOKED');
        if (clientEl) clientEl.innerText = bResult.clientName || 'Valued Patient';
        if (serviceEl) serviceEl.innerText = bResult.service || 'Dental Session';
        if (dateEl) dateEl.innerText = bResult.scheduledAtFormatted || 'Scheduled Date Confirmed';
        if (clinicEl) clinicEl.innerText = bResult.clinicName || 'Dr. Papi Dental Clinic';
        if (bookReceipt) bookReceipt.innerText = data.patientMessage || bResult.confirmationMessage || '';
      } else if (data.intent === 'CLINICAL_INTAKE') {
        if (bookingSec) bookingSec.style.display = 'none';
        if (clinicalSec) clinicalSec.style.display = 'block';
        if (eduSec) eduSec.style.display = 'none';
        if (jsonView) jsonView.innerText = JSON.stringify(data.clinicalIntake || {}, null, 2);
        if (receiptView) receiptView.innerText = data.patientMessage || '';
        const isUrgent = data.clinicalIntake && data.clinicalIntake.immediate_triage_flag;
        if (triageBox) triageBox.style.display = isUrgent ? 'flex' : 'none';
      } else {
        if (bookingSec) bookingSec.style.display = 'none';
        if (clinicalSec) clinicalSec.style.display = 'none';
        if (eduSec) eduSec.style.display = 'block';
        if (triageBox) triageBox.style.display = 'none';
        if (eduText) eduText.innerText = data.healthEducationReply || data.patientMessage || '';
      }

      if (transcriptView) transcriptView.innerText = data.transcript || '(Direct text turn)';
    }
  </script>
</body>
</html>`;
  }
}
