import { download } from './download'

import type { Point } from '../../shared/market'
interface FundObservation extends Point {
  growth: number | null
}
interface FundPage {
  ErrCode: number
  PageIndex: number
  PageSize: number
  TotalCount: number
  Data?: { LSJZList?: { FSRQ: string; DWJZ: string; JZZZL: string }[] }
}

const sge = 'https://www.sge.com.cn'
const fundHeaders = { referer: 'https://fundf10.eastmoney.com/' }
const pageSize = 20

async function readJson<T>(url: string, options?: Parameters<typeof download>[1]): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await download(url, options)))
}

function shanghaiDate() {
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}

function validDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const timestamp = Date.parse(date + 'T00:00:00Z')
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().startsWith(date)
}

function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requireFundCode(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error('请输入六位基金代码')
}

const spotRequest = { body: 'instid=Au99.99', headers: { referer: sge + '/sjzx/mrhq' } }

export async function loadSpotHistory(): Promise<Point[]> {
  const response = await readJson<{ time?: unknown[][] }>(sge + '/graph/Dailyhq', spotRequest)
  const prices = new Map<string, number>()
  const today = shanghaiDate()
  // 上金所图表数组依次为日期、开盘、收盘、最低、最高。
  for (const row of response.time ?? []) {
    if (!Array.isArray(row)) continue
    const [date, , close] = row
    const value = numeric(close)
    if (validDate(date) && date <= today && value !== null && value > 0) prices.set(date, value)
  }
  if (!prices.size) throw new Error('上金所未返回 Au99.99 日线')
  return [...prices].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
}

function sessionMinute(time: string) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return -1
  const minute = Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  // 20:00 为上金所夜盘起点；以此排序，跨午夜时分时曲线仍连续。
  return (minute + 4 * 60) % (24 * 60)
}

export async function loadSpotIntraday(): Promise<{
  sourceTime: string
  points: { time: string; value: number }[]
}> {
  const response = await readJson<{
    heyue?: string
    delaystr?: string
    times?: string[]
    data?: unknown[]
  }>(sge + '/graph/quotations', spotRequest)
  const sourceTime = typeof response.delaystr === 'string' ? response.delaystr.trim() : ''
  const points: { time: string; value: number }[] = []
  const match = /^(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{2}:\d{2}):([0-5]\d)$/.exec(sourceTime)
  if (response.heyue !== 'Au99.99' || !match) return { sourceTime, points }
  const date = [match[1], match[2]!.padStart(2, '0'), match[3]!.padStart(2, '0')].join('-')
  const cutoff = sessionMinute(match[4]!)
  const sourceEpoch = Date.parse(date + 'T' + match[4] + ':' + match[5] + '+08:00')
  // 休市时接口可能已切换到下个交易日，并为整个白盘预填价格。
  if (!validDate(date) || cutoff < 0 || sourceEpoch > Date.now()) return { sourceTime, points }
  const { times, data } = response
  if (!Array.isArray(times) || !Array.isArray(data) || times.length !== data.length)
    return { sourceTime, points }
  let previous = -1
  for (let i = 0; i < times.length; i++) {
    const time = times[i]!
    const order = sessionMinute(time)
    const value = numeric(data[i])
    if (order <= previous || order > cutoff || value === null || value <= 0) continue
    // 夜盘 20:00–02:30，白盘 09:00–15:30；剔除非交易时段。
    if ((order > 390 && order < 780) || order > 1170) continue
    points.push({ time, value })
    previous = order
  }
  return { sourceTime, points }
}

export async function loadFundHistory(code: string): Promise<FundObservation[]> {
  requireFundCode(code)
  const endDate = shanghaiDate()
  const rows: FundObservation[] = []
  let total = 0
  for (let page = 1; page === 1 || rows.length < total; page++) {
    const params = new URLSearchParams({
      fundCode: code,
      pageIndex: String(page),
      pageSize: String(pageSize),
      endDate,
    })
    const result = await readJson<FundPage>('https://api.fund.eastmoney.com/f10/lsjz?' + params, {
      headers: fundHeaders,
    })
    if (page === 1) total = result.TotalCount
    const records = result.Data?.LSJZList
    const expected = Math.min(pageSize, total - rows.length)
    if (
      result.ErrCode !== 0 ||
      !Number.isSafeInteger(total) ||
      total <= 0 ||
      result.TotalCount !== total ||
      result.PageIndex !== page ||
      result.PageSize !== pageSize ||
      !Array.isArray(records) ||
      records.length !== expected
    ) {
      throw new Error('天天基金 ' + code + ' 历史净值分页不完整（第 ' + page + ' 页）')
    }
    // 按来源的降序校验相邻记录，抓取中换页或新披露导致的重复行不能入库。
    for (const record of records) {
      const date = record.FSRQ
      const value = numeric(record.DWJZ)
      const previous = rows.at(-1)
      if (
        !validDate(date) ||
        date > endDate ||
        (previous && date >= previous.date) ||
        value === null ||
        value <= 0
      ) {
        throw new Error('天天基金 ' + code + ' 单位净值记录缺失或日期异常')
      }
      rows.push({ date, value, growth: numeric(record.JZZZL) })
    }
  }
  return rows.reverse()
}

export async function resolveFundName(code: string): Promise<string> {
  requireFundCode(code)
  const result = await readJson<{
    ErrCode: number
    Datas?: { CODE: string; FundBaseInfo?: { FCODE: string; SHORTNAME: string } }[]
  }>('https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=' + code, {
    headers: fundHeaders,
  })
  const match = result.Datas?.find((item) => item.CODE === code && item.FundBaseInfo?.FCODE === code)
  const name = match?.FundBaseInfo?.SHORTNAME?.trim()
  if (result.ErrCode !== 0 || !name) throw new Error('天天基金未找到基金 ' + code)
  return name
}
