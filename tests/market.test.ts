import test from 'node:test'
import assert from 'node:assert/strict'
import { asOf, monthsBefore, observations, trailingChange, type Point } from '../shared/market.ts'
import { goldSignals, signalAtChinaClose, type Rates } from '../shared/strategy.ts'

function businessDays(n: number): string[] {
  const dates: string[] = []
  for (let day = Date.UTC(2020, 0, 1); dates.length < n; day += 86400000) {
    const date = new Date(day)
    if (![0, 6].includes(date.getUTCDay())) dates.push(date.toISOString().slice(0, 10))
  }
  return dates
}
const dates = businessDays(480)
const series = (value: (i: number) => number): Point[] => dates.map((date, i) => ({ date, value: value(i) }))
function rates(twoYear: number, effective: number): Rates {
  return {
    DGS6MO: series(() => 2),
    DGS1: series(() => 2),
    DGS2: series(() => twoYear),
    DFF: series(() => effective),
  }
}
test('月末回看和跨市场按日期取值', () => {
  assert.equal(monthsBefore('2024-08-31', 6), '2024-02-29')
  assert.equal(asOf([{ date: '2025-01-10' }], '2025-01-09'), undefined)
  assert.equal(asOf([{ date: '2025-01-10' }], '2025-01-10', true), undefined)
})
test('基金分红日用披露增长率，空字段才使用相邻净值推算', () => {
  const rows = observations([
    { date: '2025-01-01', value: 1 },
    { date: '2025-01-02', value: 0.91, growth: 1 },
    { date: '2025-04-02', value: 0.9191, growth: null },
  ])
  assert.equal(rows[1]!.index, 101)
  assert.ok(Math.abs(trailingChange(rows, 3)! - 0.01) < 1e-12)
  assert.equal(rows[0]!.volatility, null)
})
test('低波动系数封顶，单独动量信号对应半仓', () => {
  const price = series((i) => 100 * Math.exp(0.001 * i))
  const result = goldSignals(price, rates(4, 3)).at(-1)!
  assert.equal(result.momentum, 1)
  assert.equal(result.fed, 0)
  assert.equal(result.coefficient, 1)
  assert.equal(result.weight, 0.5)
  assert.equal(result.six.benchmarkDate, result.six.start)
  assert.equal(
    result.six.treasury,
    (0.02 * (Date.parse(result.date) - Date.parse(result.six.start))) / 86400000 / 365,
  )
})
test('6 个月和 12 个月分别计半分，宏观信号独立', () => {
  const price = series((i) => (i < 300 ? 80 + i / 5 : 140 - (i - 300) / 20))
  const result = goldSignals(price, rates(2, 3)).at(-1)!
  assert.equal(result.six.score, 0)
  assert.equal(result.twelve.score, 0.5)
  assert.equal(result.fed, 1)
  assert.equal(result.weight, 0.75)
})
test('高波动系数和指数加权无偏样本方差一致', () => {
  const price = series((i) => 100 * Math.exp(0.0008 * i + (i % 2 ? 0.03 : 0)))
  const result = goldSignals(price, rates(2, 3)).at(-1)!
  const weighted = price
    .slice(1)
    .map((p, i) => ({ w: (60 / 61) ** (price.length - 2 - i), r: p.value / price[i]!.value - 1 }))
  const sum = weighted.reduce((a, b) => a + b.w, 0)
  const mean = weighted.reduce((a, b) => a + b.r * b.w, 0) / sum
  const variance =
    weighted.reduce((a, b) => a + b.w * (b.r - mean) ** 2, 0) /
    (sum - weighted.reduce((a, b) => a + b.w * b.w, 0) / sum)
  assert.ok(Math.abs(result.volatility - Math.sqrt(252 * variance)) < 1e-12)
  assert.ok(result.coefficient < 1 && result.coefficient > 0)
  assert.equal(result.weight, ((result.momentum + result.fed) / 2) * result.coefficient)
})
test('历史信号没有预热或利率观测时留空，国内收盘排除当天美国收盘', () => {
  const prices = series((i) => 100 + i)
  assert.equal(goldSignals(prices.slice(0, 70), rates(2, 3)).length, 0)
  assert.equal(goldSignals(prices, { ...rates(2, 3), DFF: [] }).length, 0)
  const model = goldSignals(prices, rates(2, 3)),
    last = model.at(-1)!
  assert.equal(signalAtChinaClose(model, last.date)?.date, model.at(-2)?.date)
  assert.equal(signalAtChinaClose(model, '2040-01-01'), undefined)
})
test('宏观取 20 个观测日均值且不使用当天尚未公布的 DFF', () => {
  const bank = rates(2, 3)
  bank.DFF.at(-1)!.value = 30
  bank.DGS2.at(-1)!.value = 4
  const result = goldSignals(
    series((i) => 100 + i),
    bank,
  ).at(-1)!
  assert.equal(result.spread, -0.9)
  assert.equal(result.fed, 1)
})
