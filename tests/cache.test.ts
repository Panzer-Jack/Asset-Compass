import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { snapshot } from '../server/utils/cache.ts'

test('重复刷新合并为一次写入，失败后继续标记旧快照，成功恢复后替换', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'compass-cache-test-'))
  process.env.ASSET_COMPASS_DATA_DIR = dir
  try {
    let count = 0
    const load = async () => {
      await Promise.resolve()
      return ++count
    }
    const [a, b] = await Promise.all([
      snapshot('sample', 1000, false, load),
      snapshot('sample', 1000, false, load),
    ])
    assert.equal(count, 1)
    assert.deepEqual(a, b)
    const fail = async () => {
      throw new Error('test offline')
    }
    const previous = await snapshot('sample', 0, false, fail)
    assert.equal(previous.stale, true)
    assert.equal(previous.data, 1)
    const throttled = await snapshot('sample', 3600000, false, load)
    assert.equal(throttled.stale, true)
    assert.equal(count, 1)
    const recovered = await snapshot('sample', 1000, true, load)
    assert.equal(recovered.stale, false)
    assert.equal(recovered.data, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.ASSET_COMPASS_DATA_DIR
  }
})
