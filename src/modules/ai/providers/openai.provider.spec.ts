import { ConfigService } from '@nestjs/config';
import { describe, expect, it, jest } from '@jest/globals';
import { OpenAiProvider } from './openai.provider';

describe('OpenAiProvider', () => {
  it('sends image bytes as a data URL', async () => {
    const create = jest
      .fn<
        () => Promise<{
          choices: Array<{ message: { content: string } }>;
        }>
      >()
      .mockResolvedValue({
        choices: [{ message: { content: 'A clear image description.' } }],
      });
    const provider = new OpenAiProvider(
      new ConfigService({ OPENAI_API_KEY: 'test-key' }),
    );
    Object.defineProperty(provider, 'client', {
      value: { chat: { completions: { create } } },
    });

    await provider.generateCompletion({
      systemPrompt: 'Describe the image safely.',
      userPrompt: 'What is in this image?',
      image: { mimeType: 'image/jpeg', data: Buffer.from([1, 2, 3]) },
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'system', content: 'Describe the image safely.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: {
                  url: 'data:image/jpeg;base64,AQID',
                },
              },
            ],
          },
        ],
      }),
    );
  });
});
