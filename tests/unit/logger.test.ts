import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from '../../src/main/services/Logger.js'

describe('Logger', () => {
  it('redacts token-shaped strings and sensitive context fields', () => {
    const sink = vi.fn()
    const logger = new ConsoleLogger('test', sink)
    const accessToken = `gho_${'a'.repeat(32)}`
    const deviceCode = 'device-code-secret-value'

    logger.info(`Authorized with ${accessToken}`, {
      accessToken,
      device_code: deviceCode,
      nested: {
        authorization: `Bearer ${accessToken}`,
      },
      safe: 'read:user',
    })

    const line = sink.mock.calls.map(([entry]) => String(entry)).join('\n')
    expect(line).not.toContain(accessToken)
    expect(line).not.toContain(deviceCode)
    expect(line).toContain('[REDACTED]')
    expect(line).toContain('read:user')
  })
})
