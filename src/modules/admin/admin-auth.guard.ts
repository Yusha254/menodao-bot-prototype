import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { AdminAuthService, ADMIN_SESSION_COOKIE } from './admin-auth.service';
import { IS_PUBLIC_ADMIN_KEY } from './admin-auth.decorator';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      cookies?: Record<string, string>;
      accepts?: (value: string) => boolean;
      admin?: { id: string; email: string };
    }>();
    const response = context.switchToHttp().getResponse<Response>();
    const token = request.cookies?.[ADMIN_SESSION_COOKIE];

    if (!token) {
      if (request.accepts?.('html')) {
        response.redirect('/admin/login');
        return false;
      }
      throw new UnauthorizedException('Authentication required.');
    }

    const session = this.adminAuthService.getSession(token);

    if (!session) {
      if (request.accepts?.('html')) {
        response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
        response.redirect('/admin/login');
        return false;
      }
      throw new UnauthorizedException('Your session is invalid or expired.');
    }

    const adminUser = await this.adminAuthService.getAdminById(session.adminUserId);

    if (!adminUser || !adminUser.isActive) {
      this.adminAuthService.deleteSession(token);
      if (request.accepts?.('html')) {
        response.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
        response.redirect('/admin/login');
        return false;
      }
      throw new UnauthorizedException('Admin account is disabled or unavailable.');
    }

    request.admin = {
      id: adminUser.id,
      email: adminUser.email,
    };

    return true;
  }
}
