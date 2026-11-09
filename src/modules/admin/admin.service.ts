import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Clinic, InsurancePlan } from '../../generated/prisma/client';
import { CreateClinicDto, UpdateClinicDto } from './dto/create-clinic.dto';
import {
  CreateInsuranceDto,
  UpdateInsuranceDto,
} from './dto/create-insurance.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  // ---------- Clinics ----------

  async createClinic(dto: CreateClinicDto) {
    return this.prisma.clinic.create({ data: dto });
  }

  async findAllClinics(includeInactive: boolean = true) {
    return this.prisma.clinic.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findClinicById(id: string) {
    const clinic = await this.prisma.clinic.findUnique({ where: { id } });
    if (!clinic) {
      throw new NotFoundException(`Clinic with id "${id}" not found.`);
    }
    return clinic;
  }

  async updateClinic(id: string, dto: UpdateClinicDto) {
    await this.findClinicById(id);
    return this.prisma.clinic.update({ where: { id }, data: dto });
  }

  async removeClinic(id: string) {
    await this.findClinicById(id);
    // Soft delete to preserve historical integrity for past leads/logs.
    return this.prisma.clinic.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async hardDeleteClinic(id: string) {
    await this.findClinicById(id);
    return this.prisma.clinic.delete({ where: { id } });
  }

  // ---------- Insurance Plans ----------

  async createInsurancePlan(dto: CreateInsuranceDto) {
    return this.prisma.insurancePlan.create({ data: dto });
  }

  async findAllInsurancePlans(includeInactive: boolean = true) {
    return this.prisma.insurancePlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findInsurancePlanById(id: string) {
    const plan = await this.prisma.insurancePlan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new NotFoundException(`Insurance plan with id "${id}" not found.`);
    }
    return plan;
  }

  async updateInsurancePlan(id: string, dto: UpdateInsuranceDto) {
    await this.findInsurancePlanById(id);
    return this.prisma.insurancePlan.update({ where: { id }, data: dto });
  }

  async removeInsurancePlan(id: string) {
    await this.findInsurancePlanById(id);
    return this.prisma.insurancePlan.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async hardDeleteInsurancePlan(id: string) {
    await this.findInsurancePlanById(id);
    return this.prisma.insurancePlan.delete({ where: { id } });
  }

  // ---------- Leads ----------

  async findAllLeads(status?: string) {
    return this.prisma.lead.findMany({
      where: status && status !== 'ALL' ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, whatsappId: true, phone: true, name: true },
        },
      },
    });
  }

  async findLeadById(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, whatsappId: true, phone: true, name: true },
        },
      },
    });
    if (!lead) {
      throw new NotFoundException(`Lead with id "${id}" not found.`);
    }
    return lead;
  }

  async updateLeadStatus(id: string, dto: UpdateLeadStatusDto) {
    await this.findLeadById(id);
    const dataToUpdate: { status: string; notes?: string } = {
      status: dto.status,
    };
    if (dto.notes !== undefined) {
      dataToUpdate.notes = dto.notes;
    }
    return this.prisma.lead.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async deleteLead(id: string) {
    await this.findLeadById(id);
    return this.prisma.lead.delete({ where: { id } });
  }

  // ---------- Appointments ----------

  async findAllAppointments(status?: string) {
    return this.prisma.appointment.findMany({
      where: status && status !== 'ALL' ? { status } : {},
      orderBy: { scheduledAt: 'desc' },
      include: {
        user: {
          select: { id: true, whatsappId: true, phone: true, name: true },
        },
      },
    });
  }

  async findAppointmentById(id: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, whatsappId: true, phone: true, name: true },
        },
      },
    });
    if (!appointment) {
      throw new NotFoundException(`Appointment with id "${id}" not found.`);
    }
    return appointment;
  }

  async updateAppointment(
    id: string,
    data: { status?: string; notes?: string; scheduledAt?: string },
  ) {
    await this.findAppointmentById(id);
    const updateData: Record<string, any> = {};
    if (data.status) updateData.status = data.status;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.scheduledAt) updateData.scheduledAt = new Date(data.scheduledAt);

    return this.prisma.appointment.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteAppointment(id: string) {
    await this.findAppointmentById(id);
    return this.prisma.appointment.delete({ where: { id } });
  }

  // ---------- Conversation Logs & Users ----------

  async findConversationByUserId(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        leads: { orderBy: { createdAt: 'desc' } },
        appointments: { orderBy: { scheduledAt: 'desc' } },
      },
    });
    if (!user) {
      throw new NotFoundException(`User with id "${userId}" not found.`);
    }
    return user;
  }

  async findAllUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        whatsappId: true,
        phone: true,
        phoneVerifiedAt: true,
        name: true,
        createdAt: true,
        _count: {
          select: {
            messages: true,
            leads: true,
            appointments: true,
          },
        },
      },
    });
  }

  // ---------- Stats Overview ----------

  async getStats() {
    const [
      totalClinics,
      activeClinics,
      totalPlans,
      activePlans,
      totalLeads,
      newLeads,
      contactedLeads,
      closedLeads,
      totalAppointments,
      bookedAppointments,
      confirmedAppointments,
      totalUsers,
      totalMessages,
    ] = await Promise.all([
      this.prisma.clinic.count(),
      this.prisma.clinic.count({ where: { isActive: true } }),
      this.prisma.insurancePlan.count(),
      this.prisma.insurancePlan.count({ where: { isActive: true } }),
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { status: 'NEW' } }),
      this.prisma.lead.count({ where: { status: 'CONTACTED' } }),
      this.prisma.lead.count({ where: { status: 'CLOSED' } }),
      this.prisma.appointment.count(),
      this.prisma.appointment.count({ where: { status: 'BOOKED' } }),
      this.prisma.appointment.count({ where: { status: 'CONFIRMED' } }),
      this.prisma.user.count(),
      this.prisma.messageLog.count(),
    ]);

    return {
      clinics: { total: totalClinics, active: activeClinics },
      insurancePlans: { total: totalPlans, active: activePlans },
      leads: {
        total: totalLeads,
        new: newLeads,
        contacted: contactedLeads,
        closed: closedLeads,
      },
      appointments: {
        total: totalAppointments,
        booked: bookedAppointments,
        confirmed: confirmedAppointments,
      },
      users: { total: totalUsers },
      messages: { total: totalMessages },
    };
  }

  async getLlmUsage() {
    const [totalCalls, successfulCalls, failedCalls, recentCalls] =
      await Promise.all([
        this.prisma.llmCallLog.count(),
        this.prisma.llmCallLog.count({ where: { status: 'SUCCESS' } }),
        this.prisma.llmCallLog.count({ where: { status: 'FAILED' } }),
        this.prisma.llmCallLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
      ]);

    return { totalCalls, successfulCalls, failedCalls, recentCalls };
  }

  // ---------- Real-Time Agent Grounding Inspection & Live Testing ----------

  async getAgentPromptPreview() {
    const [clinics, insurancePlans, prompt] = await Promise.all([
      this.prisma.clinic.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.insurancePlan.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.aiService.buildSystemPrompt(),
    ]);

    return {
      activeClinicsCount: clinics.length,
      activePlansCount: insurancePlans.length,
      activeClinics: clinics.map((c: Clinic) => ({
        id: c.id,
        name: c.name,
        city: c.city,
        services: c.services,
      })),
      activePlans: insurancePlans.map((p: InsurancePlan) => ({
        id: p.id,
        name: p.name,
        monthlyCost: p.monthlyCost,
      })),
      systemPrompt: prompt,
      timestamp: new Date().toISOString(),
    };
  }

  async testAgent(userMessage: string) {
    if (!userMessage || !userMessage.trim()) {
      throw new Error('User message is required.');
    }
    const result = await this.aiService.generateReply(
      userMessage,
      [],
      'admin_test_agent',
    );
    return {
      userMessage,
      reply: result.message,
      detectedLeadIntent: result.detectedLeadIntent,
      timestamp: new Date().toISOString(),
    };
  }
}
