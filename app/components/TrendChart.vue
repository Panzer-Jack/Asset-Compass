<script setup lang="ts">
export interface PlotLine {
  name: string
  values: (number | null)[]
  color: string
  right?: boolean
  directional?: boolean
}
const props = withDefaults(
  defineProps<{
    dates: string[]
    lines: PlotLine[]
    cursor?: number
    format?: 'percent' | 'price'
    empty?: string
    precision?: number
  }>(),
  { cursor: -1, format: 'percent', empty: '暂无可显示的数据', precision: 2 },
)
const emit = defineEmits<{ select: [index: number] }>()
const box = ref<HTMLElement>(),
  width = ref(700),
  height = ref(200),
  hover = ref(-1)
let observer: ResizeObserver | undefined
onMounted(() => {
  if (box.value) {
    observer = new ResizeObserver(([entry]) => {
      if (entry) {
        width.value = entry.contentRect.width
        height.value = entry.contentRect.height
      }
    })
    observer.observe(box.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(
  () => props.dates,
  () => {
    hover.value = -1
  },
)
const secondary = computed(() => props.lines.some((l) => l.right))
const left = computed(() => (props.format === 'price' ? 53 : 49))
const right = computed(() => width.value - (secondary.value ? 42 : 9))
const bottom = computed(() => height.value - 23)
const length = computed(() => props.dates.length)
const finite = (v: number | null | undefined): v is number => v != null && Number.isFinite(v)
function domain(lines: PlotLine[], withZero: boolean) {
  const numbers = lines.flatMap((l) => l.values.filter(finite))
  if (!numbers.length) return [0, 1] as const
  let min = Math.min(...numbers),
    max = Math.max(...numbers)
  if (withZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  const pad = (max - min || Math.abs(max) || 1) * 0.08
  return [min - (withZero && min === 0 ? 0 : pad), max + pad] as const
}
const primaryScale = computed(() =>
  domain(
    props.lines.filter((l) => !l.right),
    props.format === 'percent',
  ),
)
const rightScale = computed(
  () =>
    [
      0,
      Math.max(
        0.05,
        Math.ceil(
          Math.max(0, ...props.lines.filter((l) => l.right).flatMap((l) => l.values.filter(finite))) * 10,
        ) / 10,
      ),
    ] as const,
)
const x = (i: number) =>
  left.value + (right.value - left.value) * (length.value > 1 ? i / (length.value - 1) : 0.5)
const y = (value: number, rightAxis = false) => {
  const [min, max] = rightAxis ? rightScale.value : primaryScale.value
  return bottom.value - ((value - min) / (max - min)) * (bottom.value - 12)
}
const shapes = computed(() =>
  props.lines.map((line) => {
    let connected = false
    const commands: string[] = [],
      rising: string[] = [],
      falling: string[] = [],
      flat: string[] = []
    line.values.forEach((v, i) => {
      if (!finite(v)) {
        connected = false
        return
      }
      const prior = line.values[i - 1]
      if (line.directional && connected && finite(prior)) {
        const segment =
          'M' +
          x(i - 1).toFixed(1) +
          ' ' +
          y(prior).toFixed(1) +
          'L' +
          x(i).toFixed(1) +
          ' ' +
          y(v).toFixed(1)
        ;(v > prior ? rising : v < prior ? falling : flat).push(segment)
      }
      commands.push((connected ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v, line.right).toFixed(1))
      connected = true
    })
    return {
      ...line,
      path: commands.join(' '),
      rising: rising.join(' '),
      falling: falling.join(' '),
      flat: flat.join(' '),
    }
  }),
)
const ticks = computed(() =>
  [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const [min, max] = primaryScale.value
    const val = min + (max - min) * t
    return {
      y: y(val),
      l: formatValue(val, false, true),
      r: formatValue(rightScale.value[1] * t, true, true),
    }
  }),
)
const tickDates = computed(() => [
  ...new Set(
    Array.from({ length: width.value < 450 ? 3 : 5 }, (_, i) =>
      Math.round((i * (length.value - 1)) / (width.value < 450 ? 2 : 4)),
    ),
  ),
])
function formatValue(val: number, rightAxis?: boolean, tick?: boolean) {
  if (rightAxis || props.format === 'percent')
    return (val * 100).toFixed(tick ? (rightAxis ? 0 : 1) : 2) + '%'
  return val.toFixed(tick ? Math.min(2, props.precision) : props.precision)
}
const current = computed(() => (hover.value >= 0 ? hover.value : props.cursor))
function select(i: number) {
  if (!length.value) return
  hover.value = Math.max(0, Math.min(length.value - 1, i))
  emit('select', hover.value)
}
function move(e: PointerEvent) {
  if (!box.value || (e.pointerType === 'touch' && e.type === 'pointermove' && !e.buttons)) return
  select(
    Math.round(
      ((e.clientX - box.value.getBoundingClientRect().left - left.value) / (right.value - left.value)) *
        (length.value - 1),
    ),
  )
}
function key(e: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
  e.preventDefault()
  select(
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? length.value - 1
        : (current.value < 0 ? length.value - 1 : current.value) + (e.key === 'ArrowLeft' ? -1 : 1),
  )
}
</script>
<template>
  <div ref="box" class="trend-chart">
    <div v-if="!length || !shapes.some((l) => l.path)" class="ac-empty">{{ empty }}</div>
    <svg
      v-else
      :viewBox="`0 0 ${width} ${height}`"
      tabindex="0"
      role="img"
      :aria-label="lines.map((l) => l.name).join('、') + '趋势图，可用方向键查看历史值'"
      @pointermove="move"
      @pointerdown="move"
      @pointerleave="hover = -1"
      @keydown="key"
    >
      <g v-for="t in ticks" :key="t.y" class="chart-axis">
        <line :x1="left" :x2="right" :y1="t.y" :y2="t.y" />
        <text :x="left - 6" :y="t.y + 3" text-anchor="end">{{ t.l }}</text>
        <text v-if="secondary" :x="right + 5" :y="t.y + 3">{{ t.r }}</text>
      </g>
      <text
        v-for="i in tickDates"
        :key="i"
        class="chart-date"
        :x="x(i)"
        :y="height - 5"
        :text-anchor="i === 0 ? 'start' : i === length - 1 ? 'end' : 'middle'"
      >
        {{ dates[i]?.length === 10 ? dates[i]?.slice(5) : dates[i] }}
      </text>
      <g v-for="line in shapes" :key="line.name">
        <template v-if="line.directional">
          <path
            v-for="seg in ['rising', 'falling', 'flat'] as const"
            :key="seg"
            :d="line[seg]"
            fill="none"
            :stroke="seg === 'rising' ? 'var(--up)' : seg === 'falling' ? 'var(--down)' : line.color"
            stroke-width="2"
            stroke-linecap="round"
          />
        </template>
        <path
          v-else
          :d="line.path"
          fill="none"
          :stroke="line.color"
          :stroke-width="line.right ? 1.8 : 2.2"
          :stroke-dasharray="line.right ? '5 4' : undefined"
          stroke-linejoin="round"
        />
      </g>
      <g v-if="current >= 0 && current < length">
        <line :x1="x(current)" :x2="x(current)" y1="8" :y2="bottom" class="chart-cursor" />
        <template v-for="line in lines" :key="line.name">
          <circle
            v-if="finite(line.values[current])"
            :cx="x(current)"
            :cy="y(line.values[current]!, line.right)"
            r="3.3"
            :fill="line.color"
          />
        </template>
      </g>
    </svg>
    <output
      v-if="hover >= 0 && dates[hover]"
      class="chart-tip"
      :style="
        x(hover) > width / 2
          ? { right: Math.max(6, width - x(hover) + 7) + 'px' }
          : { left: Math.max(6, x(hover) + 7) + 'px' }
      "
    >
      <b>{{ dates[hover] }}</b>
      <span v-for="line in lines" :key="line.name">
        {{ line.name }}　{{ finite(line.values[hover]) ? formatValue(line.values[hover]!, line.right) : '—' }}
      </span>
    </output>
  </div>
</template>
<style scoped>
.trend-chart {
  height: 100%;
  width: 100%;
  position: relative;
}
.trend-chart svg {
  width: 100%;
  height: 100%;
  display: block;
  touch-action: pan-y;
}
.chart-axis line {
  stroke: var(--line);
  stroke-width: 0.75;
}
.chart-axis text,
.chart-date {
  font: 10px var(--digits);
  fill: var(--muted);
}
.chart-cursor {
  stroke: var(--muted);
  stroke-dasharray: 2 3;
  opacity: 0.6;
}
.chart-tip {
  position: absolute;
  top: 8px;
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  padding: 6px 9px;
  border-radius: 6px;
  box-shadow: 0 4px 12px #0001;
  pointer-events: none;
  font: 11px/1.6 var(--digits);
  white-space: nowrap;
  max-width: 85%;
  overflow: hidden;
}
.chart-tip span {
  display: block;
}
</style>
