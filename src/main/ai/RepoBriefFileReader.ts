import fs from 'node:fs/promises'
import path from 'node:path'
import { isAllowlistedRepoBriefPath } from '../../core/ai/repoAllowlist.js'
import type { RepoBriefFileInput } from '../../core/ai/repoBrief.js'

const MAX_FILE_BYTES = 48_000

export class RepoBriefFileReader {
  async listAllowlistedPaths(repoRoot: string): Promise<string[]> {
    const found: string[] = []
    const entries = await fs.readdir(repoRoot, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const relative = entry.name
      if (isAllowlistedRepoBriefPath(relative)) found.push(relative)
    }
    const githubWorkflow = path.join(repoRoot, '.github', 'workflows')
    try {
      const workflowEntries = await fs.readdir(githubWorkflow, { withFileTypes: true })
      for (const entry of workflowEntries) {
        if (!entry.isFile()) continue
        const relative = path.posix.join('.github/workflows', entry.name)
        if (isAllowlistedRepoBriefPath(relative)) found.push(relative)
      }
    } catch {
      // no workflows dir
    }
    return found.sort()
  }

  async readAllowlistedFiles(repoRoot: string): Promise<RepoBriefFileInput[]> {
    const paths = await this.listAllowlistedPaths(repoRoot)
    const files: RepoBriefFileInput[] = []
    for (const relative of paths) {
      const absolute = path.resolve(repoRoot, relative)
      if (!isInsideRepo(repoRoot, absolute)) continue
      const content = await readBoundedText(absolute)
      if (content !== undefined) files.push({ path: relative.replace(/\\/g, '/'), content })
    }
    return files
  }
}

async function readBoundedText(absolutePath: string): Promise<string | undefined> {
  try {
    const stat = await fs.stat(absolutePath)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return undefined
    const raw = await fs.readFile(absolutePath, 'utf8')
    return raw
  } catch {
    return undefined
  }
}

function isInsideRepo(repoRoot: string, candidate: string): boolean {
  const root = path.resolve(repoRoot)
  const resolved = path.resolve(candidate)
  return resolved === root || resolved.startsWith(`${root}${path.sep}`)
}
