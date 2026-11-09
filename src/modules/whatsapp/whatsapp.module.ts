import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { WhatsappApiClient } from './whatsapp-api.client';
import { FlaresendApiClient } from './flaresend-api.client';
import { WaboxappApiClient } from './waboxapp-api.client';
import { WhatsappIdentityService } from './whatsapp-identity.service';
import { RegistrationController } from './registration.controller';
import { WHATSAPP_CLIENT } from './interfaces/whatsapp-provider.interface';
import { VoicePipelineModule } from '../voice-pipeline/voice-pipeline.module';

const logger = new Logger('WhatsappModule');

const whatsappProviderFactory: Provider = {
  provide: WHATSAPP_CLIENT,
  inject: [
    ConfigService,
    FlaresendApiClient,
    WhatsappApiClient,
    WaboxappApiClient,
  ],
  useFactory: (
    configService: ConfigService,
    flaresendApiClient: FlaresendApiClient,
    whatsappApiClient: WhatsappApiClient,
    waboxappApiClient: WaboxappApiClient,
  ) => {
    const provider = (
      configService.get<string>('WHATSAPP_PROVIDER') ?? 'flaresend'
    ).toLowerCase();

    logger.log(`Wiring WHATSAPP_CLIENT token to "${provider}" provider.`);

    switch (provider) {
      case 'meta':
        return whatsappApiClient;
      case 'waboxapp':
        return waboxappApiClient;
      case 'flaresend':
      default:
        return flaresendApiClient;
    }
  },
};

@Module({
  imports: [ConfigModule, VoicePipelineModule],
  controllers: [RegistrationController],
  providers: [
    WhatsappApiClient,
    FlaresendApiClient,
    WaboxappApiClient,
    whatsappProviderFactory,
    WhatsappService,
    WhatsappIdentityService,
  ],
  exports: [
    WhatsappService,
    WhatsappIdentityService,
    WHATSAPP_CLIENT,
    WhatsappApiClient,
    FlaresendApiClient,
    WaboxappApiClient,
  ],
})
export class WhatsappModule {}
