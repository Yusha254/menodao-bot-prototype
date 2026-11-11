import { ConfigService } from '@nestjs/config';
import { describe, expect, it, jest } from '@jest/globals';
import { GeminiProvider } from './gemini.provider';

describe('GeminiProvider', () => {
  it('sends image bytes as inline data', async () => {
    const generateContent = jest
      .fn<() => Promise<{ text: string }>>()
      .mockResolvedValue({ text: 'A clear image description.' });
    const provider = new GeminiProvider(
      new ConfigService({ GEMINI_API_KEY: 'test-key' }),
    );
    Object.defineProperty(provider, 'client', {
      value: { models: { generateContent } },
    });

    await provider.generateCompletion({
      systemPrompt: 'Describe the image safely.',
      userPrompt: 'What is in this image?',
      image: { mimeType: 'image/jpeg', data: Buffer.from([1, 2, 3]) },
    });

    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: [
          {
            role: 'user',
            parts: [
              { text: 'What is in this image?' },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: 'AQID',
                },
              },
            ],
          },
        ],
      }),
    );
  });
});
