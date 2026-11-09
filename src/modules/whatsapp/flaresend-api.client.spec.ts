import axios, {
  AxiosAdapter,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { FlaresendApiClient } from './flaresend-api.client';

describe('FlaresendApiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends to a phone number and requires provider confirmation', async () => {
    let request: InternalAxiosRequestConfig | undefined;
    const adapter: AxiosAdapter = async (config) => {
      request = config;
      return {
        data: { success: true, failed_recipients: [], invalid_recipients: [] },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const http = axios.create({ adapter });
    const createSpy = jest.spyOn(axios, 'create').mockReturnValue(http);
    const client = new FlaresendApiClient(
      new ConfigService({
        FLARESEND_API_KEY: 'test-key',
        FLARESEND_BASE_URL: 'https://example.test',
      }),
    );

    await client.sendTextMessage('+254 712 345 678', 'Link this account');

    expect(createSpy).toHaveBeenCalled();
    expect(request?.url).toBe('/send-message');
    expect(JSON.parse(String(request?.data))).toEqual({
      recipients: ['254712345678'],
      type: 'text',
      text: 'Link this account',
    });
  });

  it('rejects recipients the provider reports as invalid', async () => {
    const adapter: AxiosAdapter = async (config) => ({
      data: {
        success: true,
        failed_recipients: [],
        invalid_recipients: ['254712345678@s.whatsapp.net'],
      },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    });
    jest.spyOn(axios, 'create').mockReturnValue(axios.create({ adapter }));
    const client = new FlaresendApiClient(
      new ConfigService({ FLARESEND_API_KEY: 'test-key' }),
    );

    await expect(
      client.sendTextMessage('254712345678', 'Link this account'),
    ).rejects.toThrow('Recipient is not registered on WhatsApp.');
  });
});
