import React, { useCallback, useEffect, useState } from 'react'
import { useAiStore } from '../store/aiStore'
import { requiresBaseUrlEntry } from '../../core/ai/detection'
import type {
  AiConnection,
  AiConnectionKind,
  AiModelInfo,
  AiProviderDetection,
} from '../../core/ai/types'
import Dropdown from './Dropdown'
import { modelDropdownOptions } from './aiModelOptions'
import { STR } from '../strings'
import '../screens/workflowScreens.css'

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
    <section
      className="gw-card gw-workflow-card gw-ai-card"
      data-testid="ai-setup-form"
      aria-labelledby="ai-setup-title"
    >
      <h2 id="ai-setup-title" className="gw-workflow-card-title">
        {STR.AI_SECTION_LABEL}
      </h2>
      <p className="gw-workflow-hint" style={{ marginBottom: 16 }}>
        {STR.AI_SECTION_HINT}
      </p>

      <div className="gw-field gw-workflow-field">
        <label htmlFor="ai-key-input-control" className="gw-workflow-label">
          {STR.AI_KEY_INPUT_LABEL}
        </label>
        <input
          id="ai-key-input-control"
          data-testid="ai-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => void handleKeyChange(e.target.value)}
          placeholder={STR.AI_KEY_PLACEHOLDER}
          aria-describedby="ai-key-detection"
          className="gw-workflow-input gw-workflow-mono"
        />
        {detection === null ? (
          <p id="ai-key-detection" className="gw-workflow-hint">
            {STR.AI_KEY_DETECT_HINT}
          </p>
        ) : isUnknown ? (
          <p
            id="ai-key-detection"
            data-testid="ai-detected"
            className="gw-workflow-hint"
            role="status"
            style={{ color: 'var(--gw-danger, #f87171)' }}
          >
            {STR.AI_DETECTED_UNKNOWN}
          </p>
        ) : (
          <p
            id="ai-key-detection"
            data-testid="ai-detected"
            className="gw-workflow-hint"
            role="status"
            style={{ color: 'var(--gw-accent-text, #a5b4fc)' }}
          >
            {STR.AI_DETECTED_PROVIDER(titleCaseKind(detection.kind), detection.confidence)}
          </p>
        )}
      </div>

      {showBaseUrl && (
        <div className="gw-field gw-workflow-field" style={{ marginTop: 16 }}>
          <label htmlFor="ai-baseurl-control" className="gw-workflow-label">
            {STR.AI_BASEURL_LABEL}
          </label>
          <input
            id="ai-baseurl-control"
            data-testid="ai-baseurl-input"
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            aria-describedby="ai-baseurl-hint"
            className="gw-workflow-input gw-workflow-mono"
          />
          <p id="ai-baseurl-hint" className="gw-workflow-hint">
            {detection?.confidence === 'medium'
              ? STR.AI_BASEURL_HINT_AMBIGUOUS
              : STR.AI_BASEURL_HINT_LOCAL}
          </p>
        </div>
      )}

      <div
        className="gw-toolbar gw-workflow-actions gw-workflow-actions--wrap"
        style={{ marginTop: 18 }}
      >
        <button
          type="button"
          data-testid="ai-save-connection"
          disabled={!canSave}
          onClick={() => void handleSave()}
          className="gw-button gw-button--primary gw-workflow-button"
        >
          {STR.AI_SAVE_CONNECTION}
        </button>
        {error && (
          <span
            data-testid="ai-save-error"
            className="gw-ai-status"
            role="alert"
            style={{ color: 'var(--gw-danger, #f87171)' }}
          >
            {error}
          </span>
        )}
      </div>
    </section>
  )
}

/**
 * Active connection card — manage the stored key, pick a model, save. Saving (or
 * changing) the key auto-loads the provider's model list; there is no manual fetch.
 * Delete stays in a separate danger zone at the bottom.
 */
function ActiveConnectionCard({ conn }: { conn: AiConnection }): React.ReactElement {
  const credentialMeta = useAiStore((s) => s.credentialMeta)
  const updateConnection = useAiStore((s) => s.updateConnection)
  const deleteConnection = useAiStore((s) => s.deleteConnection)
  const saveCredential = useAiStore((s) => s.saveCredential)
  const listModels = useAiStore((s) => s.listModels)
  const testConnection = useAiStore((s) => s.testConnection)
  const models = useAiStore((s) => s.models)

  const [model, setModel] = useState(conn.defaultModel ?? '')
  const [credKey, setCredKey] = useState('')
  const [editingCredential, setEditingCredential] = useState(false)
  const [credSaving, setCredSaving] = useState(false)
  const [credError, setCredError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saved, setSaved] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelStatus, setModelStatus] = useState<string | null>(null)

  useEffect(() => {
    setModel(conn.defaultModel ?? '')
  }, [conn.id, conn.defaultModel])

  const applyModelSelection = useCallback(
    (fetched: AiModelInfo[]) => {
      setModel((current) => {
        const selected = current.trim()
        if (selected && fetched.some((entry) => entry.id === selected)) return selected
        const saved = conn.defaultModel ?? ''
        if (saved && fetched.some((entry) => entry.id === saved)) return saved
        return fetched[0]?.id ?? ''
      })
      setSaved(false)
    },
    [conn.defaultModel]
  )

  const refreshModels = useCallback(async (): Promise<boolean> => {
    if (!useAiStore.getState().credentialMeta) {
      setModelStatus(null)
      return false
    }

    const result = await testConnection(conn.id)
    if (result) {
      setModelStatus(STR.AI_MODELS_READY(result.models.length))
      applyModelSelection(result.models)
      return true
    }

    const fetched = await listModels(conn.id)
    if (fetched.length > 0) {
      setModelStatus(STR.AI_MODELS_READY(fetched.length))
      applyModelSelection(fetched)
      return true
    }

    setModelStatus(useAiStore.getState().error ?? STR.AI_MODELS_ERROR)
    return false
  }, [applyModelSelection, conn.id, listModels, testConnection])

  // Auto-load models whenever a credential is saved or restored (Change key → Save included).
  // Keyed on updatedAt, not the credentialMeta object: load() rebuilds that object after many
  // actions (e.g. saving the model default) with an unchanged updatedAt, and we don't want those
  // to re-fetch models — only an actual credential change should.
  useEffect(() => {
    if (!credentialMeta) {
      setModelStatus(null)
      return
    }

    let cancelled = false
    setModelsLoading(true)
    setModelStatus(null)

    void refreshModels().finally(() => {
      if (!cancelled) setModelsLoading(false)
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on updatedAt (see above)
  }, [credentialMeta?.updatedAt, refreshModels])

  const dirty = (model.trim() || '') !== (conn.defaultModel ?? '')

  async function handleSaveChanges(): Promise<void> {
    await updateConnection(conn.id, { defaultModel: model.trim() || undefined })
    setSaved(true)
  }

  // Saving a (new) key updates credentialMeta.updatedAt, which the auto-load
  // effect above watches — so the model list refreshes on its own. No manual fetch.
  async function handleSaveCredential(): Promise<void> {
    const key = credKey.trim()
    if (!key) return

    setCredSaving(true)
    setCredError(null)
    try {
      await saveCredential(conn.id, `${titleCaseKind(conn.kind)} key`, { apiKey: key })
      setCredKey('')
      setEditingCredential(false)
    } catch (err) {
      setCredError(err instanceof Error ? err.message : STR.AI_SAVE_ERROR)
    } finally {
      setCredSaving(false)
    }
  }

  function handleStartCredentialEdit(): void {
    setEditingCredential(true)
    setCredKey('')
    setCredError(null)
    setModelStatus(null)
  }

  function handleCancelCredentialEdit(): void {
    setEditingCredential(false)
    setCredKey('')
    setCredError(null)
  }

  return (
    <section
      className="gw-card gw-workflow-card gw-ai-card"
      data-testid="ai-connection-card"
      aria-labelledby="ai-connection-title"
    >
      <h2 id="ai-connection-title" className="gw-workflow-card-title">
        {STR.AI_SECTION_LABEL}
      </h2>

      <div className="gw-ai-provider">
        {titleCaseKind(conn.kind)}
        {conn.baseUrl ? ` · ${conn.baseUrl}` : ''}
      </div>

      {/* Credential first — a stored key is required before the model list can load. */}
      <div className="gw-field gw-workflow-field">
        <div className="gw-workflow-label">{STR.AI_CRED_LABEL}</div>
        {credentialMeta && !editingCredential ? (
          <div className="gw-toolbar gw-workflow-actions gw-workflow-actions--wrap">
            <code
              data-testid="ai-cred-masked"
              className="gw-workflow-break"
              style={{ fontSize: 13, color: 'var(--gw-text, #f4f4f5)' }}
            >
              {STR.AI_CRED_MASKED(credentialMeta.maskedPreview)}
            </code>
            <button
              type="button"
              data-testid="ai-cred-change"
              onClick={handleStartCredentialEdit}
              className="gw-button gw-button--secondary gw-workflow-button"
            >
              {STR.AI_CRED_CHANGE}
            </button>
          </div>
        ) : (
          <div>
            {!credentialMeta && (
              <p id="ai-cred-help" data-testid="ai-cred-none" className="gw-workflow-hint">
                {STR.AI_CRED_NONE}
              </p>
            )}
            <div className="gw-ai-field-row" style={{ marginTop: credentialMeta ? 0 : 8 }}>
              <input
                id="ai-credential-input"
                data-testid="ai-cred-key-input"
                type="password"
                value={credKey}
                onChange={(e) => {
                  setCredKey(e.target.value)
                  setCredError(null)
                }}
                placeholder={STR.AI_KEY_PLACEHOLDER}
                aria-label={STR.AI_CRED_LABEL}
                aria-describedby={!credentialMeta ? 'ai-cred-help' : undefined}
                className="gw-workflow-input gw-workflow-mono"
              />
              <button
                type="button"
                data-testid="ai-cred-save"
                disabled={credKey.trim().length === 0 || credSaving}
                onClick={() => void handleSaveCredential()}
                className="gw-button gw-button--primary gw-workflow-button"
              >
                {credSaving ? STR.AI_MODELS_FETCHING : STR.AI_CRED_SAVE_KEY}
              </button>
              {credentialMeta && (
                <button
                  type="button"
                  data-testid="ai-cred-cancel"
                  onClick={handleCancelCredentialEdit}
                  className="gw-button gw-button--secondary gw-workflow-button"
                >
                  {STR.BTN_CANCEL}
                </button>
              )}
            </div>
            {credError && (
              <p
                data-testid="ai-cred-error"
                className="gw-workflow-hint"
                role="alert"
                style={{ color: 'var(--gw-danger, #f87171)' }}
              >
                {credError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Model — only relevant once a credential is stored; the list auto-loads then. */}
      {credentialMeta && (
        <div className="gw-ai-divider gw-field gw-workflow-field">
          <div id="ai-model-label" className="gw-workflow-label">
            {STR.AI_MODEL_LABEL}
          </div>
          <p id="ai-model-hint" className="gw-workflow-hint">
            {STR.AI_MODEL_HINT}
          </p>
          {modelStatus && (
            <p data-testid="ai-model-status" className="gw-workflow-hint" role="status">
              {modelStatus}
            </p>
          )}
          {modelsLoading && models.length === 0 ? (
            <p data-testid="ai-models-loading" className="gw-workflow-hint" role="status">
              {STR.AI_MODELS_LOADING}
            </p>
          ) : models.length > 0 ? (
            <Dropdown
              testId="ai-model-select"
              ariaLabelledBy="ai-model-label"
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
              triggerClassName="gw-workflow-input gw-ai-model-trigger"
            />
          ) : (
            <input
              id="ai-edit-model-control"
              data-testid="ai-edit-model-input"
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                setSaved(false)
              }}
              placeholder={STR.AI_MODEL_PLACEHOLDER}
              aria-labelledby="ai-model-label"
              aria-describedby="ai-model-hint"
              className="gw-workflow-input gw-workflow-mono"
            />
          )}
          <div
            className="gw-toolbar gw-workflow-actions gw-workflow-actions--wrap"
            style={{ marginTop: 8 }}
          >
            <button
              type="button"
              data-testid="ai-save-changes"
              disabled={!dirty}
              onClick={() => void handleSaveChanges()}
              className="gw-button gw-button--primary gw-workflow-button"
            >
              {STR.BTN_SAVE}
            </button>
            {saved && (
              <span
                data-testid="ai-saved-msg"
                className="gw-ai-status"
                role="status"
                style={{ color: 'var(--gw-success, #4ade80)' }}
              >
                {STR.AI_SAVED}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Delete the connection (and its credential). */}
      <div className="gw-ai-divider gw-ai-danger-zone" aria-live="polite">
        {confirmDelete ? (
          <>
            <span className="gw-ai-status" style={{ color: 'var(--gw-danger, #f87171)' }}>
              {STR.AI_CONN_DELETE_CONFIRM}
            </span>
            <button
              type="button"
              data-testid="ai-delete-confirm"
              onClick={() => void deleteConnection(conn.id)}
              className="gw-button gw-button--danger gw-workflow-button"
            >
              {STR.BTN_DELETE}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="gw-button gw-button--secondary gw-workflow-button"
            >
              {STR.BTN_CANCEL}
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="ai-delete-connection"
            onClick={() => setConfirmDelete(true)}
            className="gw-button gw-button--ghost gw-workflow-button"
            style={{ color: 'var(--gw-danger, #f87171)' }}
          >
            {STR.AI_CONN_DELETE_BTN}
          </button>
        )}
      </div>
    </section>
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
    <div data-testid="ai-section" className="gw-workflow-section">
      {active ? <ActiveConnectionCard conn={active} /> : <SetupForm />}
    </div>
  )
}
