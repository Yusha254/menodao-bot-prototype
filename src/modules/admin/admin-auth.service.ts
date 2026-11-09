import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import { Response } from 'express';
import axios from 'axios';

export const ADMIN_SESSION_COOKIE = 'dental_admin_session';
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;

interface AdminSession {
  adminUserId: string;
  expiresAt: number;
}

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly sessions = new Map<string, AdminSession>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const email = this.configService.get<string>('ADMIN_BOOTSTRAP_EMAIL')?.trim().toLowerCase();
    const password = this.configService.get<string>('ADMIN_BOOTSTRAP_PASSWORD');

    if (!email || !password) {
      return;
    }

    const existing = await this.prisma.adminUser.findUnique({ where: { email } });

    if (existing) {
      return;
    }

    await this.prisma.adminUser.create({
      data: {
        email,
        passwordHash: this.hashPassword(password),
        isActive: true,
      },
    });

    this.logger.log(`Bootstrap admin account created for ${email}.`);
  }

  getSession(token: string): AdminSession | null {
    const session = this.sessions.get(token);

    if (!session) {
      return null;
    }

    if (session.expiresAt < Date.now()) {
      this.sessions.delete(token);
      return null;
    }

    return session;
  }

  deleteSession(token: string): void {
    this.sessions.delete(token);
  }

  async getAdminById(id: string) {
    return this.prisma.adminUser.findUnique({ where: { id } });
  }

  async authenticate(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!adminUser || !adminUser.isActive) {
      return null;
    }

    if (!this.verifyPassword(password, adminUser.passwordHash)) {
      return null;
    }

    return {
      id: adminUser.id,
      email: adminUser.email,
    };
  }

  async findOrCreateGoogleAdmin(profile: {
    sub: string;
    email: string;
    name?: string;
  }) {
    const normalizedEmail = profile.email.trim().toLowerCase();
    const existingAdmin = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingAdmin) {
      if (!existingAdmin.isActive) {
        return null;
      }

      if (existingAdmin.googleId !== profile.sub || existingAdmin.authProvider !== 'google') {
        const updatedAdmin = await this.prisma.adminUser.update({
          where: { id: existingAdmin.id },
          data: {
            googleId: profile.sub,
            authProvider: 'google',
          },
        });

        return {
          id: updatedAdmin.id,
          email: updatedAdmin.email,
        };
      }

      return {
        id: existingAdmin.id,
        email: existingAdmin.email,
      };
    }

    const createdAdmin = await this.prisma.adminUser.create({
      data: {
        email: normalizedEmail,
        passwordHash: this.hashPassword(randomBytes(32).toString('hex')),
        googleId: profile.sub,
        authProvider: 'google',
        isActive: true,
      },
    });

    return {
      id: createdAdmin.id,
      email: createdAdmin.email,
    };
  }

  getGoogleAuthUrl(): string | null {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      return null;
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeGoogleCodeForUser(code: string): Promise<{
    sub: string;
    email: string;
    name?: string;
  }> {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Google OAuth is not configured.');
    }

    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const accessToken = tokenResponse.data?.access_token;

    if (!accessToken) {
      throw new Error('Google OAuth token exchange did not return an access token.');
    }

    const userInfoResponse = await axios.get(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const userInfo = userInfoResponse.data;

    if (!userInfo?.email || userInfo.email_verified === false) {
      throw new Error('Google account email is missing or not verified.');
    }

    return {
      sub: userInfo.sub,
      email: userInfo.email,
      name: userInfo.name,
    };
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derived = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
    return `${salt}:${derived}`;
  }

  verifyPassword(password: string, storedHash: string): boolean {
    const [salt, hashValue] = storedHash.split(':');

    if (!salt || !hashValue) {
      return false;
    }

    const derived = pbkdf2Sync(password, salt, 100_000, 64, 'sha512').toString('hex');
    const storedBuffer = Buffer.from(hashValue, 'hex');
    const derivedBuffer = Buffer.from(derived, 'hex');

    if (storedBuffer.length !== derivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(storedBuffer, derivedBuffer);
  }

  createSession(adminUserId: string): string {
    const token = randomBytes(32).toString('hex');

    this.sessions.set(token, {
      adminUserId,
      expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
    });

    return token;
  }

  setSessionCookie(response: Response, token: string): void {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie(ADMIN_SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
      maxAge: ADMIN_SESSION_TTL_MS,
    });
  }
}
