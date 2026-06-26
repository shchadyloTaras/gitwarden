import { describe, it, expect } from 'vitest'
import {
  CHAT_COMMANDS,
  chatHelpText,
  filterSlashCommands,
  isNetworkedChatCommand,
  parseChatInput,
  parseExplainTarget,
} from '../../src/core/ai/chatCommands'

describe('parseChatInput', () => {
  it('maps each known slash-command to its capability kind', () => {
    expect(parseChatInput('/commit').kind).toBe('commit')
    expect(parseChatInput('/review').kind).toBe('review')
    expect(parseChatInput('/push-brief').kind).toBe('push-brief')
    expect(parseChatInput('/history').kind).toBe('history')
    expect(parseChatInput('/repo-brief').kind).toBe('repo-brief')
    expect(parseChatInput('/propose add a README').kind).toBe('propose')
    expect(parseChatInput('/explain IDENTITY_UNSET').kind).toBe('explain')
    expect(parseChatInput('/help').kind).toBe('help')
  })

  it('is case-insensitive on the command token and keeps the args', () => {
    const parsed = parseChatInput('/PROPOSE  tidy the docs ')
    expect(parsed.kind).toBe('propose')
    expect(parsed.args).toBe('tidy the docs')
  })

  it('routes free text to chat', () => {
    const parsed = parseChatInput('what changed here?')
    expect(parsed.kind).toBe('chat')
    expect(parsed.args).toBe('what changed here?')
  })

  it('resolves unknown slash tokens and empty input to unknown', () => {
    expect(parseChatInput('/nope').kind).toBe('unknown')
    expect(parseChatInput('   ').kind).toBe('unknown')
  })
})

describe('isNetworkedChatCommand', () => {
  it('treats help/unknown as local and the rest as networked', () => {
    expect(isNetworkedChatCommand('help')).toBe(false)
    expect(isNetworkedChatCommand('unknown')).toBe(false)
    expect(isNetworkedChatCommand('chat')).toBe(true)
    expect(isNetworkedChatCommand('commit')).toBe(true)
  })
})

describe('chatHelpText', () => {
  it('lists every command', () => {
    const help = chatHelpText()
    for (const spec of CHAT_COMMANDS) {
      expect(help).toContain(spec.command)
    }
  })
})

describe('parseExplainTarget', () => {
  it('recognizes safety codes', () => {
    expect(parseExplainTarget('IDENTITY_UNSET')).toEqual({
      kind: 'safety-code',
      safetyCode: 'IDENTITY_UNSET',
    })
  })

  it('treats pasted output as tool output', () => {
    expect(parseExplainTarget('npm ERR! test failed')).toEqual({
      kind: 'tool-output',
      output: 'npm ERR! test failed',
    })
  })

  it('returns null for empty args', () => {
    expect(parseExplainTarget('   ')).toBeNull()
  })
})

describe('filterSlashCommands', () => {
  it('returns matches while typing a slash token', () => {
    expect(filterSlashCommands('/com').map((c) => c.command)).toEqual(['/commit'])
    expect(filterSlashCommands('/').length).toBe(CHAT_COMMANDS.length)
  })

  it('returns empty once args are present or input is free text', () => {
    expect(filterSlashCommands('/commit staged')).toEqual([])
    expect(filterSlashCommands('hello')).toEqual([])
  })
})
