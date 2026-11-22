import { asOf, monthsBefore, type Point } from './market.ts'

export type Rates = Record<'DGS6MO' | 'DGS1' | 'DGS2' | 'DFF', Point[]>
interface MomentumLeg {
  start: string
  benchmarkDate: string
  gold: number
  treasury: number
  score: number
}
export interface GoldSignal {
  date: string
  six: MomentumLeg
  twelve: MomentumLeg
  momentum: number
  spread: number
  spreadDate: string
  fed: number
  volatility: number
  coefficient: number
  weight: number
}
const dayMs = 86400000
const days = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / dayMs

function leg(prices: Point[], rates: Point[], end: Point, months: number): MomentumLeg | undefined {
  const boundary = monthsBefore(end.date, months)
  const start = asOf(prices, boundary)
  if (!start || days(start.date, boundary) > 7) return
  const bond = asOf(rates, start.date)
  if (!bond || days(bond.date, start.date) > 7) return
  const gold = end.value / start.value - 1
  const treasury = ((bond.value / 100) * days(start.date, end.date)) / 365
  return { start: start.date, benchmarkDate: bond.date, gold, treasury, score: gold > treasury ? 0.5 : 0 }
}

// DFF is published the following business day. At each US close use an earlier
// effective date, and average over actual Treasury observations (no weekend padding).
function spreadMeans(rates: Rates): Point[] {
  const window: number[] = [],
    means: Point[] = []
  let previousDate = ''
  for (const twoYear of rates.DGS2) {
    const effective = asOf(rates.DFF, twoYear.date, true)
    if (previousDate && days(previousDate, twoYear.date) > 7) window.length = 0
    previousDate = twoYear.date
    if (!effective || days(effective.date, twoYear.date) > 7) {
      window.length = 0
      continue
    }
    window.push(twoYear.value - effective.value)
    if (window.length > 20) window.shift()
    if (window.length === 20)
      means.push({ date: twoYear.date, value: window.reduce((a, b) => a + b, 0) / 20 })
  }
  return means
}

export function goldSignals(prices: Point[], rates: Rates): GoldSignal[] {
  const means = spreadMeans(rates),
    signals: GoldSignal[] = []
  const decay = 60 / 61
  let sum = 0,
    squaredWeights = 0,
    mean = 0,
    m2 = 0
  for (let i = 1; i < prices.length; i++) {
    const price = prices[i]!,
      daily = price.value / prices[i - 1]!.value - 1
    sum = sum * decay + 1
    squaredWeights = squaredWeights * decay ** 2 + 1
    const delta = daily - mean
    mean += delta / sum
    m2 = decay * m2 + delta * (daily - mean)
    if (i < 60) continue
    const six = leg(prices, rates.DGS6MO, price, 6),
      twelve = leg(prices, rates.DGS1, price, 12)
    const spread = asOf(means, price.date)
    if (!six || !twelve || !spread || days(spread.date, price.date) > 7) continue
    const volatility = Math.sqrt(Math.max(0, m2 / (sum - squaredWeights / sum)) * 252)
    const coefficient = volatility === 0 ? 1 : Math.min(1, 0.15 / volatility)
    const momentum = six.score + twelve.score,
      fed = spread.value < 0 ? 1 : 0
    signals.push({
      date: price.date,
      six,
      twelve,
      momentum,
      spread: spread.value,
      spreadDate: spread.date,
      fed,
      volatility,
      coefficient,
      weight: ((momentum + fed) / 2) * coefficient,
    })
  }
  return signals
}

export function signalAtChinaClose(model: GoldSignal[], date: string) {
  const signal = asOf(model, date, true)
  return signal && days(signal.date, date) <= 7 ? signal : undefined
}
