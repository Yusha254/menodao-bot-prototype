import { ConfigService } from '@nestjs/config';
import { AdminAuthService } from '../modules/admin/admin-auth.service';
import { PrismaService } from '../common/prisma/prisma.service';

describe('AdminAuthService', () => {
  it('hashes and verifies a password', async () => {
    const prisma = {
      adminUser: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;

    const service = new AdminAuthService(prisma, new ConfigService());

    const password = 'SuperStrongPass123!';
    const hash = service.hashPassword(password);

    expect(hash).toContain(':');
    expect(service.verifyPassword(password, hash)).toBe(true);
    expect(service.verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('rejects invalid admin credentials', async () => {
    const prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          passwordHash: 'salt:hash',
          isActive: true,
        }),
      },
    } as unknown as PrismaService;

    const service = new AdminAuthService(prisma, new ConfigService());

    const result = await service.authenticate('admin@example.com', 'bad-password');

    expect(result).toBeNull();
  });

  it('creates or links a Google-backed admin account', async () => {
    const prisma = {
      adminUser: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({
          id: 'google-admin-1',
          email: 'google-admin@example.com',
          isActive: true,
        }),
        update: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'google-admin@example.com',
          googleId: 'google-123',
          authProvider: 'google',
          isActive: true,
        }),
      },
    } as unknown as PrismaService;

    const service = new AdminAuthService(prisma, new ConfigService());

    const firstResult = await service.findOrCreateGoogleAdmin({
      sub: 'google-123',
      email: 'Google-Admin@Example.com',
      name: 'Google Admin',
    });

    expect(firstResult).toMatchObject({
      id: 'google-admin-1',
      email: 'google-admin@example.com',
    });

    const secondResult = await service.findOrCreateGoogleAdmin({
      sub: 'google-123',
      email: 'google-admin@example.com',
      name: 'Google Admin',
    });

    expect(secondResult).toMatchObject({
      id: 'google-admin-1',
      email: 'google-admin@example.com',
    });
  });
});
