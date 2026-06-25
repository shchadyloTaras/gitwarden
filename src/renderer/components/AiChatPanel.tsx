import React, { useEffect, useRef, useState } from 'react'
import { useAiStore } from '../store/aiStore'
import { useAiChatStore, type ChatMessage } from '../store/aiChatStore'
import { useAppStore } from '../store/appStore'
import { CHAT_COMMANDS } from '../../core/ai/chatCommands'
import { requiresBaseUrlEntry } from '../../core/ai/detection'
import type { AiConnectionKind, AiProviderDetection } from '../../core/ai/types'
import { STR } from '../strings'

const PANEL: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  fontSize: 13,
  color: 'var(--gw-text, #f4f4f5)',
}

const INPUT: React.CSSProperties = {
  background: 'var(--gw-input-bg, #09090b)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text, #f4f4f5)',
  fontSize: 13,
  padding: '6px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

const PRIMARY_BTN: React.CSSProperties = {
  padding: '7px 14px',
  background: 'var(--gw-accent, #6366f1)',
  color: 'var(--gw-on-solid, #fff)',
  border: 'none',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const SUBTLE_BTN: React.CSSProperties = {
  padding: '4px 10px',
  background: 'none',
  border: '1px solid var(--gw-surface3, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  fontSize: 12,
  cursor: 'pointer',
}

const HINT: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--gw-text-faint, #71717a)',
  margin: '6px 0 0',
}

function titleCaseKind(kind: AiConnectionKind | 'unknown'): string {
  switch (kind) {
    case 'openrouter':
      return 'OpenRouter'
    case 'openai-compatible':
      return 'OpenAI-compatible'
    case 'anthropic':
      return 'Anthropic'
    case 'ollama':
      return 'Ollama'
    case 'custom-http':
      return 'Custom HTTP'
    default:
      return 'Unknown'
  }
}

/** Compact "paste your API key" setup shown inline when no connection exists. */
function ChatInlineSetup(): React.ReactElement {
  const detect = useAiStore((s) => s.detect)
  const createConnection = useAiStore((s) => s.createConnection)
  const updateConnection = useAiStore((s) => s.updateConnection)
  const saveCredential = useAiStore((s) => s.saveCredential)
  const listModels = useAiStore((s) => s.listModels)
  const navigate = useAppStore((s) => s.navigate)

  const [apiKey, setApiKey] = useState('')
  const [detection, setDetection] = useState<AiProviderDetection | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleKeyChange(value: string): Promise<void> {
    setApiKey(value)
    setError(null)
    if (value.trim().length === 0) {
      setDetection(null)
      return
    }
    const result = await detect(value)
    if (!result) return
    setDetection(result.detection)
    if (result.detection.suggestedBaseUrl) setBaseUrl(result.detection.suggestedBaseUrl)
  }

  const showBaseUrl = detection !== null && requiresBaseUrlEntry(detection)
  const isUnknown = detection !== null && detection.kind === 'unknown'
  const canSave = detection !== null && !isUnknown && apiKey.trim().length > 0 && !saving

  async function handleSave(): Promise<void> {
    if (!detection || detection.kind === 'unknown') return
    setSaving(true)
    setError(null)
    try {
      const effectiveBaseUrl = showBaseUrl
        ? baseUrl.trim() || undefined
        : detection.suggestedBaseUrl
      const created = await createConnection({
        name: titleCaseKind(detection.kind),
        kind: detection.kind,
        baseUrl: effectiveBaseUrl,
      })
      if (!created) {
        setError(STR.AI_SAVE_ERROR)
        return
      }
      await saveCredential(created.id, `${titleCaseKind(detection.kind)} key`, {
        apiKey: apiKey.trim(),
      })
      const fetched = await listModels(created.id)
      if (fetched[0]) await updateConnection(created.id, { defaultModel: fetched[0].id })
    } catch (err) {
      setError(err instanceof Error ? err.message : STR.AI_SAVE_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="ai-chat-setup" style={{ padding: 14, overflowY: 'auto' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{STR.CHAT_SETUP_TITLE}</div>
      <p style={{ ...HINT, marginTop: 0, marginBottom: 14 }}>{STR.CHAT_SETUP_HINT}</p>

      <input
        data-testid="ai-chat-key-input"
        type="password"
        value={apiKey}
        onChange={(e) => void handleKeyChange(e.target.value)}
        placeholder={STR.AI_KEY_PLACEHOLDER}
        style={{ ...INPUT, fontFamily: 'monospace' }}
      />
      {detection !== null &&
        (isUnknown ? (
          <p style={{ ...HINT, color: 'var(--gw-danger, #f87171)' }}>{STR.AI_DETECTED_UNKNOWN}</p>
        ) : (
          <p
            data-testid="ai-chat-detected"
            style={{ ...HINT, color: 'var(--gw-accent-text, #a5b4fc)' }}
          >
            {STR.AI_DETECTED_PROVIDER(titleCaseKind(detection.kind), detection.confidence)}
          </p>
        ))}

      {showBaseUrl && (
        <input
          data-testid="ai-chat-baseurl-input"
          type="text"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={STR.AI_BASEURL_LABEL}
          style={{ ...INPUT, marginTop: 10, fontFamily: 'monospace' }}
        />
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          data-testid="ai-chat-save-connection"
          disabled={!canSave}
          onClick={() => void handleSave()}
          style={{
            ...PRIMARY_BTN,
            opacity: canSave ? 1 : 0.5,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {STR.AI_SAVE_CONNECTION}
        </button>
        <button onClick={() => navigate('settings')} style={SUBTLE_BTN}>
          {STR.CHAT_SETUP_OPEN_SETTINGS}
        </button>
      </div>
      {error && (
        <p
          data-testid="ai-chat-setup-error"
          style={{ ...HINT, color: 'var(--gw-danger, #f87171)' }}
        >
          {error}
        </p>
      )}
    </div>
  )
}

function ModelSwitcher(): React.ReactElement | null {
  const connections = useAiStore((s) => s.connections)
  const activeConnectionId = useAiStore((s) => s.activeConnectionId)
  const models = useAiStore((s) => s.models)
  const listModels = useAiStore((s) => s.listModels)
  const updateConnection = useAiStore((s) => s.updateConnection)
  const active = connections.find((c) => c.id === activeConnectionId) ?? connections[0] ?? null

  useEffect(() => {
    if (active && models.length === 0) void listModels(active.id)
  }, [active, models.length, listModels])

  if (!active) return null
  const options =
    models.length > 0 ? models.map((m) => m.id) : active.defaultModel ? [active.defaultModel] : []

  return (
    <select
      data-testid="ai-chat-model-select"
      aria-label={STR.CHAT_MODEL_LABEL}
      value={active.defaultModel ?? ''}
      onChange={(e) => void updateConnection(active.id, { defaultModel: e.target.value })}
      style={{ ...INPUT, width: 'auto', maxWidth: 150, padding: '3px 6px', fontSize: 12 }}
    >
      {options.length === 0 && <option value="">{STR.CHAT_MODEL_LABEL}</option>}
      {options.map((id) => (
        <option key={id} value={id}>
          {id}
        </option>
      ))}
    </select>
  )
}

function MessageBubble({ message }: { message: ChatMessage }): React.ReactElement {
  const applyProposal = useAiChatStore((s) => s.applyProposal)
  const isUser = message.role === 'user'
  return (
    <div
      data-testid="ai-chat-message"
      data-role={message.role}
      style={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '92%',
        background: isUser
          ? 'var(--gw-accent-soft, #1e1b4b)'
          : message.isError
            ? 'var(--gw-danger-soft, #3f1d1d)'
            : 'var(--gw-surface2, #27272a)',
        border: '1px solid var(--gw-border, #27272a)',
        borderRadius: 8,
        padding: '8px 10px',
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.05em',
          color: 'var(--gw-text-dim, #52525b)',
          marginBottom: 4,
        }}
      >
        {isUser ? STR.CHAT_YOU : STR.CHAT_ASSISTANT}
      </div>
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.content}</div>

      {message.suggestedCommands && message.suggestedCommands.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gw-text-faint, #71717a)' }}>
          {STR.CHAT_SUGGESTED}: {message.suggestedCommands.join('  ')}
        </div>
      )}

      {message.proposal && (
        <button
          data-testid="ai-chat-proposal-apply"
          disabled={message.proposalApplied}
          onClick={() => void applyProposal(message.id)}
          style={{ ...SUBTLE_BTN, marginTop: 8 }}
        >
          {message.proposalApplied ? STR.CHAT_PROPOSAL_APPLIED : STR.CHAT_PROPOSAL_APPLY}
        </button>
      )}
    </div>
  )
}

function ChatConversation(): React.ReactElement {
  const messages = useAiChatStore((s) => s.messages)
  const pending = useAiChatStore((s) => s.pending)
  const send = useAiChatStore((s) => s.send)
  const clear = useAiChatStore((s) => s.clear)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const busy = pending

  function submit(text: string): void {
    const trimmed = text.trim()
    if (trimmed.length === 0 || busy) return
    setDraft('')
    void send(trimmed)
  }

  return (
    <div style={PANEL}>
      <div
        ref={scrollRef}
        data-testid="ai-chat-messages"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {messages.length === 0 ? (
          <p style={{ ...HINT, marginTop: 0 }}>{STR.CHAT_EMPTY}</p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        {pending && (
          <div style={{ ...HINT, marginTop: 0 }} data-testid="ai-chat-thinking">
            {STR.CHAT_THINKING}
          </div>
        )}
      </div>

      <div style={{ padding: '0 10px 6px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CHAT_COMMANDS.filter((c) => c.kind !== 'help').map((c) => (
          <button
            key={c.command}
            data-testid={`ai-chat-command-${c.kind}`}
            title={c.description}
            disabled={busy}
            onClick={() => submit(c.command)}
            style={{ ...SUBTLE_BTN, opacity: busy ? 0.5 : 1 }}
          >
            {c.command}
          </button>
        ))}
      </div>

      <div
        style={{
          borderTop: '1px solid var(--gw-border, #27272a)',
          padding: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <textarea
          data-testid="ai-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit(draft)
            }
          }}
          placeholder={STR.CHAT_INPUT_PLACEHOLDER}
          rows={2}
          style={{ ...INPUT, resize: 'none', fontFamily: 'inherit' }}
        />
        <button
          data-testid="ai-chat-send"
          disabled={busy || draft.trim().length === 0}
          onClick={() => submit(draft)}
          style={{
            ...PRIMARY_BTN,
            opacity: busy || draft.trim().length === 0 ? 0.5 : 1,
          }}
        >
          {STR.CHAT_SEND}
        </button>
      </div>
      <div style={{ padding: '0 10px 8px', textAlign: 'right' }}>
        <button data-testid="ai-chat-clear" onClick={() => clear()} style={SUBTLE_BTN}>
          {STR.CHAT_CLEAR}
        </button>
      </div>
    </div>
  )
}

export default function AiChatPanel(): React.ReactElement {
  const load = useAiStore((s) => s.load)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const setAiEnabled = useAiStore((s) => s.setAiEnabled)
  const connections = useAiStore((s) => s.connections)
  const activeConnectionId = useAiStore((s) => s.activeConnectionId)
  const active = connections.find((c) => c.id === activeConnectionId) ?? connections[0] ?? null

  useEffect(() => {
    void load()
  }, [load])

  // No separate consent toggle: once a connection exists, AI is on. This heals any
  // legacy connection that predates the simplified flow.
  useEffect(() => {
    if (active && !aiEnabled) void setAiEnabled(true)
  }, [active, aiEnabled, setAiEnabled])

  return (
    <div data-testid="ai-chat-panel" style={PANEL}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          borderBottom: '1px solid var(--gw-border, #27272a)',
          flexShrink: 0,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 12 }}>{STR.CHAT_HEADER_TITLE}</span>
        {active && <ModelSwitcher />}
      </div>

      {active ? <ChatConversation /> : <ChatInlineSetup />}
    </div>
  )
}
