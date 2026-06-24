export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>
export type LogSink = (line: string) => void

export interface Logger {
  debug(message: string, context?: LogContext): void
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

const REDACTED = '[REDACTED]'

const SENSITIVE_KEY_PARTS = [
  'access_token',
  'accesstoken',
  'device_code',
  'devicecode',
  'token',
  'secret',
  'password',
  'credential',
  'authorization',
]

const SECRET_PATTERNS = [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, /\bgh[opsru]_[A-Za-z0-9_]{20,}\b/g]

export function redactForLog(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>())
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return redactString(value)
  if (value === null || typeof value !== 'object') return value

  if (seen.has(value)) return '[Circular]'
  seen.add(value)

  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen))

  const redacted: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    redacted[key] = isSensitiveKey(key) ? REDACTED : redactValue(child, seen)
  }
  return redacted
}

function redactString(value: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, REDACTED), value)
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[-_\s]/g, '')
  return SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part.replace(/[-_\s]/g, '')))
}

export class ConsoleLogger implements Logger {
  constructor(
    private readonly scope: string,
    private readonly sink: LogSink = (line) => console.info(line)
  ) {}

  debug(message: string, context?: LogContext): void {
    this.write('debug', message, context)
  }

  info(message: string, context?: LogContext): void {
    this.write('info', message, context)
  }

  warn(message: string, context?: LogContext): void {
    this.write('warn', message, context)
  }

  error(message: string, context?: LogContext): void {
    this.write('error', message, context)
  }

  private write(level: LogLevel, message: string, context?: LogContext): void {
    const redactedMessage = redactForLog(message)
    const parts = [`[${level}]`, `[${this.scope}]`, String(redactedMessage)]
    if (context) parts.push(JSON.stringify(redactForLog(context)))
    this.sink(parts.join(' '))
  }
}

export function createLogger(scope: string): Logger {
  return new ConsoleLogger(scope)
}
