import axios, {
  AxiosAdapter,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { WaboxappApiClient } from './waboxapp-api.client';

describe('WaboxappApiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a URL-encoded chat request with the configured account and recipient', async () => {
    let request: InternalAxiosRequestConfig | undefined;
    const adapter: AxiosAdapter = async (config) => {
      request = config;
      return {
        data: { success: true },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const http = axios.create({ adapter });
    const createSpy = jest.spyOn(axios, 'create').mockReturnValue(http);

    const configService = new ConfigService({
      WABOXAPP_API_TOKEN: 'test-token',
      WABOXAPP_PHONE_NUMBER: '+254 700 000 001',
      WABOXAPP_BASE_URL: 'https://example.test/api',
    });
    const client = new WaboxappApiClient(configService);

    await client.sendTextMessage('+254 700 000 002', 'Hello there');

    expect(request?.url).toBe('/send/chat');
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://example.test/api',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }),
    );
    expect(request?.headers.get('Content-Type')).toBe(
      'application/x-www-form-urlencoded',
    );

    const formData = new URLSearchParams(request?.data);
    expect(formData.get('token')).toBe('test-token');
    expect(formData.get('uid')).toBe('254700000001');
    expect(formData.get('to')).toBe('254700000002');
    expect(formData.get('text')).toBe('Hello there');
    expect(formData.get('custom_uid')).toEqual(expect.any(String));
    expect(
      client.isRecentlySentTextMessage('+254 700 000 002', 'Hello there'),
    ).toBe(true);
    expect(
      client.isRecentlySentTextMessage('+254 700 000 003', 'Hello there'),
    ).toBe(false);
  });

  it('fails clearly when the API token is not configured', async () => {
    const http = axios.create();
    jest.spyOn(axios, 'create').mockReturnValue(http);

    const client = new WaboxappApiClient(
      new ConfigService({ WABOXAPP_PHONE_NUMBER: '254700000001' }),
    );

    await expect(
      client.sendTextMessage('254700000002', 'Hello there'),
    ).rejects.toThrow('WABOXAPP_API_TOKEN is not configured.');
  });
});
