import { create } from 'zustand'
import {
  parseChatInput,
  chatHelpText,
  isNetworkedChatCommand,
  parseExplainTarget,
  type ChatCommandKind,
  type ParsedChatCommand,
} from '../../core/ai/chatCommands'
import { normalizeContextPaths } from '../../core/ai/chatContext'
import { friendlyCapabilityError } from '../../core/ai/capabilityErrors'
import type { AiAgenticProposal, AiChatTurn } from '../../core/ai/types'
import { reviewFindingsBlock, commitDraftBlock, type ChatUiBlock } from '../../core/ai/chatBlocks'
import { useAppStore } from './appStore'
import { useAiStore } from './aiStore'
import { STR } from '../strings'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** The capability that produced an assistant message. */
  kind?: ChatCommandKind
  /** True when the assistant message reports an error. */
  isError?: boolean
  /** Slash-command suggestions returned by free-text chat. */
  suggestedCommands?: string[]
  /** An agentic proposal awaiting the user's explicit Apply confirmation. */
  proposal?: AiAgenticProposal
  /** Set once a proposal's edits have been applied. */
  proposalApplied?: boolean
  /** True while tokens are still arriving for a streaming reply. */
  streaming?: boolean
  /** A typed Generative-UI block rendered as a native card (e.g. review findings). */
  block?: ChatUiBlock
  /** When true, render prose `content` ABOVE the block (free-text post-stream upgrade). */
  blockAugmentsText?: boolean
}

export interface ChatSendOptions {
  contextPaths?: string[]
}

interface AiChatState {
  messages: ChatMessage[]
  pending: boolean
  error: string | null
  activeRequestId: string | null

  /** Parse the input and run the matching capability (free-text or slash-command). */
  send(text: string, options?: ChatSendOptions): Promise<void>
  /** Stop an in-flight streaming chat send. */
  cancel(): Promise<void>
  /** Apply a proposal's file edits after explicit confirmation. */
  applyProposal(messageId: string): Promise<void>
  clear(): void
}

/** Slash-command / Enter is the user's expensive-send acknowledgement (Phase 55a: no inline preview gate). */
const EXPENSIVE_SEND_ACK = { expensiveSendAcknowledged: true as const }

let messageSeq = 0
function nextId(): string {
  messageSeq += 1
  return `m${messageSeq}-${Date.now()}`
}

function appendMessage(set: SetState, message: Omit<ChatMessage, 'id'>): string {
  const id = nextId()
  set((s) => ({ messages: [...s.messages, { ...message, id }] }))
  return id
}

type SetState = (partial: Partial<AiChatState> | ((s: AiChatState) => Partial<AiChatState>)) => void

function liveAiStoreError(): string | null {
  return useAiStore.getState().error
}

function chatBubbleError(raw: string): string {
  return friendlyCapabilityError(raw, STR.CHAT_CAPABILITY_STRUCTURED_PARSE_ERROR)
}

function throwAiStoreFailure(fallback: string): never {
  throw new Error(chatBubbleError(liveAiStoreError() ?? fallback))
}

function throwIpcFailure(result: { ok: false; error: string }): never {
  throw new Error(chatBubbleError(result.error))
}

export const useAiChatStore = create<AiChatState>((set, get) => ({
  messages: [],
  pending: false,
  error: null,
  activeRequestId: null,

  async send(text, options) {
    const parsed = parseChatInput(text)
    if (parsed.kind === 'unknown') {
      // Push the user's literal input, then a local help reply — never networked.
      appendMessage(set, { role: 'user', content: parsed.raw || text })
      appendMessage(set, {
        role: 'assistant',
        kind: 'help',
        content: parsed.raw.startsWith('/')
          ? `Unknown command "${parsed.raw}".\n\n${chatHelpText()}`
          : chatHelpText(),
      })
      return
    }

    appendMessage(set, { role: 'user', content: parsed.raw })

    if (parsed.kind === 'help') {
      appendMessage(set, { role: 'assistant', kind: 'help', content: chatHelpText() })
      return
    }

    if (!isNetworkedChatCommand(parsed.kind)) return

    const repo = useAppStore.getState().activeRepo
    if (!repo) {
      appendMessage(set, {
        role: 'assistant',
        kind: parsed.kind,
        isError: true,
        content: 'Select a repository first.',
      })
      return
    }

    set({ pending: true, error: null })
    try {
      if (parsed.kind === 'chat') {
        await runStreamingChat(parsed, get, set, options?.contextPaths)
        return
      }
      const message = await runCapability(parsed)
      appendMessage(set, message)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      appendMessage(set, {
        role: 'assistant',
        kind: parsed.kind,
        isError: true,
        content: chatBubbleError(raw),
      })
    } finally {
      set({ pending: false, activeRequestId: null })
    }
  },

  async cancel() {
    const requestId = get().activeRequestId
    if (!requestId) return
    try {
      await window.api.ai.cancel(requestId)
    } finally {
      set((s) => ({
        pending: false,
        activeRequestId: null,
        messages: s.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
      }))
    }
  },

  async applyProposal(messageId) {
    const message = get().messages.find((m) => m.id === messageId)
    const app = useAppStore.getState()
    if (!message?.proposal || !app.activeRepo) return
    set({ pending: true, error: null })
    try {
      const result = await window.api.ai.executeAgenticProposal({
        repositoryId: app.activeRepo.id,
        fileEdits: message.proposal.fileEdits,
      })
      if (!result.ok) {
        set({ error: result.error })
        appendMessage(set, {
          role: 'assistant',
          kind: 'propose',
          isError: true,
          content: chatBubbleError(result.error),
        })
        return
      }
      set((s) => ({
        messages: s.messages.map((m) => (m.id === messageId ? { ...m, proposalApplied: true } : m)),
      }))
      appendMessage(set, {
        role: 'assistant',
        kind: 'propose',
        content: `Applied ${result.data.writtenFiles.length} file edit(s): ${result.data.writtenFiles.join(', ')}`,
      })
    } finally {
      set({ pending: false })
    }
  },

  clear() {
    set({ messages: [], error: null, activeRequestId: null })
  },
}))

function updateMessage(set: SetState, messageId: string, patch: Partial<ChatMessage>): void {
  set((s) => ({
    messages: s.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
  }))
}

async function runStreamingChat(
  parsed: ParsedChatCommand,
  get: () => AiChatState,
  set: SetState,
  contextPaths?: string[]
): Promise<void> {
  const repo = useAppStore.getState().activeRepo
  if (!repo) throw new Error('Select a repository first.')

  const requestId = crypto.randomUUID()
  const assistantId = appendMessage(set, {
    role: 'assistant',
    kind: 'chat',
    content: '',
    streaming: true,
  })
  set({ activeRequestId: requestId })

  const currentMessage = parsed.args || parsed.raw
  const priorMessages = get()
    .messages.filter((m) => m.id !== assistantId)
    .slice(0, -1)
  const selectedUnstagedPaths = normalizeContextPaths(contextPaths ?? [])

  let settled = false
  const finish = (): void => {
    settled = true
  }

  const unsub = window.api.ai.onChatStreamEvent((event) => {
    if (event.requestId !== requestId || settled) return
    if (event.type === 'delta') {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantId ? { ...m, content: m.content + event.delta } : m
        ),
      }))
      return
    }
    if (event.type === 'done') {
      finish()
      unsub()
      updateMessage(set, assistantId, {
        streaming: false,
        suggestedCommands: event.suggestedCommands,
      })
      return
    }
    if (event.type === 'error') {
      finish()
      unsub()
      updateMessage(set, assistantId, {
        streaming: false,
        isError: true,
        content: chatBubbleError(event.error),
      })
    }
  })

  try {
    const result = await window.api.ai.chatStream({
      repositoryId: repo.id,
      message: currentMessage,
      history: buildHistory(priorMessages),
      selectedUnstagedPaths: selectedUnstagedPaths.length > 0 ? selectedUnstagedPaths : undefined,
      requestId,
      ...EXPENSIVE_SEND_ACK,
    })
    if (!settled) {
      unsub()
      if (!result.ok) {
        updateMessage(set, assistantId, {
          streaming: false,
          isError: true,
          content: chatBubbleError(result.error),
        })
        return
      }
      updateMessage(set, assistantId, {
        streaming: false,
        content: result.data.reply,
        suggestedCommands: result.data.suggestedCommands,
      })
    }
  } catch (err) {
    unsub()
    const raw = err instanceof Error ? err.message : String(err)
    updateMessage(set, assistantId, {
      streaming: false,
      isError: true,
      content: chatBubbleError(raw),
    })
  }

  // Phase 62 (Level 2): after a successful free-text stream, optionally upgrade the
  // finished bubble with ONE allowlisted block. Fail-closed — any failure, or no
  // fitting card, leaves the streamed text unchanged. Adds no new AI authority.
  const finalized = get().messages.find((m) => m.id === assistantId)
  if (!finalized || finalized.isError || finalized.content.trim().length === 0) return
  try {
    const suggestion = await window.api.ai.chatSuggestBlock({
      repositoryId: repo.id,
      message: currentMessage,
      assistantReply: finalized.content,
      history: buildHistory(priorMessages),
      ...EXPENSIVE_SEND_ACK,
    })
    if (suggestion.ok && suggestion.data.block) {
      updateMessage(set, assistantId, {
        block: suggestion.data.block,
        blockAugmentsText: true,
      })
    }
  } catch {
    // fail-closed: keep the streamed text unchanged
  }
}

/** Build conversation history for a free-text chat send (Cursor-style multi-turn). */
function buildHistory(messages: ChatMessage[]): AiChatTurn[] {
  return messages
    .filter((m) => !m.isError && (m.role === 'user' || m.role === 'assistant'))
    .map((m) => ({ role: m.role, content: m.content }))
}

async function runCapability(parsed: ParsedChatCommand): Promise<Omit<ChatMessage, 'id'>> {
  const app = useAppStore.getState()
  const ai = useAiStore.getState()
  const repo = app.activeRepo
  if (!repo) throw new Error('Select a repository first.')
  const repositoryId = repo.id

  switch (parsed.kind) {
    case 'commit': {
      const draft = await ai.draftCommitMessage({ repositoryId, ...EXPENSIVE_SEND_ACK })
      if (!draft) throwAiStoreFailure('Could not draft a commit message.')
      const body = draft.body ? `\n\n${draft.body}` : ''
      return {
        role: 'assistant',
        kind: 'commit',
        content: `Conventional: ${draft.conventional}\nPlain: ${draft.plain}\n\n${draft.summary}${body}`,
        block: commitDraftBlock(draft),
      }
    }
    case 'review': {
      const review = await ai.reviewStagedChanges({ repositoryId, ...EXPENSIVE_SEND_ACK })
      if (!review) throwAiStoreFailure('Could not review staged changes.')
      const lines = review.findings.map(
        (f) => `• [${f.confidence}] ${f.category}${f.file ? ` (${f.file})` : ''}: ${f.why}`
      )
      const content = lines.length ? lines.join('\n') : 'No AI findings.'
      return {
        role: 'assistant',
        kind: 'review',
        content: review.overall ? `${review.overall}\n\n${content}` : content,
        block: reviewFindingsBlock(review),
      }
    }
    case 'push-brief': {
      const branch = app.currentBranch
      if (!branch) throw new Error('No current branch to brief a push for.')
      const brief = await ai.generatePushBrief({
        repositoryId,
        remoteName: 'origin',
        branch,
        ...EXPENSIVE_SEND_ACK,
      })
      if (!brief) throwAiStoreFailure('Could not generate a push brief.')
      const highlights = brief.highlights.map((h) => `• ${h}`).join('\n')
      return {
        role: 'assistant',
        kind: 'push-brief',
        content: `${brief.summary}\n\n${highlights}\n\n${brief.identityNote}`,
      }
    }
    case 'history': {
      const summary = await ai.generateHistorySummary({ repositoryId, ...EXPENSIVE_SEND_ACK })
      if (!summary) throwAiStoreFailure('Could not generate a history summary.')
      return {
        role: 'assistant',
        kind: 'history',
        content: `Release notes:\n${summary.releaseNotesDraft}\n\nChangelog:\n${summary.changelogDraft}`,
      }
    }
    case 'repo-brief': {
      const result = await window.api.ai.generateRepoBrief({ repositoryId, ...EXPENSIVE_SEND_ACK })
      if (!result.ok) throwIpcFailure(result)
      const brief = result.data
      const build = brief.likelyBuildCommands.map((c) => `• ${c}`).join('\n')
      const test = brief.likelyTestCommands.map((c) => `• ${c}`).join('\n')
      return {
        role: 'assistant',
        kind: 'repo-brief',
        content: `${brief.projectSummary}\n\nBuild:\n${build}\n\nTest:\n${test}`,
      }
    }
    case 'propose': {
      const result = await window.api.ai.proposeAgenticActions({
        repositoryId,
        prompt: parsed.args || 'Propose helpful edits for this repository.',
        ...EXPENSIVE_SEND_ACK,
      })
      if (!result.ok) throwIpcFailure(result)
      const proposal = result.data
      const files = proposal.fileEdits.map((e) => `• ${e.path}`).join('\n')
      return {
        role: 'assistant',
        kind: 'propose',
        proposal,
        content: `${proposal.summary}${files ? `\n\nProposed file edits (not applied yet):\n${files}` : ''}`,
      }
    }
    case 'explain': {
      const target = parseExplainTarget(parsed.args)
      if (!target) {
        return {
          role: 'assistant',
          kind: 'explain',
          isError: true,
          content:
            'Usage: /explain SAFETY_CODE (e.g. IDENTITY_UNSET) or paste failing tool/build output after /explain.',
        }
      }
      if (target.kind === 'safety-code' && target.safetyCode) {
        const explanation = await ai.explainSafetyIssue({
          repositoryId,
          safetyCode: target.safetyCode,
        })
        if (!explanation) throwAiStoreFailure('Could not explain the safety issue.')
        return {
          role: 'assistant',
          kind: 'explain',
          content: `${explanation.explanation}\n\nSuggested: ${explanation.actionHint}`,
        }
      }
      const result = await window.api.ai.explainToolOutput({
        repositoryId,
        output: target.output ?? parsed.args,
      })
      if (!result.ok) throwIpcFailure(result)
      const explanation = result.data
      return {
        role: 'assistant',
        kind: 'explain',
        content: `${explanation.explanation}\n\nSuggested: ${explanation.actionHint}`,
      }
    }
    case 'chat':
    default:
      throw new Error('Free-text chat must use runStreamingChat.')
  }
}
