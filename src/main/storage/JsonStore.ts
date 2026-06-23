import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ZodSchema } from 'zod'

export class JsonStore<T> {
  constructor(
    private readonly filePath: string,
    private readonly schema: ZodSchema<T>,
    private readonly defaults: T
  ) {}

  async read(): Promise<T> {
    let raw: string
    try {
      raw = await readFile(this.filePath, 'utf8')
    } catch {
      return structuredClone(this.defaults)
    }
    const parsed: unknown = JSON.parse(raw)
    return this.schema.parse(parsed)
  }

  async write(data: T): Promise<void> {
    const dir = dirname(this.filePath)
    const tmp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`
    await mkdir(dir, { recursive: true })
    await writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await rename(tmp, this.filePath)
  }
}
