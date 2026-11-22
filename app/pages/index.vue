<script setup lang="ts">
import { monthsBefore, trailingChange, percent, direction, type Asset } from '~~/shared/market'
const { assets, histories, series, focus, showAdd } = useCompass()
const months = ref(3),
  filter = ref('全部'),
  compare = ref<HTMLDialogElement>(),
  excluded = ref<string[]>([])
const selected = computed(() => assets.value.filter((a) => !excluded.value.includes(a.id)))
const groups = computed(() => ['全部', ...new Set(assets.value.map((a) => a.group))])
const visible = computed(() =>
  assets.value.filter((a) => filter.value === '全部' || a.group === filter.value),
)
watch(groups, (g) => {
  if (!g.includes(filter.value)) filter.value = '全部'
})
const swatches = ['#658a77', '#b48543', '#8175a5', '#52899a', '#a66583', '#779345']
const color = (id: string) =>
  swatches[
    Math.max(
      0,
      assets.value.findIndex((a) => a.id === id),
    ) % swatches.length
  ]!
const data = (a: Asset) => series.value[a.id] || []
const focusAsset = computed(() => assets.value.find((a) => a.id === focus.value) ?? assets.value[0])
const focusRow = computed(() => (focusAsset.value ? data(focusAsset.value).at(-1) : undefined))
const comparison = computed(() => {
  const entries = selected.value.map((a) => ({ a, rows: data(a) })).filter((d) => d.rows.length)
  if (!entries.length) return { dates: [], lines: [] }
  // Use common observation dates and a common base, including different exchange holidays.
  const end = entries.map((d) => d.rows.at(-1)!.date).sort()[0]!
  const start = monthsBefore(end, months.value)
  const maps = entries.map((d) => new Map(d.rows.map((p) => [p.date, p.index])))
  const dates = entries[0]!.rows
    .map((p) => p.date)
    .filter((d) => d >= start && d <= end && maps.every((m) => m.has(d)))
  return {
    dates,
    lines: entries.map(({ a }, i) => {
      const map = maps[i]!,
        base = map.get(dates[0]!)
      return {
        name: a.short,
        id: a.id,
        color: color(a.id),
        values: dates.map((d) => (base ? map.get(d)! / base - 1 : null)),
      }
    }),
  }
})
function toggle(id: string) {
  excluded.value = excluded.value.includes(id)
    ? excluded.value.filter((v) => v !== id)
    : [...excluded.value, id]
}
function spark(a: Asset) {
  const rows = data(a),
    last = rows.at(-1)
  if (!last) return []
  const start = monthsBefore(last.date, 1)
  return rows.filter((p) => p.date >= start).map((p) => p.index)
}
const nav = (a: Asset) => navigateTo('/asset/' + a.id)
</script>
<template>
  <div>
    <div class="ac-intro">
      <div>
        <h1>资产观察台</h1>
        <p>{{ assets.length }} 个关注标的 · 人民币行情与场外基金净值</p>
      </div>
      <button class="ac-primary" @click="showAdd = true">
        <span>＋</span>
        添加标的
      </button>
    </div>
    <div class="ac-panels">
      <section class="ac-chart-card" aria-labelledby="overview-trend">
        <div class="ac-chart-head">
          <div>
            <h2 id="overview-trend">跨资产走势</h2>
            <p class="ac-caption">共同观测日归一 · 区间累计涨跌幅</p>
          </div>
          <PeriodSelect v-model="months" :options="[1, 3, 6]" />
        </div>
        <div class="ac-legend">
          <div v-for="line in comparison.lines" :key="line.id" class="ac-key">
            <span class="ac-key-name">
              <i class="ac-swatch" :style="{ background: line.color }"></i>
              {{ line.name }}
            </span>
            <strong :class="direction(line.values.at(-1))">{{ percent(line.values.at(-1), true) }}</strong>
          </div>
        </div>
        <div class="ac-plot">
          <TrendChart
            :dates="comparison.dates"
            :lines="comparison.lines"
            :empty="
              assets.some((a) => histories[a.id]?.loading) ? '正在读取历史行情…' : '当前对比没有共同观测日'
            "
          />
        </div>
        <div class="ac-chart-foot">
          <span id="ac-chart-dates">
            {{ comparison.dates[0] || '—' }} 至 {{ comparison.dates.at(-1) || '—' }}
          </span>
          <button class="ac-text-btn" @click="compare?.showModal()">⇄ 调整对比</button>
        </div>
      </section>
      <section v-if="focusAsset" class="ac-feature" aria-label="焦点观察">
        <div class="ac-feature-top">
          <span class="ac-focus-label">
            <i></i>
            焦点观察
          </span>
          <button class="ac-focus-open" @click="nav(focusAsset)">查看详情 ↗</button>
        </div>
        <h2>{{ focusAsset.short }}</h2>
        <div class="ac-focus-meta">
          {{ focusAsset.id }} · {{ focusAsset.group }} ·
          {{ focusRow?.date || (histories[focusAsset.id]?.loading ? '读取中' : '暂无行情') }}
        </div>
        <div class="ac-art"><FocusArtwork :kind="focusAsset.kind" /></div>
        <div class="ac-focus-stats">
          <div>
            <small>{{ focusAsset.kind === 'gold' ? '收盘价（元/克）' : '单位净值（元）' }}</small>
            <strong>{{ focusRow?.value.toFixed(focusAsset.kind === 'gold' ? 2 : 4) || '—' }}</strong>
          </div>
          <div>
            <small>近 3 月涨跌</small>
            <strong :class="direction(trailingChange(data(focusAsset), 3))">
              {{ percent(trailingChange(data(focusAsset), 3), true) }}
            </strong>
          </div>
        </div>
      </section>
    </div>
    <section class="ac-list">
      <div class="ac-list-head">
        <div class="ac-list-title">
          <h2>我的关注</h2>
          <span>{{ assets.length }}</span>
        </div>
        <div class="ac-filters" aria-label="按分组筛选">
          <button v-for="g in groups" :key="g" :aria-pressed="filter === g" @click="filter = g">
            {{ g }}
          </button>
        </div>
      </div>
      <table class="ac-table">
        <thead>
          <tr>
            <th>标的名称</th>
            <th class="ac-category-col">类别</th>
            <th class="ac-trend-col">近 1 月走势</th>
            <th class="ac-number-col">近 3 月涨跌</th>
            <th class="ac-number-col ac-vol-col">60 日波动率</th>
            <th class="ac-method-col">观察方法</th>
            <th><span class="ac-sr">查看详情</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in visible" :key="a.id">
            <td>
              <button class="ac-asset-btn" :title="a.name" @click="nav(a)">
                <AssetGlyph :asset="a" />
                <span class="ac-asset-label">
                  <span class="ac-asset-name">{{ a.short }}</span>
                  <span class="ac-symbol">{{ a.id }} · {{ data(a).at(-1)?.date || '待更新' }}</span>
                </span>
              </button>
              <span v-if="histories[a.id]?.error" class="ac-source">{{ histories[a.id]?.error }}</span>
            </td>
            <td class="ac-category-col">
              <span class="ac-tag">{{ a.group }}</span>
            </td>
            <td class="ac-trend-col"><SparkLine :values="spark(a)" /></td>
            <td class="ac-number-col" :class="direction(trailingChange(data(a), 3))">
              {{ percent(trailingChange(data(a), 3), true) }}
            </td>
            <td class="ac-number-col ac-vol-col">{{ percent(data(a).at(-1)?.volatility) }}</td>
            <td class="ac-method-col ac-method">{{ a.kind === 'gold' ? '黄金三支箭' : '净值与波动率' }}</td>
            <td>
              <button class="ac-row-more" :aria-label="'查看' + a.short + '详情'" @click="nav(a)">
                详情 ↗
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!visible.length" class="ac-empty">添加标的后即可查看走势</p>
    </section>
    <dialog ref="compare" class="ac-dialog" aria-labelledby="compare-heading">
      <div class="ac-dialog-head">
        <h2 id="compare-heading">调整对比</h2>
        <button aria-label="关闭" class="ac-close" @click="compare?.close()">×</button>
      </div>
      <label v-for="a in assets" :key="a.id" class="ac-choice">
        <input type="checkbox" :checked="!excluded.includes(a.id)" @change="toggle(a.id)" />
        {{ a.short }}
        <small>{{ a.id }}</small>
      </label>
      <div class="ac-actions"><button class="ac-primary" @click="compare?.close()">完成</button></div>
    </dialog>
  </div>
</template>
