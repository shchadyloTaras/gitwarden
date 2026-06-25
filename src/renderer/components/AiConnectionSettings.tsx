import React, { useEffect, useState } from 'react'
import { useAiStore } from '../store/aiStore'
import { useAppStore } from '../store/appStore'
import { useRepositoriesStore } from '../store/repositoriesStore'
import { requiresBaseUrlEntry } from '../../core/ai/detection'
import type { AiConnection, AiConnectionKind, AiProviderDetection } from '../../core/ai/types'
import { STR } from '../strings'

const CARD: React.CSSProperties = {
  background: 'var(--gw-surface, #18181b)',
  border: '1px solid var(--gw-border, #27272a)',
  borderRadius: 8,
  padding: '20px 24px',
  marginBottom: 20,
}

const LABEL: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.05em',
  color: 'var(--gw-text-muted, #a1a1aa)',
  marginBottom: 8,
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
  fontFamily: 'monospace',
}

const HINT: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  color: 'var(--gw-text-faint, #71717a)',
}

const SECTION_TITLE: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 14,
  color: 'var(--gw-text, #f4f4f5)',
}

const PRIMARY_BTN: React.CSSProperties = {
  padding: '8px 18px',
  background: 'var(--gw-accent, #6366f1)',
  color: 'var(--gw-on-solid, #fff)',
  border: 'none',
  borderRadius: 4,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const SUBTLE_BTN: React.CSSProperties = {
  padding: '6px 12px',
  background: 'none',
  border: '1px solid var(--gw-surface3, #3f3f46)',
  borderRadius: 4,
  color: 'var(--gw-text-muted, #a1a1aa)',
  fontSize: 12,
  cursor: 'pointer',
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

function retentionLine(conn: AiConnection): string {
  if (conn.capabilities.localOnly) return STR.AI_RETENTION_LOCAL
  switch (conn.retention) {
    case 'zero-retention':
      return STR.AI_RETENTION_ZERO
    case 'user-accepted':
      return STR.AI_RETENTION_ACCEPTED
    default:
      return STR.AI_RETENTION_UNKNOWN
  }
}

/** The setup form shown when there is no active connection. */
function SetupForm(): React.ReactElement {
  const detect = useAiStore((s) => s.detect)
  const createConnection = useAiStore((s) => s.createConnection)
  const saveCredential = useAiStore((s) => s.saveCredential)

  const [apiKey, setApiKey] = useState('')
  const [detection, setDetection] = useState<AiProviderDetection | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [name, setName] = useState('')
  const [model, setModel] = useState('')
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
    if (name.trim().length === 0 && result.detection.kind !== 'unknown') {
      setName(titleCaseKind(result.detection.kind))
    }
  }

  const showBaseUrl = detection !== null && requiresBaseUrlEntry(detection)
  const isUnknown = detection !== null && detection.kind === 'unknown'
  const canSave =
    detection !== null &&
    !isUnknown &&
    apiKey.trim().length > 0 &&
    name.trim().length > 0 &&
    !saving

  async function handleSave(): Promise<void> {
    if (!detection || detection.kind === 'unknown') return
    setSaving(true)
    setError(null)
    try {
      const effectiveBaseUrl = showBaseUrl
        ? baseUrl.trim() || undefined
        : detection.suggestedBaseUrl
      const created = await createConnection({
        name: name.trim(),
        kind: detection.kind,
        baseUrl: effectiveBaseUrl,
        defaultModel: model.trim() || undefined,
      })
      if (!created) {
        setError(STR.AI_SAVE_ERROR)
        return
      }
      // "Save connection" attaches the key too — it is encrypted in main and the
      // raw value never comes back. AI stays disabled until the separate toggle.
      await saveCredential(created.id, `${titleCaseKind(detection.kind)} key`, {
        apiKey: apiKey.trim(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : STR.AI_SAVE_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={CARD} data-testid="ai-setup-form">
      <div style={SECTION_TITLE}>{STR.AI_SECTION_LABEL}</div>
      <p style={{ ...HINT, marginTop: 0, marginBottom: 16 }}>{STR.AI_SECTION_HINT}</p>

      <label style={LABEL}>{STR.AI_KEY_INPUT_LABEL}</label>
      <input
        data-testid="ai-key-input"
        type="password"
        value={apiKey}
        onChange={(e) => void handleKeyChange(e.target.value)}
        placeholder={STR.AI_KEY_PLACEHOLDER}
        style={INPUT}
      />
      {detection === null ? (
        <p style={HINT}>{STR.AI_KEY_DETECT_HINT}</p>
      ) : isUnknown ? (
        <p data-testid="ai-detected" style={{ ...HINT, color: 'var(--gw-danger, #f87171)' }}>
          {STR.AI_DETECTED_UNKNOWN}
        </p>
      ) : (
        <p data-testid="ai-detected" style={{ ...HINT, color: 'var(--gw-accent-text, #a5b4fc)' }}>
          {STR.AI_DETECTED_PROVIDER(titleCaseKind(detection.kind), detection.confidence)}
        </p>
      )}

      {showBaseUrl && (
        <div style={{ marginTop: 14 }}>
          <label style={LABEL}>{STR.AI_BASEURL_LABEL}</label>
          <input
            data-testid="ai-baseurl-input"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            style={INPUT}
          />
          <p style={HINT}>
            {detection?.confidence === 'medium'
              ? STR.AI_BASEURL_HINT_AMBIGUOUS
              : STR.AI_BASEURL_HINT_LOCAL}
          </p>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <label style={LABEL}>{STR.AI_NAME_LABEL}</label>
        <input
          data-testid="ai-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={STR.AI_NAME_PLACEHOLDER}
          style={{ ...INPUT, fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={LABEL}>{STR.AI_MODEL_LABEL}</label>
        <input
          data-testid="ai-model-input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={STR.AI_MODEL_PLACEHOLDER}
          style={INPUT}
        />
        <p style={HINT}>{STR.AI_MODEL_HINT}</p>
      </div>

      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          data-testid="ai-save-connection"
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
        {error && (
          <span
            data-testid="ai-save-error"
            style={{ fontSize: 13, color: 'var(--gw-danger, #f87171)' }}
          >
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

/** The active-connection card shown once a connection exists. */
function ActiveConnectionCard({ conn }: { conn: AiConnection }): React.ReactElement {
  const credentialMeta = useAiStore((s) => s.credentialMeta)
  const updateConnection = useAiStore((s) => s.updateConnection)
  const deleteConnection = useAiStore((s) => s.deleteConnection)
  const saveCredential = useAiStore((s) => s.saveCredential)
  const deleteCredential = useAiStore((s) => s.deleteCredential)

  const [name, setName] = useState(conn.name)
  const [model, setModel] = useState(conn.defaultModel ?? '')
  const [credKey, setCredKey] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setName(conn.name)
    setModel(conn.defaultModel ?? '')
  }, [conn.id, conn.name, conn.defaultModel])

  const dirty = name.trim() !== conn.name || (model.trim() || '') !== (conn.defaultModel ?? '')

  async function handleSaveChanges(): Promise<void> {
    await updateConnection(conn.id, {
      name: name.trim() || conn.name,
      defaultModel: model.trim() || undefined,
    })
    setSaved(true)
  }

  return (
    <div style={CARD} data-testid="ai-connection-card">
      <div style={SECTION_TITLE}>{STR.AI_SECTION_LABEL}</div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 6 }}>
        <span
          data-testid="ai-conn-state"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: conn.enabled ? 'var(--gw-success, #4ade80)' : 'var(--gw-text-faint, #71717a)',
          }}
        >
          {conn.enabled ? STR.AI_CONN_ENABLED : STR.AI_CONN_DISABLED}
        </span>
        <span style={{ fontSize: 12, color: 'var(--gw-text-faint, #71717a)' }}>
          {titleCaseKind(conn.kind)}
          {conn.baseUrl ? ` · ${conn.baseUrl}` : ''}
        </span>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={LABEL}>{STR.AI_NAME_LABEL}</label>
        <input
          data-testid="ai-edit-name-input"
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          style={{ ...INPUT, fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={LABEL}>{STR.AI_MODEL_LABEL}</label>
        <input
          data-testid="ai-edit-model-input"
          type="text"
          value={model}
          onChange={(e) => {
            setModel(e.target.value)
            setSaved(false)
          }}
          placeholder={STR.AI_MODEL_PLACEHOLDER}
          style={INPUT}
        />
      </div>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          data-testid="ai-save-changes"
          disabled={!dirty}
          onClick={() => void handleSaveChanges()}
          style={{
            ...PRIMARY_BTN,
            opacity: dirty ? 1 : 0.5,
            cursor: dirty ? 'pointer' : 'not-allowed',
          }}
        >
          {STR.BTN_SAVE}
        </button>
        {saved && (
          <span
            data-testid="ai-saved-msg"
            style={{ fontSize: 13, color: 'var(--gw-success, #4ade80)' }}
          >
            {STR.AI_SAVED}
          </span>
        )}
      </div>

      {/* Credential — masked display only; the raw secret never returns from main. */}
      <div
        style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--gw-border, #27272a)' }}
      >
        <label style={LABEL}>{STR.AI_CRED_LABEL}</label>
        {credentialMeta ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <code
              data-testid="ai-cred-masked"
              style={{ fontSize: 13, color: 'var(--gw-text, #f4f4f5)' }}
            >
              {STR.AI_CRED_MASKED(credentialMeta.maskedPreview)}
            </code>
            <button
              data-testid="ai-cred-delete"
              onClick={() => void deleteCredential(conn.id)}
              style={SUBTLE_BTN}
            >
              {STR.AI_CRED_DELETE}
            </button>
          </div>
        ) : (
          <div>
            <p data-testid="ai-cred-none" style={{ ...HINT, marginTop: 0 }}>
              {STR.AI_CRED_NONE}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                data-testid="ai-cred-key-input"
                type="password"
                value={credKey}
                onChange={(e) => setCredKey(e.target.value)}
                placeholder={STR.AI_KEY_PLACEHOLDER}
                style={INPUT}
              />
              <button
                data-testid="ai-cred-save"
                disabled={credKey.trim().length === 0}
                onClick={() => {
                  void saveCredential(conn.id, `${titleCaseKind(conn.kind)} key`, {
                    apiKey: credKey.trim(),
                  }).then(() => setCredKey(''))
                }}
                style={{ ...SUBTLE_BTN, flexShrink: 0 }}
              >
                {STR.BTN_SAVE}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy / retention status. */}
      <div style={{ marginTop: 16 }}>
        <label style={LABEL}>{STR.AI_RETENTION_LABEL}</label>
        <p
          data-testid="ai-retention-status"
          style={{
            ...HINT,
            marginTop: 0,
            color: conn.capabilities.localOnly
              ? 'var(--gw-success, #4ade80)'
              : conn.retention === 'unknown'
                ? 'var(--gw-warning, #fbbf24)'
                : 'var(--gw-text-muted, #a1a1aa)',
          }}
        >
          {retentionLine(conn)}
        </p>
      </div>

      {/* Connection lifecycle: disable / delete. */}
      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: '1px solid var(--gw-border, #27272a)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
        }}
      >
        <button
          data-testid="ai-conn-toggle"
          onClick={() => void updateConnection(conn.id, { enabled: !conn.enabled })}
          style={SUBTLE_BTN}
        >
          {conn.enabled ? STR.AI_CONN_DISABLE_BTN : STR.AI_CONN_ENABLE_BTN}
        </button>

        {confirmDelete ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--gw-danger, #f87171)' }}>
              {STR.AI_CONN_DELETE_CONFIRM}
            </span>
            <button
              data-testid="ai-delete-confirm"
              onClick={() => void deleteConnection(conn.id)}
              style={{
                ...SUBTLE_BTN,
                borderColor: 'var(--gw-danger, #f87171)',
                color: 'var(--gw-danger, #f87171)',
              }}
            >
              {STR.BTN_DELETE}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={SUBTLE_BTN}>
              {STR.BTN_CANCEL}
            </button>
          </>
        ) : (
          <button
            data-testid="ai-delete-connection"
            onClick={() => setConfirmDelete(true)}
            style={{ ...SUBTLE_BTN, color: 'var(--gw-danger, #f87171)' }}
          >
            {STR.AI_CONN_DELETE_BTN}
          </button>
        )}
      </div>
    </div>
  )
}

/** The global "Enable AI" consent toggle — a separate, deliberate step from saving. */
function EnableAiToggle(): React.ReactElement {
  const aiEnabled = useAiStore((s) => s.aiEnabled)
  const setAiEnabled = useAiStore((s) => s.setAiEnabled)

  return (
    <div style={CARD} data-testid="ai-enable-card">
      <div style={SECTION_TITLE}>{STR.AI_ENABLE_LABEL}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          data-testid="ai-enable-toggle"
          role="switch"
          aria-checked={aiEnabled}
          onClick={() => void setAiEnabled(!aiEnabled)}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: 'none',
            cursor: 'pointer',
            background: aiEnabled ? 'var(--gw-accent, #6366f1)' : 'var(--gw-surface3, #3f3f46)',
            position: 'relative',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: aiEnabled ? 23 : 3,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
            }}
          />
        </button>
        <span
          data-testid="ai-enable-state"
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: aiEnabled ? 'var(--gw-success, #4ade80)' : 'var(--gw-text-faint, #71717a)',
          }}
        >
          {aiEnabled ? STR.AI_ENABLE_ON : STR.AI_ENABLE_OFF}
        </span>
      </div>
      <p style={HINT}>{STR.AI_ENABLE_HINT}</p>
    </div>
  )
}

/** Per-repo override entry point for the active repository (enforced in Phase 31). */
function RepoOverride(): React.ReactElement {
  const activeRepo = useAppStore((s) => s.activeRepo)
  const updateRepo = useRepositoriesStore((s) => s.updateRepo)
  const repos = useRepositoriesStore((s) => s.repos)
  const current = repos.find((r) => r.id === activeRepo?.id) ?? activeRepo
  const value: 'inherit' | 'enabled' | 'disabled' = current?.aiOverride ?? 'inherit'

  const options: { id: 'inherit' | 'enabled' | 'disabled'; label: string }[] = [
    { id: 'inherit', label: STR.AI_REPO_OVERRIDE_INHERIT },
    { id: 'enabled', label: STR.AI_REPO_OVERRIDE_ON },
    { id: 'disabled', label: STR.AI_REPO_OVERRIDE_OFF },
  ]

  return (
    <div style={CARD} data-testid="ai-repo-override-card">
      <div style={SECTION_TITLE}>{STR.AI_REPO_OVERRIDE_LABEL}</div>
      {current ? (
        <div data-testid="ai-repo-override" style={{ display: 'flex', gap: 6 }}>
          {options.map((o) => {
            const selected = value === o.id
            return (
              <button
                key={o.id}
                data-testid={`ai-repo-override-${o.id}`}
                onClick={() =>
                  void updateRepo(current.id, {
                    aiOverride: o.id === 'inherit' ? undefined : o.id,
                  })
                }
                style={{
                  padding: '6px 16px',
                  borderRadius: 4,
                  fontSize: 13,
                  cursor: 'pointer',
                  border: selected
                    ? '2px solid var(--gw-accent, #6366f1)'
                    : '1px solid var(--gw-surface3, #3f3f46)',
                  background: selected
                    ? 'var(--gw-accent-soft, #1e1b4b)'
                    : 'var(--gw-surface2, #27272a)',
                  color: selected
                    ? 'var(--gw-accent-text, #a5b4fc)'
                    : 'var(--gw-text-muted, #a1a1aa)',
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      ) : (
        <p style={{ ...HINT, marginTop: 0 }}>{STR.AI_REPO_OVERRIDE_NO_REPO}</p>
      )}
      <p style={HINT}>{STR.AI_REPO_OVERRIDE_HINT}</p>
    </div>
  )
}

/** Advanced disclosure — Custom HTTP / manual base URL land with the adapters (Phase 30). */
function AdvancedDisclosure(): React.ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <div style={CARD} data-testid="ai-advanced-card">
      <button
        data-testid="ai-advanced-toggle"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...SECTION_TITLE,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {open ? '▾ ' : '▸ '}
        {STR.AI_ADVANCED_LABEL}
      </button>
      {open && (
        <p data-testid="ai-advanced-panel" style={{ ...HINT, marginTop: 10 }}>
          {STR.AI_ADVANCED_HINT}
        </p>
      )}
    </div>
  )
}

export default function AiConnectionSettings(): React.ReactElement {
  const load = useAiStore((s) => s.load)
  const connections = useAiStore((s) => s.connections)
  const activeConnectionId = useAiStore((s) => s.activeConnectionId)

  useEffect(() => {
    void load()
  }, [load])

  const active = connections.find((c) => c.id === activeConnectionId) ?? connections[0] ?? null

  return (
    <div data-testid="ai-section">
      {active ? <ActiveConnectionCard conn={active} /> : <SetupForm />}
      <EnableAiToggle />
      <RepoOverride />
      <AdvancedDisclosure />
    </div>
  )
}
