export type MessageRole = 'user' | 'assistant' | 'system'

/** Saved combination of provider + API key + model for quick switching */
export interface Preset {
  id: string
  name: string
  provider: string
  upstream: string
  model: string
  apiKey: string
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
}

export type ProviderId = '' | 'groq' | 'together' | 'openrouter' | 'custom'

export const PROVIDERS = [
  { id: '' as ProviderId, label: 'OpenAI', upstream: '' },
  { id: 'groq' as ProviderId, label: 'Groq (free)', upstream: 'https://api.groq.com/openai/v1' },
  { id: 'together' as ProviderId, label: 'Together AI', upstream: 'https://api.together.xyz/v1' },
  { id: 'openrouter' as ProviderId, label: 'OpenRouter', upstream: 'https://openrouter.ai/api/v1' },
  { id: 'custom' as ProviderId, label: 'Custom URL', upstream: 'custom' },
] as const

export const MODELS: Record<string, { value: string; label: string }[]> = {
  '': [
    { value: 'gpt-3.5-turbo', label: 'gpt-3.5-turbo' },
    { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
    { value: 'gpt-4o', label: 'gpt-4o' },
  ],
  'https://api.groq.com/openai/v1': [
    { value: 'llama-3.1-8b-instant', label: 'llama-3.1-8b-instant' },
    { value: 'llama-3.1-70b-versatile', label: 'llama-3.1-70b-versatile' },
    { value: 'llama-3.3-70b-versatile', label: 'llama-3.3-70b-versatile' },
    { value: 'mixtral-8x7b-32768', label: 'mixtral-8x7b-32768' },
  ],
  'https://api.together.xyz/v1': [
    { value: 'meta-llama/Llama-3.2-3B-Instruct-Turbo', label: 'Llama 3.2 3B' },
    { value: 'meta-llama/Llama-3.2-90B-Instruct-Turbo', label: 'Llama 3.2 90B' },
    { value: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B' },
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
    { value: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B' },
  ],
  'https://openrouter.ai/api/v1': [
    { value: 'openai/gpt-3.5-turbo', label: 'OpenAI GPT-3.5 Turbo' },
    { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { value: 'anthropic/claude-3-haiku', label: 'Claude 3 Haiku' },
    { value: 'google/gemini-pro', label: 'Google Gemini Pro' },
    { value: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
  ],
}
