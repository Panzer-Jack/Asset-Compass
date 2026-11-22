import { domesticGold, type Price } from '../../shared/market'
import { goldSignals } from '../../shared/strategy'
import { loadFundHistory, loadSpotHistory } from './domestic-sources'
import { loadGoldProxy, loadRates } from './us-sources'
import { snapshot } from './cache'

export function dailyPrices(id: string, refresh = false) {
  return snapshot<Price[]>('history:' + id, 4 * 3600000, refresh, () =>
    id === domesticGold.id ? loadSpotHistory() : loadFundHistory(id),
  )
}

let derived: { version: string; signals: ReturnType<typeof goldSignals> } | undefined
export async function goldModel(refresh = false) {
  const [price, rates] = await Promise.all([
    snapshot('proxy:GLD', 6 * 3600000, refresh, loadGoldProxy),
    snapshot('rates:FRED', 6 * 3600000, refresh, loadRates),
  ])
  const version = price.fetchedAt + '/' + rates.fetchedAt
  if (derived?.version !== version) {
    const signals = goldSignals(price.data, rates.data).slice(-750)
    if (!signals.length) throw createError({ statusCode: 503, statusMessage: 'Insufficient model history' })
    derived = { version, signals }
  }
  return {
    data: derived.signals,
    stale: price.stale || rates.stale,
    fetchedAt: price.fetchedAt < rates.fetchedAt ? price.fetchedAt : rates.fetchedAt,
  }
}
