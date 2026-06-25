import { create } from 'zustand'
import {
  parseChatInput,
  chatHelpText,
  isNetworkedChatCommand,
  type ChatCommandKind,
  type ParsedChatCommand,
} from '../../core/ai/chatCommands'
import type { AiAgenticProposal, AiChatTurn } from '../../core/ai/types'
import { useAppStore } from './appStore'
import { useAiStore } from './aiStore'

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
}

interface AiChatState {
  messages: ChatMessage[]
  pending: boolean
  error: string | null

  /** Parse the input and run the matching capability (free-text or slash-command). */
  send(text: string): Promise<void>
  /** Apply a proposal's file edits after explicit confirmation. */
  applyProposal(messageId: string): Promise<void>
  clear(): void
}

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

export const useAiChatStore = create<AiChatState>((set, get) => ({
  messages: [],
  pending: false,
  error: null,

  async send(text) {
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
      const message = await runCapability(parsed, get)
      appendMessage(set, message)
    } catch (err) {
      appendMessage(set, {
        role: 'assistant',
        kind: parsed.kind,
        isError: true,
        content: err instanceof Error ? err.message : String(err),
      })
    } finally {
      set({ pending: false })
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
          content: result.error,
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
    set({ messages: [], error: null })
  },
}))

/** Build conversation history (user/assistant turns only) for a free-text chat send. */
function buildHistory(messages: ChatMessage[]): AiChatTurn[] {
  return messages
    .filter((m) => !m.isError && (m.role === 'user' || (m.role === 'assistant' && !m.kind)))
    .map((m) => ({ role: m.role, content: m.content }))
}

async function runCapability(
  parsed: ParsedChatCommand,
  get: () => AiChatState
): Promise<Omit<ChatMessage, 'id'>> {
  const app = useAppStore.getState()
  const ai = useAiStore.getState()
  const repo = app.activeRepo
  if (!repo) throw new Error('Select a repository first.')
  const repositoryId = repo.id

  switch (parsed.kind) {
    case 'commit': {
      const draft = await ai.draftCommitMessage({ repositoryId })
      if (!draft) throw new Error(ai.error ?? 'Could not draft a commit message.')
      const body = draft.body ? `\n\n${draft.body}` : ''
      return {
        role: 'assistant',
        kind: 'commit',
        content: `Conventional: ${draft.conventional}\nPlain: ${draft.plain}\n\n${draft.summary}${body}`,
      }
    }
    case 'review': {
      const review = await ai.reviewStagedChanges({ repositoryId })
      if (!review) throw new Error(ai.error ?? 'Could not review staged changes.')
      const lines = review.findings.map(
        (f) => `• [${f.confidence}] ${f.category}${f.file ? ` (${f.file})` : ''}: ${f.why}`
      )
      const content = lines.length ? lines.join('\n') : 'No AI findings.'
      return {
        role: 'assistant',
        kind: 'review',
        content: review.overall ? `${review.overall}\n\n${content}` : content,
      }
    }
    case 'push-brief': {
      const branch = app.currentBranch
      if (!branch) throw new Error('No current branch to brief a push for.')
      const brief = await ai.generatePushBrief({ repositoryId, remoteName: 'origin', branch })
      if (!brief) throw new Error(ai.error ?? 'Could not generate a push brief.')
      const highlights = brief.highlights.map((h) => `• ${h}`).join('\n')
      return {
        role: 'assistant',
        kind: 'push-brief',
        content: `${brief.summary}\n\n${highlights}\n\n${brief.identityNote}`,
      }
    }
    case 'history': {
      const summary = await ai.generateHistorySummary({ repositoryId })
      if (!summary) throw new Error(ai.error ?? 'Could not generate a history summary.')
      return {
        role: 'assistant',
        kind: 'history',
        content: `Release notes:\n${summary.releaseNotesDraft}\n\nChangelog:\n${summary.changelogDraft}`,
      }
    }
    case 'repo-brief': {
      const result = await window.api.ai.generateRepoBrief({ repositoryId })
      if (!result.ok) throw new Error(result.error)
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
      })
      if (!result.ok) throw new Error(result.error)
      const proposal = result.data
      const files = proposal.fileEdits.map((e) => `• ${e.path}`).join('\n')
      return {
        role: 'assistant',
        kind: 'propose',
        proposal,
        content: `${proposal.summary}${files ? `\n\nProposed file edits (not applied yet):\n${files}` : ''}`,
      }
    }
    case 'chat':
    default: {
      const currentMessage = parsed.args || parsed.raw
      const priorMessages = get().messages.slice(0, -1)
      const result = await window.api.ai.chat({
        repositoryId,
        message: currentMessage,
        history: buildHistory(priorMessages),
      })
      if (!result.ok) throw new Error(result.error)
      return {
        role: 'assistant',
        kind: 'chat',
        content: result.data.reply,
        suggestedCommands: result.data.suggestedCommands,
      }
    }
  }
}
