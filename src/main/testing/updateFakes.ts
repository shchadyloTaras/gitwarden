// Test-only fake for the update notifier — wired in ONLY when `GITWARDEN_E2E_FAKE_UPDATES=1`
// (see electron/index.ts). Production never constructs this. It lets the Playwright e2e drive the
// IPC bridge (updates:check) and the header button without a real GitHub network call, keeping the
// suite offline (AGENTS.md "tests must run offline"). Set `GITWARDEN_E2E_UPDATE_AVAILABLE=1` to
// simulate a newer release (button shows); leave it unset for the up-to-date case (no button).

import type { IUpdateService } from '../services/UpdateService.js'
import type { UpdateCheckResult } from '../../core/updates/types.js'

export function createUpdateTestService(): IUpdateService {
  const available = process.env['GITWARDEN_E2E_UPDATE_AVAILABLE'] === '1'
  return {
    checkForUpdates(): Promise<UpdateCheckResult> {
      if (available) {
        return Promise.resolve({
          status: 'update-available',
          currentVersion: '0.0.0',
          release: {
            tag: 'v99.0.0',
            version: '99.0.0',
            name: 'GitWarden 99.0.0',
            url: 'https://github.com/shchadyloTaras/gitwarden/releases/latest',
          },
        })
      }
      return Promise.resolve({ status: 'up-to-date', currentVersion: '99.0.0' })
    },
  }
}
