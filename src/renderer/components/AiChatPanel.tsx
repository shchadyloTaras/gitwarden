import React, { useEffect, useRef, useState } from 'react'
import { useAiStore } from '../store/aiStore'
import { useAiChatStore, type ChatMessage } from '../store/aiChatStore'
import { useAppStore } from '../store/appStore'
import { filterSlashCommands, type ChatCommandSpec } from '../../core/ai/chatCommands'
import { requiresBaseUrlEntry } from '../../core/ai/detection'
import type { AiConnectionKind, AiProviderDetection } from '../../core/ai/types'
import Dropdown from './Dropdown'
import { modelDropdownOptions } from './aiModelOptions'
import { STR } from '../strings'

const SETUP_INPUT: React.CSSProperties = {
  background: 'var(--gw-input-bg, #09090b)',
  border: '1px solid var(--gw-border-subtle, #3f3f46)',
  borderRadius: 8,
  color: 'var(--gw-text, #f4f4f5)',
  fontSize: 13,
  padding: '8px 10px',
  width: '100%',
  boxSizing: 'border-box',
}

const SETUP_BTN: React.CSSProperties = {
  padding: '7px 14px',
  background: 'var(--gw-accent, #6366f1)',
  color: 'var(--gw-on-solid, #fff)',
  border: 'none',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const SETUP_BTN_SUBTLE: React.CSSProperties = {
  padding: '6px 12px',
  background: 'none',
  border: '1px solid var(--gw-surface3, #3f3f46)',
  borderRadius: 8,
  color: 'var(--gw-text-muted, #a1a1aa)',
  fontSize: 12,
  cursor: 'pointer',
}

const HINT: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--gw-text-faint, #71717a)',
  margin: '6px 0 0',
}

function SendIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 3v10M8 3l4 4M8 3L4 7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StopIcon(): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
      <rect x="1" y="1" width="10" height="10" rx="1.5" />
    </svg>
  )
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
        style={{ ...SETUP_INPUT, fontFamily: 'monospace' }}
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
          style={{ ...SETUP_INPUT, marginTop: 10, fontFamily: 'monospace' }}
        />
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          data-testid="ai-chat-save-connection"
          disabled={!canSave}
          onClick={() => void handleSave()}
          style={{
            ...SETUP_BTN,
            opacity: canSave ? 1 : 0.5,
            cursor: canSave ? 'pointer' : 'not-allowed',
          }}
        >
          {STR.AI_SAVE_CONNECTION}
        </button>
        <button onClick={() => navigate('settings')} style={SETUP_BTN_SUBTLE}>
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

function ComposerModelSwitcher(): React.ReactElement | null {
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

  const modelOptions =
    models.length > 0
      ? modelDropdownOptions(models)
      : active.defaultModel
        ? [{ value: active.defaultModel, label: active.defaultModel }]
        : []

  const label =
    modelOptions.find((o) => o.value === active.defaultModel)?.label ??
    active.defaultModel ??
    STR.CHAT_MODEL_LABEL

  return (
    <Dropdown
      testId="ai-chat-model-select"
      ariaLabel={STR.CHAT_MODEL_LABEL}
      placeholder={STR.CHAT_MODEL_LABEL}
      value={active.defaultModel ?? ''}
      searchable={modelOptions.length > 0}
      searchPlaceholder={STR.DROPDOWN_SEARCH_PLACEHOLDER}
      noMatchesLabel={STR.DROPDOWN_NO_MATCHES}
      options={modelOptions}
      onChange={(v) => void updateConnection(active.id, { defaultModel: v })}
      triggerStyle={{
        maxWidth: 200,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      triggerClassName="gw-chat-model-trigger"
      displayValue={label}
      portaled={false}
      placement="above"
    />
  )
}

function ThinkingIndicator(): React.ReactElement {
  return (
    <div
      data-testid="ai-chat-thinking"
      className="gw-chat-thinking"
      aria-live="polite"
      aria-busy="true"
    >
      <span>{STR.CHAT_THINKING}</span>
      <span className="gw-chat-thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </div>
  )
}

function MessageRow({
  message,
  onRunCommand,
}: {
  message: ChatMessage
  onRunCommand: (command: string) => void
}): React.ReactElement {
  const applyProposal = useAiChatStore((s) => s.applyProposal)
  const isUser = message.role === 'user'

  const className = [
    'gw-chat-message',
    isUser
      ? 'gw-chat-message--user'
      : message.isError
        ? 'gw-chat-message--error'
        : 'gw-chat-message--assistant',
  ].join(' ')

  return (
    <div data-testid="ai-chat-message" data-role={message.role} className={className}>
      <div className="gw-chat-message-body">
        {message.streaming && message.content.length === 0 ? (
          <ThinkingIndicator />
        ) : (
          <>
            {message.content}
            {message.streaming && <span className="gw-chat-stream-cursor" aria-hidden />}
          </>
        )}
      </div>

      {message.suggestedCommands && message.suggestedCommands.length > 0 && (
        <div className="gw-chat-suggestions">
          {message.suggestedCommands.map((cmd) => (
            <button
              key={cmd}
              type="button"
              className="gw-chat-suggestion"
              data-testid={`ai-chat-suggested-${cmd.replace(/^\//, '')}`}
              onClick={() => onRunCommand(cmd)}
            >
              {cmd}
            </button>
          ))}
        </div>
      )}

      {message.proposal && (
        <button
          type="button"
          className="gw-chat-suggestion"
          data-testid="ai-chat-proposal-apply"
          disabled={message.proposalApplied}
          onClick={() => void applyProposal(message.id)}
          style={{ marginTop: 8, borderRadius: 8 }}
        >
          {message.proposalApplied ? STR.CHAT_PROPOSAL_APPLIED : STR.CHAT_PROPOSAL_APPLY}
        </button>
      )}
    </div>
  )
}

function PopupMenu({
  testId,
  children,
}: {
  testId: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div data-testid={testId} role="listbox" className="gw-chat-popup-menu">
      {children}
    </div>
  )
}

function SlashCommandMenu({
  commands,
  activeIndex,
  onSelect,
}: {
  commands: ChatCommandSpec[]
  activeIndex: number
  onSelect: (command: string) => void
}): React.ReactElement {
  return (
    <PopupMenu testId="ai-chat-slash-menu">
      {commands.map((spec, index) => {
        const active = index === activeIndex
        return (
          <button
            key={spec.command}
            type="button"
            role="option"
            aria-selected={active}
            data-testid={`ai-chat-slash-option-${spec.kind}`}
            className={`gw-chat-popup-option${active ? ' gw-chat-popup-option--active' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(spec.command)
            }}
          >
            <div className="gw-chat-popup-option-title">{spec.command}</div>
            <div className="gw-chat-popup-option-desc">{spec.description}</div>
          </button>
        )
      })}
    </PopupMenu>
  )
}

function ChatConversation({ onClear }: { onClear: () => void }): React.ReactElement {
  const messages = useAiChatStore((s) => s.messages)
  const pending = useAiChatStore((s) => s.pending)
  const send = useAiChatStore((s) => s.send)
  const cancel = useAiChatStore((s) => s.cancel)
  const chatFocusNonce = useAppStore((s) => s.chatFocusNonce)
  const [draft, setDraft] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const slashMatches = filterSlashCommands(draft)
  const slashMenuOpen = slashMatches.length > 0

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, pending])

  useEffect(() => {
    inputRef.current?.focus()
  }, [chatFocusNonce])

  useEffect(() => {
    setSlashIndex(0)
  }, [draft])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [draft])

  const busy = pending
  const showThinking = pending && !messages.some((m) => m.streaming && m.content.length > 0)

  const canSend = draft.trim().length > 0 && !busy

  function submit(text: string): void {
    const trimmed = text.trim()
    if (trimmed.length === 0 || busy) return
    setDraft('')
    void send(trimmed)
  }

  function applySlashCommand(command: string): void {
    setDraft(`${command} `)
    setSlashIndex(0)
    inputRef.current?.focus()
  }

  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (slashMenuOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => Math.min(i + 1, slashMatches.length - 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => Math.max(i - 1, 0))
        return true
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const pick = slashMatches[Math.min(slashIndex, slashMatches.length - 1)]
        if (pick) applySlashCommand(pick.command)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDraft('')
        return true
      }
    }
    return false
  }

  return (
    <>
      <div className="gw-chat-header">
        <button
          type="button"
          className="gw-chat-header-btn"
          data-testid="ai-chat-clear"
          onClick={onClear}
          disabled={busy}
        >
          {STR.CHAT_CLEAR}
        </button>
      </div>

      <div ref={scrollRef} data-testid="ai-chat-messages" className="gw-chat-messages">
        {messages.length === 0 && !showThinking ? (
          <p className="gw-chat-empty">{STR.CHAT_EMPTY}</p>
        ) : (
          <>
            {messages.map((m) => (
              <MessageRow key={m.id} message={m} onRunCommand={(cmd) => submit(cmd)} />
            ))}
            {showThinking && !messages.some((m) => m.streaming) && <ThinkingIndicator />}
          </>
        )}
      </div>

      <div className="gw-chat-composer-wrap">
        <div className="gw-chat-composer">
          <div style={{ position: 'relative' }}>
            {slashMenuOpen && (
              <SlashCommandMenu
                commands={slashMatches}
                activeIndex={Math.min(slashIndex, slashMatches.length - 1)}
                onSelect={applySlashCommand}
              />
            )}
            <textarea
              ref={inputRef}
              data-testid="ai-chat-input"
              className="gw-chat-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (handleMenuKeyDown(e)) return
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submit(draft)
                }
              }}
              placeholder={STR.CHAT_INPUT_PLACEHOLDER}
              rows={1}
            />
          </div>

          <div className="gw-chat-composer-footer">
            <ComposerModelSwitcher />
            <div className="gw-chat-composer-actions">
              {busy ? (
                <button
                  type="button"
                  className="gw-chat-icon-btn gw-chat-icon-btn--stop"
                  data-testid="ai-chat-stop"
                  aria-label={STR.CHAT_STOP}
                  onClick={() => void cancel()}
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  type="button"
                  className="gw-chat-icon-btn gw-chat-icon-btn--send"
                  data-testid="ai-chat-send"
                  aria-label={STR.CHAT_SEND}
                  disabled={!canSend}
                  onClick={() => submit(draft)}
                >
                  <SendIcon />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function AiChatPanel(): React.ReactElement {
  const load = useAiStore((s) => s.load)
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const setAiEnabled = useAiStore((s) => s.setAiEnabled)
  const connections = useAiStore((s) => s.connections)
  const activeConnectionId = useAiStore((s) => s.activeConnectionId)
  const clear = useAiChatStore((s) => s.clear)
  const active = connections.find((c) => c.id === activeConnectionId) ?? connections[0] ?? null

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (active && !aiEnabled) void setAiEnabled(true)
  }, [active, aiEnabled, setAiEnabled])

  return (
    <div data-testid="ai-chat-panel" className="gw-chat-panel">
      {active ? <ChatConversation onClear={() => clear()} /> : <ChatInlineSetup />}
    </div>
  )
}
