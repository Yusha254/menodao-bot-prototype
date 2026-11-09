import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AiModule } from '../ai/ai.module';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthGuard } from './admin-auth.guard';

@Module({
  imports: [AiModule],
  controllers: [AdminController],
  providers: [AdminService, AdminAuthService, AdminAuthGuard],
  exports: [AdminService, AdminAuthService],
})
export class AdminModule {}
