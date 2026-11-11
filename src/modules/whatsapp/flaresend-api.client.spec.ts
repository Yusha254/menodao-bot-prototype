import axios, {
  AxiosAdapter,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';
import { createCipheriv, createHmac, hkdfSync, randomBytes } from 'crypto';
import { Readable } from 'stream';
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

  it('downloads and decrypts an authenticated WhatsApp image', async () => {
    const mediaKey = randomBytes(32);
    const expandedKeys = Buffer.from(
      hkdfSync(
        'sha256',
        mediaKey,
        Buffer.alloc(0),
        Buffer.from('WhatsApp Image Keys'),
        112,
      ),
    );
    const iv = expandedKeys.subarray(0, 16);
    const cipherKey = expandedKeys.subarray(16, 48);
    const macKey = expandedKeys.subarray(48, 80);
    const imageData = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
    const cipher = createCipheriv('aes-256-cbc', cipherKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(imageData),
      cipher.final(),
    ]);
    const mac = createHmac('sha256', macKey)
      .update(iv)
      .update(ciphertext)
      .digest()
      .subarray(0, 10);
    const encryptedData = Buffer.concat([ciphertext, mac]);
    let request: InternalAxiosRequestConfig | undefined;
    const adapter: AxiosAdapter = async (config) => {
      request = config;
      return {
        data: Readable.from([encryptedData]),
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders({ 'content-length': encryptedData.length }),
        config,
      };
    };
    const http = axios.create({ adapter });
    jest.spyOn(axios, 'create').mockReturnValue(http);
    const client = new FlaresendApiClient(
      new ConfigService({ FLARESEND_API_KEY: 'test-key' }),
    );

    const image = await client.downloadImage({
      url: 'https://mmg.whatsapp.net/v/image.enc',
      mediaKey: mediaKey.toString('base64'),
      mimetype: 'image/jpeg',
      fileLength: imageData.length,
    });

    expect(image).toEqual({ mimeType: 'image/jpeg', data: imageData });
    expect(request?.headers.get('Authorization')).toBeUndefined();
  });

  it('downloads and decrypts a Flaresend voice note', async () => {
    const mediaKey = randomBytes(32);
    const expandedKeys = Buffer.from(
      hkdfSync(
        'sha256',
        mediaKey,
        Buffer.alloc(0),
        Buffer.from('WhatsApp Audio Keys'),
        112,
      ),
    );
    const iv = expandedKeys.subarray(0, 16);
    const cipherKey = expandedKeys.subarray(16, 48);
    const macKey = expandedKeys.subarray(48, 80);
    const audioData = Buffer.from('OggS voice note payload');
    const cipher = createCipheriv('aes-256-cbc', cipherKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(audioData),
      cipher.final(),
    ]);
    const mac = createHmac('sha256', macKey)
      .update(iv)
      .update(ciphertext)
      .digest()
      .subarray(0, 10);
    const encryptedData = Buffer.concat([ciphertext, mac]);
    const adapter: AxiosAdapter = async (config) => ({
      data: Readable.from([encryptedData]),
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders({ 'content-length': encryptedData.length }),
      config,
    });
    jest.spyOn(axios, 'create').mockReturnValue(axios.create({ adapter }));
    const client = new FlaresendApiClient(
      new ConfigService({ FLARESEND_API_KEY: 'test-key' }),
    );

    const result = await client.downloadAudio({
      url: 'https://mmg.whatsapp.net/v/audio.enc',
      mediaKey: mediaKey.toString('base64'),
      mimetype: 'audio/ogg; codecs=opus',
      fileLength: audioData.length,
    });

    expect(result).toEqual(audioData);
  });

  it('rejects image URLs outside the WhatsApp media host', async () => {
    const adapter = jest
      .fn<AxiosAdapter>()
      .mockImplementation(async (config) => ({
        data: Buffer.alloc(0),
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }));
    jest.spyOn(axios, 'create').mockReturnValue(axios.create({ adapter }));
    const client = new FlaresendApiClient(
      new ConfigService({ FLARESEND_API_KEY: 'test-key' }),
    );

    await expect(
      client.downloadImage({
        url: 'https://attacker.example/image.enc',
        mediaKey: randomBytes(32).toString('base64'),
        mimetype: 'image/jpeg',
      }),
    ).rejects.toThrow('unsupported media URL');
    expect(adapter).not.toHaveBeenCalled();
  });

  it('rejects an image with an invalid media authentication code', async () => {
    const mediaKey = randomBytes(32);
    const expandedKeys = Buffer.from(
      hkdfSync(
        'sha256',
        mediaKey,
        Buffer.alloc(0),
        Buffer.from('WhatsApp Image Keys'),
        112,
      ),
    );
    const cipher = createCipheriv(
      'aes-256-cbc',
      expandedKeys.subarray(16, 48),
      expandedKeys.subarray(0, 16),
    );
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from([0xff, 0xd8, 0xff])),
      cipher.final(),
    ]);
    const invalidMac = Buffer.alloc(10);
    const encryptedData = Buffer.concat([ciphertext, invalidMac]);
    const adapter: AxiosAdapter = async (config) => ({
      data: Readable.from([encryptedData]),
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
      client.downloadImage({
        url: 'https://mmg.whatsapp.net/v/image.enc',
        mediaKey: mediaKey.toString('base64'),
        mimetype: 'image/jpeg',
      }),
    ).rejects.toThrow('integrity verification failed');
  });
});
