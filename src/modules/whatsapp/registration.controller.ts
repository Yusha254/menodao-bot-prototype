import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { IsBoolean, IsString, Length } from 'class-validator';
import { Response } from 'express';
import { WhatsappIdentityService } from './whatsapp-identity.service';

class StartRegistrationDto {
  @IsString()
  @Length(8, 30)
  phone!: string;

  @IsBoolean()
  consent!: boolean;
}

const REGISTRATION_PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connect your WhatsApp account</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 32px 16px; background: #f3f6fa; color: #172033; font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 480px; margin: 8vh auto; padding: 28px; background: white; border: 1px solid #dfe5ee; border-radius: 14px; box-shadow: 0 12px 34px #17203312; }
    h1 { margin-top: 0; font-size: 1.6rem; }
    p { color: #536176; }
    label { display: block; margin: 18px 0 6px; font-weight: 600; }
    input[type="tel"] { width: 100%; padding: 12px; border: 1px solid #aeb9ca; border-radius: 8px; font: inherit; }
    .consent { display: flex; gap: 10px; align-items: flex-start; margin: 18px 0; font-weight: 400; }
    .consent input { margin-top: 5px; }
    button { display: inline-block; padding: 11px 16px; border: 0; border-radius: 8px; background: #1468d4; color: white; font: inherit; font-weight: 600; cursor: pointer; }
    button:disabled { opacity: .6; cursor: wait; }
    [hidden] { display: none !important; }
    #status { min-height: 1.5em; margin: 12px 0; color: #a32121; }
  </style>
</head>
<body>
  <main>
    <h1>Connect your WhatsApp account</h1>
    <p>Enter the phone number for the WhatsApp account you want to connect.</p>
    <form id="phone-form">
      <label for="phone">Phone number (include country code)</label>
      <input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+254712345678" required>
      <label class="consent"><input id="consent" type="checkbox" required>
        <span>I agree to store this number to identify my WhatsApp account and reply to my messages.</span>
      </label>
      <button id="send-code" type="submit">Send 6-digit code</button>
    </form>
    <section id="next-step" hidden>
      <h2>Check WhatsApp</h2>
      <p>We sent a 6-digit verification code to that number. Send the code to the dental assistant from the WhatsApp account you want to link. Once it is verified, the assistant will confirm and you can start chatting. The code expires in 10 minutes.</p>
    </section>
    <p id="status" role="status" aria-live="polite"></p>
  </main>
  <script>
    const form = document.getElementById('phone-form');
    const status = document.getElementById('status');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = '';
      const button = document.getElementById('send-code');
      button.disabled = true;
      try {
        const response = await fetch('/register/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: document.getElementById('phone').value,
            consent: document.getElementById('consent').checked
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(Array.isArray(result.message) ? result.message.join(' ') : (result.message || 'Request failed. Please try again.'));
        }
        form.hidden = true;
        document.getElementById('next-step').hidden = false;
        status.textContent = '';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  </script>
</body>
</html>`;

@Controller('register')
export class RegistrationController {
  constructor(
    private readonly whatsappIdentityService: WhatsappIdentityService,
  ) {}

  @Get()
  @ApiExcludeEndpoint()
  showRegistrationPage(@Res() response: Response): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    response.type('html').send(REGISTRATION_PAGE);
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  async startRegistration(
    @Body() input: StartRegistrationDto,
  ): Promise<{ status: string }> {
    if (!input.consent) {
      throw new BadRequestException(
        'Consent is required to store and use the phone number.',
      );
    }
    await this.whatsappIdentityService.startPhoneLinking(input.phone);
    return { status: 'code_sent' };
  }
}
