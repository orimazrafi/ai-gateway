/** Base URL for gateway API. Set NEXT_PUBLIC_GATEWAY_URL on Vercel so the dashboard calls the gateway directly. */
const GATEWAY_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GATEWAY_URL)
    ? process.env.NEXT_PUBLIC_GATEWAY_URL.replace(/\/$/, '')
    : ''

function apiUrl(path: string): string {
  return GATEWAY_BASE ? `${GATEWAY_BASE}${path.startsWith('/') ? path : `/${path}`}` : path
}

export interface ChatOptions {
  /** When using SSO, pass session token and omit apiKey */
  sessionToken?: string
  apiKey?: string
  upstream?: string
  model: string
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  stream?: boolean
}

export async function chatStream(
  opts: ChatOptions,
  onChunk: (text: string) => void,
  onDone?: () => void
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts.sessionToken) {
    headers['X-Session-Token'] = opts.sessionToken
  } else if (opts.apiKey) {
    headers['Authorization'] = `Bearer ${opts.apiKey}`
  }
  if (opts.upstream) headers['X-AI-Gateway-Upstream'] = opts.upstream

  const res = await fetch(apiUrl('/v1/chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message || res.statusText)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6)
          if (data === '[DONE]') continue
          try {
            const j = JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }
            const content = j.choices?.[0]?.delta?.content
            if (content) onChunk(content)
          } catch {
            // skip malformed chunk
          }
        }
      }
    }
  } finally {
    onDone?.()
  }
}

export async function chatNonStream(opts: ChatOptions): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (opts.sessionToken) headers['X-Session-Token'] = opts.sessionToken
  else if (opts.apiKey) headers['Authorization'] = `Bearer ${opts.apiKey}`
  if (opts.upstream) headers['X-AI-Gateway-Upstream'] = opts.upstream

  const res = await fetch(apiUrl('/v1/chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: { message?: string } }).error?.message || res.statusText)
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

export interface ValidateCredentialsOptions {
  apiKey: string
  upstream?: string
  model: string
}

/** Minimal request to verify the API key works; throws on invalid/error. */
export async function validateCredentials(opts: ValidateCredentialsOptions): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${opts.apiKey}`,
  }
  if (opts.upstream) headers['X-AI-Gateway-Upstream'] = opts.upstream

  const res = await fetch(apiUrl('/v1/chat/completions'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 1,
      stream: false,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as { error?: { message?: string } }).error?.message
    throw new Error(msg || res.statusText || 'Invalid credentials')
  }
}

export async function fetchCosts(): Promise<Record<string, number>> {
  const res = await fetch(apiUrl('/api/costs'))
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

export interface PromptLogEntry {
  id: string
  ts: number
  model: string
  keyHint: string
  promptTokens?: number
  completionTokens?: number
  requestPreview?: string
  responsePreview?: string
}

export async function fetchPromptLog(limit = 50): Promise<PromptLogEntry[]> {
  const res = await fetch(apiUrl(`/api/prompt-log?limit=${limit}`))
  if (!res.ok) throw new Error(res.statusText)
  return res.json()
}

/** Auth */
export async function getAuthConfig(): Promise<{ ssoEnabled: boolean; loginUrl: string | null }> {
  const res = await fetch(apiUrl('/auth/config'))
  if (!res.ok) return { ssoEnabled: false, loginUrl: null }
  return res.json()
}

export interface AuthUser {
  id: string
  email: string
  name?: string
  picture?: string
}

export interface AuthSettings {
  provider: string
  upstream: string
  model: string
  hasApiKey: boolean
}

export async function getMe(sessionToken: string): Promise<{ user: AuthUser; settings: AuthSettings }> {
  const res = await fetch(apiUrl('/auth/me'), {
    headers: { 'X-Session-Token': sessionToken },
  })
  if (!res.ok) throw new Error('Session invalid')
  return res.json()
}

export async function saveSettings(
  sessionToken: string,
  body: { provider?: string; upstream?: string; model?: string; apiKey?: string }
): Promise<void> {
  const res = await fetch(apiUrl('/auth/settings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Session-Token': sessionToken },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Failed to save settings')
}

export function getLoginUrl(): string {
  return GATEWAY_BASE ? `${GATEWAY_BASE}/auth/login` : '/auth/login'
}
