import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AdminService } from './admin.service';
import { CreateClinicDto, UpdateClinicDto } from './dto/create-clinic.dto';
import {
  CreateInsuranceDto,
  UpdateInsuranceDto,
} from './dto/create-insurance.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import {
  getAdminDashboardHtml,
  getAdminLoginHtml,
} from './admin-dashboard.view';
import { AdminAuthService, ADMIN_SESSION_COOKIE } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';
import { PublicAdminRoute } from './admin-auth.decorator';
import { AdminLoginDto } from './dto/admin-login.dto';

@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminAuthService: AdminAuthService,
  ) {}

  // ---------- Authentication ----------

  @Get('login')
  @PublicAdminRoute()
  @ApiTags('Admin - Auth')
  @ApiOperation({ summary: 'Render the admin login page' })
  getLoginPage(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(getAdminLoginHtml());
  }

  @Post('auth/login')
  @PublicAdminRoute()
  @ApiTags('Admin - Auth')
  @ApiOperation({ summary: 'Authenticate the admin user and issue a secure session cookie' })
  async login(
    @Body() dto: AdminLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const admin = await this.adminAuthService.authenticate(dto.email, dto.password);

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const token = this.adminAuthService.createSession(admin.id);
    this.adminAuthService.setSessionCookie(res, token);

    return {
      message: 'Login successful.',
      admin: {
        id: admin.id,
        email: admin.email,
      },
    };
  }

  @Get('auth/google')
  @PublicAdminRoute()
  @ApiTags('Admin - Auth')
  @ApiOperation({ summary: 'Redirect admin users to Google OAuth' })
  redirectToGoogle(@Res() res: Response) {
    const googleUrl = this.adminAuthService.getGoogleAuthUrl();

    if (!googleUrl) {
      throw new BadRequestException(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.',
      );
    }

    return res.redirect(googleUrl);
  }

  @Get('auth/google/callback')
  @PublicAdminRoute()
  @ApiTags('Admin - Auth')
  @ApiOperation({ summary: 'Complete the Google OAuth login flow and issue a session cookie' })
  async handleGoogleCallback(
    @Query('code') code: string,
    @Query('error') error: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (error) {
      return res.redirect('/admin/login?error=google_auth_denied');
    }

    if (!code) {
      throw new BadRequestException('Google authorization code was not provided.');
    }

    try {
      const profile = await this.adminAuthService.exchangeGoogleCodeForUser(code);
      const admin = await this.adminAuthService.findOrCreateGoogleAdmin(profile);

      if (!admin) {
        throw new UnauthorizedException('This Google admin account is disabled.');
      }

      const token = this.adminAuthService.createSession(admin.id);
      this.adminAuthService.setSessionCookie(res, token);

      return res.redirect('/admin/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google login failed.';
      return res.redirect(`/admin/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('auth/logout')
  @PublicAdminRoute()
  @ApiTags('Admin - Auth')
  @ApiOperation({ summary: 'Clear the current admin session cookie' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[ADMIN_SESSION_COOKIE];

    if (token) {
      this.adminAuthService.deleteSession(token);
    }

    res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });

    return { message: 'Logged out successfully.' };
  }

  @Get('auth/me')
  @ApiTags('Admin - Auth')
  @ApiOperation({ summary: 'Return the currently authenticated admin' })
  getCurrentAdmin(@Req() req: Request & { admin?: { id: string; email: string } }) {
    if (!req.admin) {
      throw new UnauthorizedException('Authentication required.');
    }
    return { admin: req.admin };
  }

  // ---------- Admin Dashboard UI ----------

  @Get('dashboard')
  @ApiTags('Admin - Dashboard UI')
  @ApiOperation({ summary: 'Serve the visual Admin Dashboard UI' })
  getDashboard(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(getAdminDashboardHtml());
  }

  @Get('')
  @ApiTags('Admin - Dashboard UI')
  @ApiOperation({ summary: 'Admin root path (serves UI)' })
  getAdminRoot(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(HttpStatus.OK).send(getAdminDashboardHtml());
  }

  // ---------- Overview & Stats ----------

  @Get('stats')
  @ApiTags('Admin - Overview')
  @ApiOperation({
    summary:
      'Get summary metrics across clinics, plans, leads, appointments, and users',
  })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('llm-usage')
  @ApiTags('Admin - LLM Usage')
  @ApiOperation({
    summary: 'Get LLM call totals and the 100 most recent prompt records',
  })
  getLlmUsage() {
    return this.adminService.getLlmUsage();
  }

  // ---------- Real-Time Agent Grounding & Test Sandbox ----------

  @Get('agent-prompt')
  @ApiTags('Admin - Agent Grounding')
  @ApiOperation({
    summary:
      'Inspect the real-time compiled system prompt and active grounding elements',
  })
  getAgentPromptPreview() {
    return this.adminService.getAgentPromptPreview();
  }

  @Post('test-agent')
  @ApiTags('Admin - Agent Grounding')
  @ApiOperation({
    summary:
      'Test how the agent responds in real-time with the latest clinic & insurance database grounding',
  })
  testAgent(@Body('message') message: string) {
    return this.adminService.testAgent(message);
  }

  // ---------- Clinics ----------

  @Post('clinics')
  @ApiTags('Admin - Clinics')
  @ApiOperation({ summary: 'Create a new clinic' })
  createClinic(@Body() dto: CreateClinicDto) {
    return this.adminService.createClinic(dto);
  }

  @Get('clinics')
  @ApiTags('Admin - Clinics')
  @ApiOperation({ summary: 'List all clinics' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include soft-deleted / inactive clinics in the results.',
  })
  findAllClinics(@Query('includeInactive') includeInactive?: string) {
    return this.adminService.findAllClinics(includeInactive === 'true');
  }

  @Get('clinics/:id')
  @ApiTags('Admin - Clinics')
  @ApiOperation({ summary: 'Get a clinic by id' })
  @ApiParam({ name: 'id', type: String })
  findClinicById(@Param('id') id: string) {
    return this.adminService.findClinicById(id);
  }

  @Patch('clinics/:id')
  @ApiTags('Admin - Clinics')
  @ApiOperation({ summary: 'Update a clinic' })
  @ApiParam({ name: 'id', type: String })
  updateClinic(@Param('id') id: string, @Body() dto: UpdateClinicDto) {
    return this.adminService.updateClinic(id, dto);
  }

  @Delete('clinics/:id')
  @ApiTags('Admin - Clinics')
  @ApiOperation({
    summary: 'Deactivate or permanently remove a clinic',
    description:
      'Deactivates the clinic by default, or permanently deletes if permanent=true query parameter is supplied.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean })
  removeClinic(
    @Param('id') id: string,
    @Query('permanent') permanent?: string,
  ) {
    if (permanent === 'true') {
      return this.adminService.hardDeleteClinic(id);
    }
    return this.adminService.removeClinic(id);
  }

  // ---------- Insurance Plans ----------

  @Post('insurance-plans')
  @ApiTags('Admin - Insurance Plans')
  @ApiOperation({ summary: 'Create a new insurance plan' })
  createInsurancePlan(@Body() dto: CreateInsuranceDto) {
    return this.adminService.createInsurancePlan(dto);
  }

  @Get('insurance-plans')
  @ApiTags('Admin - Insurance Plans')
  @ApiOperation({ summary: 'List all insurance plans' })
  @ApiQuery({
    name: 'includeInactive',
    required: false,
    type: Boolean,
    description: 'Include soft-deleted / inactive plans in the results.',
  })
  findAllInsurancePlans(@Query('includeInactive') includeInactive?: string) {
    return this.adminService.findAllInsurancePlans(includeInactive === 'true');
  }

  @Get('insurance-plans/:id')
  @ApiTags('Admin - Insurance Plans')
  @ApiOperation({ summary: 'Get an insurance plan by id' })
  @ApiParam({ name: 'id', type: String })
  findInsurancePlanById(@Param('id') id: string) {
    return this.adminService.findInsurancePlanById(id);
  }

  @Patch('insurance-plans/:id')
  @ApiTags('Admin - Insurance Plans')
  @ApiOperation({ summary: 'Update an insurance plan' })
  @ApiParam({ name: 'id', type: String })
  updateInsurancePlan(
    @Param('id') id: string,
    @Body() dto: UpdateInsuranceDto,
  ) {
    return this.adminService.updateInsurancePlan(id, dto);
  }

  @Delete('insurance-plans/:id')
  @ApiTags('Admin - Insurance Plans')
  @ApiOperation({
    summary: 'Deactivate or permanently delete an insurance plan',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'permanent', required: false, type: Boolean })
  removeInsurancePlan(
    @Param('id') id: string,
    @Query('permanent') permanent?: string,
  ) {
    if (permanent === 'true') {
      return this.adminService.hardDeleteInsurancePlan(id);
    }
    return this.adminService.removeInsurancePlan(id);
  }

  // ---------- Leads ----------

  @Get('leads')
  @ApiTags('Admin - Leads')
  @ApiOperation({ summary: 'List leads, optionally filtered by status' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['NEW', 'CONTACTED', 'CLOSED'],
  })
  findAllLeads(@Query('status') status?: string) {
    return this.adminService.findAllLeads(status);
  }

  @Get('leads/:id')
  @ApiTags('Admin - Leads')
  @ApiOperation({ summary: 'Get a lead by id' })
  @ApiParam({ name: 'id', type: String })
  findLeadById(@Param('id') id: string) {
    return this.adminService.findLeadById(id);
  }

  @Patch('leads/:id/status')
  @ApiTags('Admin - Leads')
  @ApiOperation({ summary: 'Update the status or notes of a lead' })
  @ApiParam({ name: 'id', type: String })
  updateLeadStatus(@Param('id') id: string, @Body() dto: UpdateLeadStatusDto) {
    return this.adminService.updateLeadStatus(id, dto);
  }

  @Delete('leads/:id')
  @ApiTags('Admin - Leads')
  @ApiOperation({ summary: 'Delete a lead record' })
  @ApiParam({ name: 'id', type: String })
  deleteLead(@Param('id') id: string) {
    return this.adminService.deleteLead(id);
  }

  // ---------- Appointments ----------

  @Get('appointments')
  @ApiTags('Admin - Appointments')
  @ApiOperation({ summary: 'List appointments, optionally filtered by status' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'],
  })
  findAllAppointments(@Query('status') status?: string) {
    return this.adminService.findAllAppointments(status);
  }

  @Get('appointments/:id')
  @ApiTags('Admin - Appointments')
  @ApiOperation({ summary: 'Get an appointment by id' })
  @ApiParam({ name: 'id', type: String })
  findAppointmentById(@Param('id') id: string) {
    return this.adminService.findAppointmentById(id);
  }

  @Patch('appointments/:id')
  @ApiTags('Admin - Appointments')
  @ApiOperation({ summary: 'Update appointment status or clinical notes' })
  @ApiParam({ name: 'id', type: String })
  updateAppointment(
    @Param('id') id: string,
    @Body() body: { status?: string; notes?: string; scheduledAt?: string },
  ) {
    return this.adminService.updateAppointment(id, body);
  }

  @Delete('appointments/:id')
  @ApiTags('Admin - Appointments')
  @ApiOperation({ summary: 'Delete an appointment record' })
  @ApiParam({ name: 'id', type: String })
  deleteAppointment(@Param('id') id: string) {
    return this.adminService.deleteAppointment(id);
  }

  // ---------- Users & Conversation Logs ----------

  @Get('users')
  @ApiTags('Admin - Users')
  @ApiOperation({ summary: 'List all known WhatsApp users' })
  findAllUsers() {
    return this.adminService.findAllUsers();
  }

  @Get('users/:id/conversation')
  @ApiTags('Admin - Users')
  @ApiOperation({ summary: 'Inspect the full conversation log for a user' })
  @ApiParam({ name: 'id', type: String })
  findConversationByUserId(@Param('id') id: string) {
    return this.adminService.findConversationByUserId(id);
  }
}
