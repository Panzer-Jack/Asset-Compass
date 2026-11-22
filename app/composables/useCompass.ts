import {
  domesticGold,
  initialAssets,
  sp500,
  observations,
  type Asset,
  type Price,
  type Snapshot,
  type Intraday,
} from '~~/shared/market'
import type { GoldSignal } from '~~/shared/strategy'

interface Feed<T> {
  response?: Snapshot<T>
  loading: boolean
  error: string
  checkedAt?: number
}
const blank = <T>(): Feed<T> => ({ loading: false, error: '' })
const requests = new Map<string, Promise<void>>()
const preferencesKey = 'asset-compass/preferences-v2'
async function request<T>(key: string, state: Feed<T>, url: string, force: boolean) {
  if (requests.has(key)) return requests.get(key)
  const interval = key === 'intraday' || state.error ? 60000 : 15 * 60000
  if (!force && state.checkedAt && Date.now() - state.checkedAt < interval) return
  state.loading = true
  const work = (async () => {
    try {
      state.response = await $fetch<Snapshot<T>>(url, { query: force ? { refresh: 1 } : {}, retry: 0 })
      state.error = state.response.stale ? '来源暂时不可用，正在显示上次成功获取的数据。' : ''
    } catch {
      state.error = state.response
        ? '刷新失败，正在显示上次成功获取的数据。'
        : '暂时未能取得来源数据，请稍后刷新。'
    } finally {
      state.checkedAt = Date.now()
      state.loading = false
      requests.delete(key)
    }
  })()
  requests.set(key, work)
  return work
}

export function useCompass() {
  const assets = useState<Asset[]>('assets', () => [...initialAssets])
  const focus = useState('focus', () => domesticGold.id)
  const last = useState('last-asset', () => domesticGold.id)
  const histories = useState<Record<string, Feed<Price[]>>>('histories', () => ({}))
  const model = useState('gold-model', () => blank<GoldSignal[]>())
  const intraday = useState('gold-intraday', () => blank<Intraday>())
  const showAdd = useState('open-add', () => false)
  function initialize() {
    try {
      const current = localStorage.getItem(preferencesKey)
      const stored = JSON.parse(current ?? localStorage.getItem('asset-compass/preferences-v1') ?? 'null')
      if (!stored || !Array.isArray(stored.assets)) return
      const valid: Asset[] = stored.assets.filter(
        (a: Asset) =>
          a &&
          (a.id === domesticGold.id || /^\d{6}$/.test(a.id)) &&
          a.short &&
          a.name &&
          (a.kind === 'gold' || a.kind === 'fund'),
      )
      if (current === null && valid.length && !valid.some((a) => a.id === sp500.id || a.id === '019305')) {
        valid.push(sp500)
      }
      assets.value = valid
      focus.value = valid.some((a) => a.id === stored.focus) ? stored.focus : (valid[0]?.id ?? '')
      last.value = valid.some((a) => a.id === stored.last) ? stored.last : focus.value
      if (current === null) save()
    } catch {
      /* A fresh watchlist is usable when browser storage is unavailable. */
    }
  }
  function save() {
    try {
      localStorage.setItem(
        preferencesKey,
        JSON.stringify({ assets: assets.value, focus: focus.value, last: last.value }),
      )
    } catch {
      /* Keep in-memory preferences for this tab. */
    }
  }
  function history(id: string, force = false) {
    histories.value[id] ??= blank<Price[]>()
    return request('history:' + id, histories.value[id]!, '/api/market/' + encodeURIComponent(id), force)
  }
  function loadModel(force = false) {
    return request('model', model.value, '/api/gold/model', force)
  }
  function loadIntraday(force = false) {
    return request('intraday', intraday.value, '/api/gold/intraday', force)
  }
  function refresh(force = false) {
    return Promise.all(assets.value.map((a) => history(a.id, force)))
  }
  const series = computed(() =>
    Object.fromEntries(
      assets.value.map((a) => [a.id, observations(histories.value[a.id]?.response?.data ?? [])]),
    ),
  )
  async function add(asset: Asset) {
    if (assets.value.some((a) => a.id === asset.id)) return
    await history(asset.id)
    if (!histories.value[asset.id]?.response?.data.length)
      throw new Error('未能取得这个代码的净值历史，请核对基金代码或稍后重试。')
    if (!assets.value.some((a) => a.id === asset.id)) assets.value = [...assets.value, asset]
    if (!focus.value) focus.value = asset.id
    if (!last.value) last.value = asset.id
    save()
  }
  function remove(id: string) {
    assets.value = assets.value.filter((a) => a.id !== id)
    if (focus.value === id) focus.value = assets.value[0]?.id ?? ''
    if (last.value === id) last.value = focus.value
    save()
  }
  return {
    assets,
    focus,
    last,
    histories,
    model,
    intraday,
    series,
    showAdd,
    initialize,
    save,
    history,
    refresh,
    add,
    remove,
    loadModel,
    loadIntraday,
  }
}
