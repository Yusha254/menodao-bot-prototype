export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmImageInput {
  mimeType: string;
  data: Buffer;
}

export interface GenerateResponseOptions {
  systemPrompt: string;
  userPrompt: string;
  history?: ChatHistoryMessage[];
  image?: LlmImageInput;
  /** Identifies the workflow that issued this completion. */
  operation?: string;
  /** If 'json', both providers will request structured JSON output. */
  responseFormat?: 'json';
}

export interface ILlmProvider {
  generateCompletion(options: GenerateResponseOptions): Promise<string>;
}

export const LLM_PROVIDER = 'LLM_PROVIDER';
