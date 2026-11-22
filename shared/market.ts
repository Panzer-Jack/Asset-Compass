export interface Point {
  date: string
  value: number
}
export interface Price extends Point {
  growth?: number | null
}
export interface Asset {
  id: string
  name: string
  short: string
  group: string
  kind: 'gold' | 'fund'
}
export interface Snapshot<T> {
  data: T
  fetchedAt: string
  stale: boolean
}
export interface Intraday {
  sourceTime: string
  points: { time: string; value: number }[]
}

export const domesticGold: Asset = {
  id: 'Au99.99',
  name: '国内黄金 Au99.99',
  short: '国内黄金',
  group: '贵金属',
  kind: 'gold',
}
const nasdaq100: Asset = {
  id: '019172',
  name: '摩根纳斯达克100指数（QDII）人民币A',
  short: '纳斯达克100',
  group: '场外基金',
  kind: 'fund',
}
export const sp500: Asset = {
  id: '017641',
  name: '摩根标普500指数（QDII）人民币A',
  short: '标普500',
  group: '场外基金',
  kind: 'fund',
}
export const funds: Asset[] = [
  nasdaq100,
  sp500,
  {
    id: '019305',
    name: '摩根标普500指数（QDII）人民币C',
    short: '标普500 · C',
    group: '场外基金',
    kind: 'fund',
  },
  {
    id: '019547',
    name: '招商纳斯达克100ETF发起式联接（QDII）A',
    short: '招商纳指100',
    group: '场外基金',
    kind: 'fund',
  },
]
export const initialAssets = [domesticGold, nasdaq100, sp500]

export function monthsBefore(date: string, months: number) {
  const day = new Date(date + 'T00:00:00Z')
  const end = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - months + 1, 0))
  end.setUTCDate(Math.min(day.getUTCDate(), end.getUTCDate()))
  return end.toISOString().slice(0, 10)
}

export function asOf<T extends { date: string }>(rows: T[], date: string, strict = false): T | undefined {
  let lo = 0,
    hi = rows.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    if (strict ? rows[mid]!.date < date : rows[mid]!.date <= date) lo = mid + 1
    else hi = mid
  }
  return rows[lo - 1]
}

export interface Observation extends Point {
  index: number
  volatility: number | null
}
export function observations(prices: Price[]): Observation[] {
  let index = 100
  const daily: number[] = []
  return prices.map((price, i) => {
    if (i > 0) {
      const change = price.growth != null ? price.growth / 100 : price.value / prices[i - 1]!.value - 1
      index *= 1 + change
      daily.push(change)
      if (daily.length > 60) daily.shift()
    }
    let volatility: number | null = null
    if (daily.length === 60) {
      const mean = daily.reduce((a, b) => a + b, 0) / 60
      volatility = Math.sqrt((daily.reduce((s, r) => s + (r - mean) ** 2, 0) / 59) * 252)
    }
    return { date: price.date, value: price.value, index, volatility }
  })
}
export function trailingChange(rows: Observation[], months: number, last = rows.at(-1)) {
  if (!last) return null
  const anchor = asOf(rows, monthsBefore(last.date, months))
  return anchor ? last.index / anchor.index - 1 : null
}
export const percent = (ratio: number | null | undefined, signed = false) =>
  ratio == null ? '—' : (signed && ratio > 0 ? '+' : '') + (ratio * 100).toFixed(2) + '%'
export const direction = (ratio: number | null | undefined) => (!ratio ? '' : ratio > 0 ? 'ac-pos' : 'ac-neg')
