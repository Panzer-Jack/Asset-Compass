import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Snapshot } from '../../shared/market'

let connection: DatabaseSync | undefined
function database() {
  if (connection) return connection
  const dir = resolve(process.env.ASSET_COMPASS_DATA_DIR || '.data')
  mkdirSync(dir, { recursive: true })
  connection = new DatabaseSync(resolve(dir, 'compass.sqlite'))
  connection.exec(
    'PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS snapshots (key TEXT PRIMARY KEY, fetched TEXT NOT NULL, payload TEXT NOT NULL)',
  )
  return connection
}
const inFlight = new Map<string, Promise<Snapshot<unknown>>>()
const failedAt = new Map<string, number>()
export async function snapshot<T>(
  key: string,
  ttlMs: number,
  force: boolean,
  load: () => Promise<T>,
): Promise<Snapshot<T>> {
  const running = inFlight.get(key)
  if (running) return running as Promise<Snapshot<T>>
  const db = database()
  const row = db.prepare('SELECT fetched, payload FROM snapshots WHERE key=?').get(key) as
    | { fetched: string; payload: string }
    | undefined
  const cached = (stale: boolean): Snapshot<T> => ({
    data: JSON.parse(row!.payload),
    fetchedAt: row!.fetched,
    stale,
  })
  if (row && !failedAt.has(key) && Date.now() - Date.parse(row.fetched) < (force ? 4000 : ttlMs))
    return cached(false)
  if (!force && Date.now() - (failedAt.get(key) ?? 0) < 30000) {
    if (row) return cached(true)
    throw createError({ statusCode: 503, statusMessage: 'Source unavailable' })
  }
  const task = (async () => {
    try {
      const data = await load(),
        fetchedAt = new Date().toISOString()
      db.prepare('INSERT OR REPLACE INTO snapshots (key,fetched,payload) VALUES (?,?,?)').run(
        key,
        fetchedAt,
        JSON.stringify(data),
      )
      failedAt.delete(key)
      return { data, fetchedAt, stale: false }
    } catch (error) {
      failedAt.set(key, Date.now())
      console.warn('[Asset Compass]', key, error instanceof Error ? error.message : 'source failed')
      if (row) return cached(true)
      throw createError({ statusCode: 503, statusMessage: 'Source unavailable' })
    } finally {
      inFlight.delete(key)
    }
  })()
  inFlight.set(key, task)
  return task
}
