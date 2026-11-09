import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ADMIN_KEY = 'isPublicAdmin';

export const PublicAdminRoute = () => SetMetadata(IS_PUBLIC_ADMIN_KEY, true);
