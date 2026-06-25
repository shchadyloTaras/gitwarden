import type { z } from 'zod'
import { AiChatResponseSchema } from './schemas.js'
import type { AiRequestKind } from './types.js'

const NON_JSON_STRUCTURED_ERROR = 'AI provider returned non-JSON structured content'

/** Parse adapter output with chat-specific tolerance; other kinds stay fail-closed. */
export function parseStructuredAdapterValue<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  kind: AiRequestKind
): T {
  if (kind === 'chat') {
    return parseChatStructuredValue(schema, raw)
  }
  return parseStrictStructuredValue(schema, raw)
}

function parseChatStructuredValue<T>(schema: z.ZodType<T>, raw: unknown): T {
  if (typeof raw !== 'string') {
    return schema.parse(raw)
  }

  const text = raw.trim()
  if (!text) {
    return schema.parse({ reply: '' })
  }

  try {
    const value = extractJsonValue(text)
    const chatParsed = AiChatResponseSchema.safeParse(value)
    if (chatParsed.success) {
      return schema.parse(chatParsed.data)
    }
  } catch {
    // Fall through to plain-text reply.
  }

  return schema.parse({ reply: cleanPlainTextReply(text) })
}

function parseStrictStructuredValue<T>(schema: z.ZodType<T>, raw: unknown): T {
  try {
    const value = typeof raw === 'string' ? extractJsonValue(raw) : raw
    return schema.parse(value)
  } catch (error) {
    if (error instanceof Error && error.message === NON_JSON_STRUCTURED_ERROR) {
      throw error
    }
    throw error
  }
}

function extractJsonValue(text: string): unknown {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const fenced = extractMarkdownJson(trimmed)
    if (fenced !== undefined) {
      return JSON.parse(fenced)
    }
    throw new Error(NON_JSON_STRUCTURED_ERROR)
  }
}

function extractMarkdownJson(text: string): string | undefined {
  const fullFence = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i)
  if (fullFence?.[1]) return fullFence[1].trim()

  const embeddedFence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i)
  if (embeddedFence?.[1]) return embeddedFence[1].trim()

  return undefined
}

function cleanPlainTextReply(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i, '$1').trim()
}
