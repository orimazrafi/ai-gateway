'use client'

import Image from 'next/image'
import { useState, useRef, useEffect } from 'react'
import {
  chatStream,
  fetchCosts,
  fetchPromptLog,
  validateCredentials,
  getAuthConfig,
  getMe,
  saveSettings,
  type PromptLogEntry,
  type AuthUser,
  type AuthSettings,
} from '@/lib/api'
import type { Message, Preset } from '@/lib/types'
import { PROVIDERS, MODELS } from '@/lib/types'

const SESSION_KEY = 'ai-gateway-session'
const PRESETS_KEY = 'ai-gateway-presets'

function loadPresetsFromStorage(): Preset[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePresetsToStorage(presets: Preset[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets))
}

type View = 'chat' | 'usage'

export default function Dashboard() {
  const [apiKey, setApiKey] = useState('')
  const [provider, setProvider] = useState<string>('')
  const [customUpstream, setCustomUpstream] = useState('')
  const [model, setModel] = useState('gpt-3.5-turbo')
  const [customModel, setCustomModel] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [view, setView] = useState<View>('chat')
  const [costs, setCosts] = useState<Record<string, number>>({})
  const [promptLog, setPromptLog] = useState<PromptLogEntry[]>([])
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [settingsSubmitted, setSettingsSubmitted] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [validating, setValidating] = useState(false)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [user, setUser] = useState<AuthUser | null>(null)
  const [serverSettings, setServerSettings] = useState<AuthSettings | null>(null)
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [settingsModalOpen, setSettingsModalOpen] = useState(false)
  const [presets, setPresets] = useState<Preset[]>([])
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [navUserOpen, setNavUserOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    let token: string | null = null
    const hash = window.location.hash
    const hashMatch = hash.match(/#token=(.+)/)
    if (hashMatch) {
      token = decodeURIComponent(hashMatch[1].replace(/&.*$/, ''))
      sessionStorage.setItem(SESSION_KEY, token)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else {
      token = sessionStorage.getItem(SESSION_KEY)
    }
    setSessionToken(token)
    const list = loadPresetsFromStorage()
    setPresets(list)
    const stored = localStorage.getItem(PRESETS_KEY + '-active')
    setActivePresetId(stored && list.some((p) => p.id === stored) ? stored : list[0]?.id ?? null)
  }, [mounted])

  const upstream =
    provider === 'custom'
      ? customUpstream
      : (PROVIDERS.find((p) => p.id === provider)?.upstream ?? '') || ''
  const models = provider === 'custom' ? [] : (MODELS[upstream] ?? MODELS[''])
  const effectiveModel = provider === 'custom' ? customModel : model

  useEffect(() => {
    if (models.length && !models.some((m) => m.value === model)) {
      setModel(models[0].value)
    }
    // Intentionally omit model/models to avoid reset loops when provider/upstream change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, upstream])


  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        const config = await getAuthConfig()
        if (!cancelled) {
          setSsoEnabled(config.ssoEnabled)
          setLoginUrl(config.loginUrl || null)
        }
        if (sessionToken) {
          const data = await getMe(sessionToken)
          if (!cancelled) {
            setUser(data.user)
            setServerSettings(data.settings)
            if (data.settings.hasApiKey) setSettingsSubmitted(true)
          }
        }
      } catch {
        if (!cancelled) setSessionToken(null)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [sessionToken, mounted])

  const handleSettingsChange = () => {
    setSettingsSubmitted(false)
    setValidationErrors([])
    setMessages([])
    loadUsage()
  }

  const validateAndSubmit = async () => {
    const errors: string[] = []
    if (!apiKey.trim()) errors.push('API key is required.')
    if (provider === 'custom') {
      if (!customUpstream.trim()) errors.push('Upstream URL is required for Custom provider.')
      if (!customModel.trim()) errors.push('Model is required for Custom provider.')
    } else if (!effectiveModel.trim()) {
      errors.push('Please select a model.')
    }
    setValidationErrors(errors)
    if (errors.length > 0) return

    setValidating(true)
    setValidationErrors([])
    try {
      await validateCredentials({
        apiKey: apiKey.trim(),
        upstream: upstream || undefined,
        model: effectiveModel,
      })
      if (sessionToken) {
        await saveSettings(sessionToken, {
          provider: provider || undefined,
          upstream: upstream || undefined,
          model: effectiveModel,
          apiKey: apiKey.trim(),
        })
        const data = await getMe(sessionToken)
        setUser(data.user)
        setServerSettings(data.settings)
      }
      setSettingsSubmitted(true)
      setSettingsModalOpen(false)
    } catch (e) {
      setValidationErrors([(e as Error).message])
    } finally {
      setValidating(false)
    }
  }

  const logOut = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setSessionToken(null)
    setUser(null)
    setServerSettings(null)
    setSettingsSubmitted(false)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadUsage = async () => {
    setUsageLoading(true)
    setUsageError(null)
    try {
      const [costsData, logData] = await Promise.all([
        fetchCosts(),
        fetchPromptLog(50),
      ])
      setCosts(costsData)
      setPromptLog(logData)
    } catch (e) {
      setUsageError((e as Error).message)
    } finally {
      setUsageLoading(false)
    }
  }

  useEffect(() => {
    if (view === 'usage') loadUsage()
  }, [view])

  useEffect(() => {
    if (view === 'usage') loadUsage()
  }, [view, provider, model, customUpstream, customModel])

  useEffect(() => {
    if (settingsModalOpen && serverSettings) {
      const u = serverSettings.upstream || ''
      const isGroq = u.includes('groq.com')
      const isTogether = u.includes('together.xyz')
      const isOpenRouter = u.includes('openrouter.ai')
      const isCustom = u && !isGroq && !isTogether && !isOpenRouter
      setProvider(isCustom ? 'custom' : isOpenRouter ? 'openrouter' : isTogether ? 'together' : isGroq ? 'groq' : '')
      if (isCustom) setCustomUpstream(serverSettings.upstream)
      setModel(serverSettings.model || 'gpt-3.5-turbo')
    }
  }, [settingsModalOpen, serverSettings])

  const applyPreset = (preset: Preset) => {
    setActivePresetId(preset.id)
    if (typeof window !== 'undefined') localStorage.setItem(PRESETS_KEY + '-active', preset.id)
    setProvider(preset.provider)
    if (preset.provider === 'custom') setCustomUpstream(preset.upstream)
    if (preset.provider === 'custom') setCustomModel(preset.model)
    else setModel(preset.model)
    setApiKey(preset.apiKey)
    setValidationErrors([])
    setMessages([])
    loadUsage()
  }

  const saveCurrentAsPreset = async () => {
    const errors: string[] = []
    if (!apiKey.trim()) errors.push('API key is required.')
    if (provider === 'custom') {
      if (!customUpstream.trim()) errors.push('Upstream URL is required for Custom.')
      if (!customModel.trim()) errors.push('Model is required for Custom.')
    } else if (!effectiveModel.trim()) {
      errors.push('Please select a model.')
    }
    if (errors.length > 0) {
      setValidationErrors(errors)
      return
    }
    setValidating(true)
    setValidationErrors([])
    try {
      await validateCredentials({
        apiKey: apiKey.trim(),
        upstream: upstream || undefined,
        model: effectiveModel,
      })
      const name =
        window.prompt('Preset name (e.g. "Groq - Llama")') ||
        `${PROVIDERS.find((p) => p.id === provider)?.label || provider} - ${effectiveModel}`
      const newPreset: Preset = {
        id: crypto.randomUUID(),
        name: name.trim() || 'Unnamed',
        provider,
        upstream: provider === 'custom' ? customUpstream : upstream,
        model: effectiveModel,
        apiKey,
      }
      const next = [...presets, newPreset]
      setPresets(next)
      savePresetsToStorage(next)
      setActivePresetId(newPreset.id)
      if (typeof window !== 'undefined') localStorage.setItem(PRESETS_KEY + '-active', newPreset.id)
    } catch (e) {
      setValidationErrors([(e as Error).message])
    } finally {
      setValidating(false)
    }
  }

  const deletePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id)
    setPresets(next)
    savePresetsToStorage(next)
    if (activePresetId === id) {
      setActivePresetId(next[0]?.id ?? null)
      if (next[0]) applyPreset(next[0])
      else if (typeof window !== 'undefined') localStorage.removeItem(PRESETS_KEY + '-active')
    }
  }

  const send = async () => {
    const text = input.trim()
    const useSession = Boolean(sessionToken && serverSettings?.hasApiKey)
    if (!text) return
    if (!useSession && !apiKey.trim()) {
      alert('Please set your API key in the sidebar or sign in and add it in Settings.')
      return
    }
    if (!useSession && !effectiveModel.trim()) {
      alert('Please select or enter a model.')
      return
    }

    setInput('')
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    setMessages((m) => [...m, userMsg])

    const assistantId = crypto.randomUUID()
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    }
    setMessages((m) => [...m, assistantMsg])
    setLoading(true)

    const chatHistory = [...messages, userMsg].map((msg) => ({
      role: msg.role as 'user' | 'assistant' | 'system',
      content: msg.content,
    }))

    const chatModel = useSession ? (serverSettings?.model || 'gpt-3.5-turbo') : effectiveModel
    const chatUpstream = useSession ? (serverSettings?.upstream || undefined) : (upstream || undefined)

    try {
      await chatStream(
        {
          ...(useSession ? { sessionToken: sessionToken! } : { apiKey: apiKey.trim() }),
          upstream: chatUpstream,
          model: chatModel,
          messages: chatHistory,
          stream: true,
        },
        (chunk) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantId ? { ...msg, content: msg.content + chunk } : msg
            )
          )
        },
        () => setLoading(false)
      )
    } catch (e) {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `Error: ${(e as Error).message}` }
            : msg
        )
      )
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  if (!mounted) {
    return (
      <div className="app">
        <aside className="sidebar open">
          <div className="sidebar-header">
            <h1>AI Gateway</h1>
            <button type="button" className="toggle-sidebar" aria-label="Open sidebar">◀</button>
          </div>
          <div className="sidebar-body">
            <p className="sidebar-hint">Loading…</p>
          </div>
        </aside>
        <main className="chat-main">
          <div className="api-key-required">
            <p>Loading…</p>
          </div>
        </main>
      </div>
    )
  }

  const renderSettingsForm = () => (
    <>
      {sessionToken && (
        <>
          {presets.length > 0 && (
            <label>
              <span>Preset</span>
              <select
                value={activePresetId ?? ''}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) {
                    const p = presets.find((x) => x.id === id)
                    if (p) applyPreset(p)
                  }
                }}
              >
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <details className="preset-manage">
                <summary>Manage presets</summary>
                <ul className="preset-list">
                  {presets.map((p) => (
                    <li key={p.id}>
                      <span>{p.name}</span>
                      <button type="button" className="preset-use-btn" onClick={() => applyPreset(p)}>Use</button>
                      <button type="button" className="preset-del-btn" onClick={() => deletePreset(p.id)}>Delete</button>
                    </li>
                  ))}
                </ul>
              </details>
            </label>
          )}
          {presets.length === 0 && (
            <p className="sidebar-hint">Save provider + key + model as a preset to switch quickly later.</p>
          )}
          {presets.length > 0 && (
            <p className="sidebar-hint preset-storage-hint">Presets are stored in this browser only.</p>
          )}
        </>
      )}
      <label>
        <span>Provider</span>
        <select value={provider} onChange={(e) => { setProvider(e.target.value); handleSettingsChange() }}>
          {PROVIDERS.map((p) => (
            <option key={p.id || 'default'} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      {provider === 'custom' && (
        <label>
          <span>Upstream URL</span>
          <input type="url" value={customUpstream} onChange={(e) => { setCustomUpstream(e.target.value); handleSettingsChange() }} placeholder="https://api.example.com/v1" />
        </label>
      )}
      <label>
        <span>Model</span>
        {provider === 'custom' ? (
          <input type="text" value={customModel} onChange={(e) => { setCustomModel(e.target.value); handleSettingsChange() }} placeholder="model-id" />
        ) : (
          <select value={model} onChange={(e) => { setModel(e.target.value); handleSettingsChange() }}>
            {models.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        )}
      </label>
      <label>
        <span>API key</span>
        <input type="password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); handleSettingsChange() }} placeholder="Paste your key" />
      </label>
      {validationErrors.length > 0 && (
        <div className="validation-errors" role="alert">
          {validationErrors.map((err, i) => <p key={i}>{err}</p>)}
        </div>
      )}
      <button type="button" className="submit-settings-btn" onClick={() => validateAndSubmit()} disabled={validating}>
        {validating ? 'Checking…' : 'Submit'}
      </button>
      {sessionToken && (
        <button type="button" className="preset-save-btn secondary" onClick={() => saveCurrentAsPreset()} disabled={validating}>
          {validating ? 'Checking…' : 'Save as preset'}
        </button>
      )}
      {!sessionToken && <p className="sidebar-hint">Key is used only in this browser. Use Groq for a free tier.</p>}
    </>
  )

  return (
    <div className="app">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h1>AI Gateway</h1>
          <div className="sidebar-header-actions">
            {user && (
              <div className="nav-user">
                <button
                  type="button"
                  className="nav-user-trigger"
                  onClick={() => setNavUserOpen((o) => !o)}
                  aria-expanded={navUserOpen}
                  aria-haspopup="true"
                >
                  {user.picture ? (
                    <Image src={user.picture} alt="" className="nav-user-avatar" width={32} height={32} unoptimized />
                  ) : (
                    <span className="nav-user-initial">{user.email?.charAt(0)?.toUpperCase() || '?'}</span>
                  )}
                </button>
                {navUserOpen && (
                  <>
                    <div className="nav-user-overlay" onClick={() => setNavUserOpen(false)} aria-hidden="true" />
                    <div className="nav-user-dropdown">
                      <div className="nav-user-info">
                        {user.picture && <Image src={user.picture} alt="" className="nav-user-avatar" width={40} height={40} unoptimized />}
                        <div>
                          <div className="nav-user-name">{user.name || user.email}</div>
                          <div className="nav-user-email">{user.email}</div>
                        </div>
                      </div>
                      <button type="button" className="nav-user-settings" onClick={() => { setSettingsModalOpen(true); setNavUserOpen(false); }}>
                        Settings
                      </button>
                      <button type="button" className="nav-user-logout" onClick={() => { logOut(); setNavUserOpen(false); }}>
                        Log out
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              className="toggle-sidebar"
              onClick={() => setSidebarOpen((o) => !o)}
              aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            >
              {sidebarOpen ? '◀' : '▶'}
            </button>
          </div>
        </div>
        <div className="sidebar-body">
          {authLoading ? (
            <p className="sidebar-hint">Loading…</p>
          ) : user && serverSettings?.hasApiKey ? (
            <>
              <button type="button" className="settings-modal-btn" onClick={() => setSettingsModalOpen(true)}>
                Settings
              </button>
              {renderSettingsForm()}
            </>
          ) : ssoEnabled && !sessionToken ? (
            <>
              <p className="sidebar-auth-state">You’re not signed in</p>
              {loginUrl && (
                <a href={loginUrl} className="sign-in-btn" target="_self" rel="noopener noreferrer">
                  Sign in with Google
                </a>
              )}
              <p className="sidebar-hint">You’ll be sent to Google, then back here. Or configure below (no account).</p>
              {renderSettingsForm()}
            </>
          ) : sessionToken && user && !serverSettings?.hasApiKey ? (
            <>
              <p className="sidebar-hint">Add your API key to start chatting.</p>
              {renderSettingsForm()}
            </>
          ) : sessionToken && user ? (
            renderSettingsForm()
          ) : (
            renderSettingsForm()
          )}
        </div>
      </aside>

      {settingsModalOpen && user && (
        <div className="modal-overlay" onClick={() => setSettingsModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Settings</h2>
            {renderSettingsForm()}
            <button type="button" className="modal-close-btn" onClick={() => setSettingsModalOpen(false)}>Close</button>
          </div>
        </div>
      )}

      <main className="chat-main">
        {!settingsSubmitted ? (
          <div className="api-key-required">
            <p>Configure and submit settings to continue.</p>
            <p className="muted">Choose Provider, Model, and API key in the sidebar, then click Submit.</p>
          </div>
        ) : (
          <>
        <div className="view-tabs">
          <button
            type="button"
            className={view === 'chat' ? 'active' : ''}
            onClick={() => setView('chat')}
          >
            Chat
          </button>
          <button
            type="button"
            className={view === 'usage' ? 'active' : ''}
            onClick={() => setView('usage')}
          >
            Usage
          </button>
        </div>

        {view === 'chat' && (
          <>
            <div className="chat-messages">
              {messages.length === 0 && (
                <div className="welcome">
                  <p>Send a message to start the conversation.</p>
                  <p className="muted">Pick provider and model in the sidebar, then type below.</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`message message-${msg.role}`}>
                  <div className="message-role">{msg.role}</div>
                  <div className="message-content">{msg.content || '…'}</div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input-wrap">
              <textarea
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message…"
                rows={1}
                disabled={loading}
              />
              <button
                type="button"
                className="send-btn"
                onClick={send}
                disabled={loading || !input.trim()}
              >
                {loading ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}

        {view === 'usage' && (
          <div className="usage-view">
            <div className="usage-toolbar">
              <button
                type="button"
                className="refresh-usage-btn"
                onClick={loadUsage}
                disabled={usageLoading}
              >
                {usageLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            {usageError && (
              <div className="usage-error">{usageError}</div>
            )}
            <section className="usage-section">
              <h2>Costs by key</h2>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Cost (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(costs).length === 0 && !usageLoading && !usageError && (
                      <tr><td colSpan={2} className="empty">No usage yet.</td></tr>
                    )}
                    {Object.entries(costs)
                      .sort(([, a], [, b]) => b - a)
                      .map(([key, usd]) => (
                        <tr key={key}>
                          <td className="key-cell" title={key}>{key}</td>
                          <td className="cost-cell">${Number(usd).toFixed(4)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="usage-section">
              <h2>Recent requests</h2>
              <div className="usage-table-wrap">
                <table className="usage-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Model</th>
                      <th>Key</th>
                      <th>Tokens</th>
                      <th>Request</th>
                      <th>Response</th>
                    </tr>
                  </thead>
                  <tbody>
                    {promptLog.length === 0 && !usageLoading && !usageError && (
                      <tr><td colSpan={6} className="empty">No requests logged.</td></tr>
                    )}
                    {promptLog.map((entry) => (
                      <tr key={entry.id}>
                        <td className="time-cell">
                          {new Date(entry.ts).toLocaleString()}
                        </td>
                        <td>{entry.model}</td>
                        <td className="key-cell" title={entry.keyHint}>{entry.keyHint}</td>
                        <td>{entry.promptTokens ?? '–'} / {entry.completionTokens ?? '–'}</td>
                        <td className="preview-cell" title={entry.requestPreview ?? ''}>
                          {entry.requestPreview ?? '–'}
                        </td>
                        <td className="preview-cell" title={entry.responsePreview ?? ''}>
                          {entry.responsePreview ?? '–'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
          </>
        )}
      </main>
    </div>
  )
}
