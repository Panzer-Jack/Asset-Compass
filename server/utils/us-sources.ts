import { strFromU8, unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { download } from './download'

import type { Point } from '../../shared/market'
const rateIds = ['DGS6MO', 'DGS1', 'DGS2', 'DFF'] as const
type RateId = (typeof rateIds)[number]

const goldArchive =
  'https://api.spdrgoldshares.com/api/v1/historical-archive?exchange=NYSE&lang=en&product=gld'
const fredGraph =
  'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + rateIds.join(',') + '&cosd=2003-11-01'
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const numberField = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i

function points(values: Map<string, number>): Point[] {
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }))
}

function numeric(text: string): number | undefined {
  if (!numberField.test(text)) return undefined
  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}

// SPDR stores dates as shared strings (e.g. 18-Nov-2004). Numeric Excel
// dates use the 1900 date system in this workbook.
const months = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ')
function archiveDate(text: string): string | undefined {
  if (isoDate.test(text)) return text
  const parts = /^(\d{1,2})-([a-z]{3})-(\d{4})$/i.exec(text)
  if (parts) {
    const month = months.indexOf(parts[2]!.toLowerCase()) + 1
    if (month) return [parts[3], String(month).padStart(2, '0'), parts[1]!.padStart(2, '0')].join('-')
  }
  if (/^\d{5}$/.test(text))
    return new Date(Date.UTC(1899, 11, 30) + Number(text) * 86_400_000).toISOString().slice(0, 10)
}

type ExcelText = { t?: string; r?: { t?: string }[] }
type ExcelCell = { '@r': string; '@t'?: string; v?: string; is?: ExcelText }
type ExcelRow = { c?: ExcelCell[] }
function excelText(item?: ExcelText): string {
  return item?.t ?? item?.r?.map((run) => run.t ?? '').join('') ?? ''
}

export async function loadGoldProxy(): Promise<Point[]> {
  const bytes = await download(goldArchive, { international: true })
  const files = unzipSync(bytes, {
    filter: ({ name }) => /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/.test(name),
  })
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    isArray: (name) => ['si', 'row', 'c', 'r'].includes(name),
  })
  const strings: ExcelText[] = files['xl/sharedStrings.xml']
    ? parser.parse(strFromU8(files['xl/sharedStrings.xml'])).sst.si
    : []
  function cellText(cell?: ExcelCell) {
    if (cell?.['@t'] === 's') return excelText(strings[Number(cell.v)])
    if (cell?.['@t'] === 'inlineStr') return excelText(cell.is)
    return cell?.v ?? ''
  }

  for (const [name, file] of Object.entries(files)) {
    if (!name.startsWith('xl/worksheets/')) continue
    const rows: ExcelRow[] = parser.parse(strFromU8(file)).worksheet?.sheetData?.row ?? []
    const header = rows[0]?.c ?? []
    const column = (label: string) =>
      header.find((cell) => cellText(cell) === label)?.['@r'].replace(/\d+$/, '')
    const dateCol = column('Date')
    const priceCol = column('Closing Price')
    if (!dateCol || !priceCol) continue

    const closes = new Map<string, number>()
    for (const row of rows.slice(1)) {
      const byColumn = (col: string) => row.c?.find((cell) => cell['@r'].replace(/\d+$/, '') === col)
      const date = archiveDate(cellText(byColumn(dateCol)))
      const value = numeric(cellText(byColumn(priceCol)))
      // The workbook includes non-trading days marked "US Holiday".
      if (date && value !== undefined && value > 0) closes.set(date, value)
    }
    if (closes.size) return points(closes)
  }
  throw new Error('SPDR 历史档案缺少有效的 GLD 收盘价')
}

export async function loadRates(): Promise<Record<RateId, Point[]>> {
  const bytes = await download(fredGraph, {
    international: true,
    headers: { 'user-agent': 'Asset-Compass/0.1' },
  })
  // FRED groups daily and seven-day series into separate CSVs in a ZIP.
  const csvFiles =
    bytes[0] === 0x50 && bytes[1] === 0x4b
      ? Object.values(unzipSync(bytes, { filter: ({ name }) => /\.csv$/i.test(name) }))
      : [bytes]
  const series: Record<RateId, Map<string, number>> = {
    DGS6MO: new Map(),
    DGS1: new Map(),
    DGS2: new Map(),
    DFF: new Map(),
  }
  for (const csv of csvFiles) {
    const [header, ...rows] = strFromU8(csv).trim().split(/\r?\n/)
    const columns = header?.split(',').map((field) => field.trim()) ?? []
    const dateCol = columns.findIndex((field) => /^(observation_date|date)$/i.test(field))
    if (dateCol < 0) continue
    const rates = rateIds.map((id) => ({ id, col: columns.indexOf(id) })).filter(({ col }) => col >= 0)
    for (const row of rows) {
      const fields = row.split(',')
      const date = fields[dateCol]?.trim() ?? ''
      if (!isoDate.test(date)) continue
      for (const { id, col } of rates) {
        const value = numeric(fields[col]?.trim() ?? '')
        if (value !== undefined) series[id].set(date, value)
      }
    }
  }
  for (const id of rateIds) {
    if (!series[id].size) throw new Error('FRED 缺少利率序列 ' + id)
  }
  // FRED publishes percent units: e.g. 3.75 represents 3.75% per year.
  return {
    DGS6MO: points(series.DGS6MO),
    DGS1: points(series.DGS1),
    DGS2: points(series.DGS2),
    DFF: points(series.DFF),
  }
}
