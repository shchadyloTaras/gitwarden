import { realpath, stat } from 'fs/promises'
import * as path from 'path'

export class PathValidator {
  static async validate(inputPath: string): Promise<string> {
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Repository path must be a non-empty string.')
    }

    if (!path.isAbsolute(inputPath)) {
      throw new Error('Repository path must be absolute, not relative.')
    }

    let canonicalPath: string
    try {
      canonicalPath = await realpath(inputPath)
    } catch {
      throw new Error(`Path does not exist or is inaccessible: ${inputPath}`)
    }

    try {
      await stat(path.join(canonicalPath, '.git'))
    } catch {
      throw new Error(`${canonicalPath} is not a Git repository (no .git found).`)
    }

    return canonicalPath
  }
}
