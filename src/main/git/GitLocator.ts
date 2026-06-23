import { spawn } from 'child_process'
import { access, constants } from 'fs/promises'
import * as path from 'path'

const COMMON_LOCATIONS: Record<string, string[]> = {
  darwin: ['/opt/homebrew/bin/git', '/usr/local/bin/git', '/usr/bin/git'],
  linux: ['/usr/bin/git', '/usr/local/bin/git'],
  win32: ['C:\\Program Files\\Git\\cmd\\git.exe', 'C:\\Program Files (x86)\\Git\\cmd\\git.exe'],
}

export class GitLocator {
  static async locate(customPath?: string): Promise<string> {
    if (customPath) {
      if (await GitLocator.verify(customPath)) return customPath
      throw new Error(`Custom Git path is not valid or executable: ${customPath}`)
    }

    const fromPath = await GitLocator.findInSystemPath()
    if (fromPath) return fromPath

    const common = COMMON_LOCATIONS[process.platform] ?? []
    for (const candidate of common) {
      if (await GitLocator.verify(candidate)) return candidate
    }

    throw new Error(
      'Git was not found. Install Git and ensure it is on your PATH, ' +
        'or set a custom Git path in Settings.'
    )
  }

  private static async findInSystemPath(): Promise<string | null> {
    const pathEnv = process.env.PATH ?? ''
    const names = process.platform === 'win32' ? ['git.exe', 'git'] : ['git']

    for (const dir of pathEnv.split(path.delimiter)) {
      for (const name of names) {
        const candidate = path.join(dir, name)
        if (await GitLocator.verify(candidate)) return candidate
      }
    }
    return null
  }

  private static verify(gitPath: string): Promise<boolean> {
    return access(gitPath, constants.X_OK)
      .then(() => GitLocator.runVersionCheck(gitPath))
      .catch(() => false)
  }

  private static runVersionCheck(gitPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(gitPath, ['--version'], {
        env: process.env,
        shell: false,
        stdio: 'ignore',
      })
      child.on('close', (code) => resolve(code === 0))
      child.on('error', () => resolve(false))
    })
  }
}
