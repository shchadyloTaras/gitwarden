import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ZodSchema } from 'zod'

export class JsonStore<T> {
  /** Serializes update() transactions against this file (in-process; main is single-threaded). */
  private queue: Promise<unknown> = Promise.resolve()

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

  /**
   * Atomic read-modify-write: queues this transaction behind any other `update()` call
   * already in flight against this same instance, so a second caller's patch can never
   * be computed against a snapshot the first caller's write has already superseded (a
   * lost-update race — W19). `write()`'s atomic rename alone doesn't prevent this: two
   * concurrent `read()`s can both see the same stale snapshot before either `write()`s.
   */
  async update(mutate: (current: T) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const current = await this.read()
      const next = mutate(current)
      await this.write(next)
      return next
    }
    const result = this.queue.then(run, run)
    // Normalize both outcomes so a failed transaction never wedges the queue for
    // whoever calls update() next — each transaction's own success/failure still
    // propagates to its own caller via `result`.
    this.queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}
