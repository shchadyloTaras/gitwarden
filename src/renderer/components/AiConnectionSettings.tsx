import React, { useEffect, useState } from 'react'
import { useAiStore } from '../store/aiStore'
import { requiresBaseUrlEntry } from '../../core/ai/detection'
import type { AiConnection, AiConnectionKind, AiProviderDetection } from '../../core/ai/types'
import Dropdown from './Dropdown'
import { modelDropdownOptions } from './aiModelOptions'
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

/**
 * Step 1 — paste a key. Detection names the provider; "Save" creates the
 * connection, stores the key (which auto-enables AI), and loads the model list.
 * The model is then picked in the active card (step 2).
 */
function SetupForm(): React.ReactElement {
  const detect = useAiStore((s) => s.detect)
  const createConnection = useAiStore((s) => s.createConnection)
  const updateConnection = useAiStore((s) => s.updateConnection)
  const saveCredential = useAiStore((s) => s.saveCredential)
  const listModels = useAiStore((s) => s.listModels)

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
      // Storing the key enables AI automatically (see aiStore.saveCredential).
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

/**
 * Step 2 — the active connection: pick a model (from the provider's live list),
 * manage the stored key, save, or delete. No separate enable toggle — a saved
 * key is the consent.
 */
function ActiveConnectionCard({ conn }: { conn: AiConnection }): React.ReactElement {
  const credentialMeta = useAiStore((s) => s.credentialMeta)
  const updateConnection = useAiStore((s) => s.updateConnection)
  const deleteConnection = useAiStore((s) => s.deleteConnection)
  const saveCredential = useAiStore((s) => s.saveCredential)
  const deleteCredential = useAiStore((s) => s.deleteCredential)
  const listModels = useAiStore((s) => s.listModels)
  const testConnection = useAiStore((s) => s.testConnection)
  const models = useAiStore((s) => s.models)

  const [model, setModel] = useState(conn.defaultModel ?? '')
  const [credKey, setCredKey] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelStatus, setModelStatus] = useState<string | null>(null)

  useEffect(() => {
    setModel(conn.defaultModel ?? '')
    setModelStatus(null)
  }, [conn.id, conn.defaultModel])

  // Load the model list once so the dropdown is populated from the provider API.
  useEffect(() => {
    if (credentialMeta && models.length === 0) void listModels(conn.id)
  }, [conn.id, credentialMeta, models.length, listModels])

  const dirty = (model.trim() || '') !== (conn.defaultModel ?? '')

  async function handleSaveChanges(): Promise<void> {
    await updateConnection(conn.id, { defaultModel: model.trim() || undefined })
    setSaved(true)
  }

  async function handleFetchModels(): Promise<void> {
    setModelsLoading(true)
    setModelStatus(null)
    try {
      const result = await testConnection(conn.id)
      const fetched = result?.models ?? (await listModels(conn.id))
      if (fetched[0] && model.trim().length === 0) setModel(fetched[0].id)
      setModelStatus(result ? STR.AI_MODELS_READY(fetched.length) : STR.AI_MODELS_ERROR)
    } finally {
      setModelsLoading(false)
    }
  }

  return (
    <div style={CARD} data-testid="ai-connection-card">
      <div style={SECTION_TITLE}>{STR.AI_SECTION_LABEL}</div>

      <div style={{ fontSize: 12, color: 'var(--gw-text-faint, #71717a)', marginBottom: 12 }}>
        {titleCaseKind(conn.kind)}
        {conn.baseUrl ? ` · ${conn.baseUrl}` : ''}
      </div>

      <div style={{ marginTop: 4 }}>
        <label style={LABEL}>{STR.AI_MODEL_LABEL}</label>
        {models.length > 0 ? (
          <Dropdown
            testId="ai-model-select"
            ariaLabel={STR.AI_MODEL_LABEL}
            placeholder={STR.AI_MODEL_PLACEHOLDER}
            value={model}
            block
            searchable
            searchPlaceholder={STR.DROPDOWN_SEARCH_PLACEHOLDER}
            noMatchesLabel={STR.DROPDOWN_NO_MATCHES}
            options={modelDropdownOptions(models)}
            onChange={(v) => {
              setModel(v)
              setSaved(false)
            }}
            triggerStyle={{ ...INPUT, fontFamily: 'inherit' }}
          />
        ) : (
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
        )}
        <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            data-testid="ai-fetch-models"
            onClick={() => void handleFetchModels()}
            disabled={modelsLoading}
            style={{
              ...SUBTLE_BTN,
              opacity: modelsLoading ? 0.6 : 1,
              cursor: modelsLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {modelsLoading ? STR.AI_MODELS_FETCHING : STR.AI_MODELS_FETCH}
          </button>
          {modelStatus && (
            <span data-testid="ai-model-status" style={HINT}>
              {modelStatus}
            </span>
          )}
        </div>
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

      {/* Delete the connection (and its credential). */}
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
    </div>
  )
}
