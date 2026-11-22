<script setup lang="ts">
import type { GoldSignal } from '~~/shared/strategy'
import { percent } from '~~/shared/market'
const props = defineProps<{ signal?: GoldSignal; error: string; loading: boolean }>()
const budget = ref('10000'),
  held = ref('')
onMounted(() => {
  try {
    const saved = JSON.parse(localStorage.getItem('asset-compass/budget-v1') || '{}')
    if (typeof saved.budget === 'string') budget.value = saved.budget
    if (typeof saved.held === 'string') held.value = saved.held
  } catch {
    /* Optional personal settings. */
  }
})
watch([budget, held], () => {
  try {
    localStorage.setItem(
      'asset-compass/budget-v1',
      JSON.stringify({ budget: budget.value, held: held.value }),
    )
  } catch {
    /* Optional. */
  }
})
const money = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const target = computed(() =>
  props.signal && budget.value.trim() && Number.isFinite(Number(budget.value)) && Number(budget.value) > 0
    ? Math.round(Number(budget.value) * props.signal.weight * 100) / 100
    : null,
)
const adjustment = computed(() => {
  if (
    target.value == null ||
    !held.value.trim() ||
    !Number.isFinite(Number(held.value)) ||
    Number(held.value) < 0
  )
    return ''
  const difference = Math.round((target.value - Number(held.value)) * 100) / 100
  if (difference === 0)
    return target.value === 0 ? '观望 · 目标与持仓均为零' : '持有 · 当前持仓已达到目标金额'
  return (difference > 0 ? '加仓差额 ' : '减仓差额 ') + money(Math.abs(difference)) + ' 元'
})
</script>
<template>
  <section class="ac-model">
    <div class="ac-model-head">
      <div>
        <p class="ac-model-label">观察公式 · 美国市场信号</p>
        <h2>黄金三支箭</h2>
      </div>
      <div class="ac-result">
        <b>{{ percent(signal?.weight) }}</b>
        <small>策略目标仓位</small>
      </div>
    </div>
    <p id="ac-equation">目标仓位 =（动量得分 ＋ 美联储得分）÷ 2 × 波动率系数</p>
    <div id="ac-factors">
      <div class="ac-factor">
        <b>动量 {{ signal?.momentum ?? '—' }} 分</b>
        <small>
          6 个月 {{ signal ? signal.six.score + ' 分' : '—' }} · 12 个月
          {{ signal ? signal.twelve.score + ' 分' : '—' }}
        </small>
      </div>
      <div class="ac-factor">
        <b>美联储 {{ signal?.fed ?? '—' }} 分</b>
        <small>20 日平均利差 {{ signal ? signal.spread.toFixed(2) + ' 个百分点' : '—' }}</small>
      </div>
      <div class="ac-factor">
        <b>波动率系数 {{ signal ? signal.coefficient.toFixed(3) + '×' : '—' }}</b>
        <small>年化波动率 {{ percent(signal?.volatility) }}</small>
      </div>
    </div>
    <p id="ac-evaluation" role="status">
      {{
        error ||
        (signal
          ? '美国信号日 ' + signal.date + ' · 使用所选国内收盘日前可用的信号'
          : loading
            ? '正在读取 GLD 和美国利率…'
            : '该日期缺少可用的美国信号')
      }}
    </p>
    <div class="ac-amount">
      <label>
        策略资金
        <input v-model="budget" type="text" inputmode="decimal" aria-label="策略资金" />
      </label>
      元
      <span v-if="target !== null">
        ，对应黄金持仓市值
        <strong>{{ money(target) }} 元</strong>
      </span>
    </div>
    <details>
      <summary>查看计算依据与调仓差额</summary>
      <p>
        黄金美元代理使用 GLD 收盘价。6 个月累计收益 {{ percent(signal?.six.gold, true) }}，同期美债基准
        {{ percent(signal?.six.treasury, true) }}。12 个月累计收益
        {{ percent(signal?.twelve.gold, true) }}，同期美债基准
        {{ percent(signal?.twelve.treasury, true) }}。每跑赢一个期限得 0.5 分。
      </p>
      <p>
        美债基准按起点年化收益率 × 实际天数 ÷ 365 近似。2 年期美债与已可用的有效联邦基金利率之差，取最近 20
        个美债观测日均值，低于零得 1 分。
      </p>
      <p>
        GLD 日收益按指数权重计算年化波动率，权重质心 60 个交易日，年化因子 √252。波动率系数取 15% ÷
        年化波动率与 1 的较小值。
      </p>
      <div class="ac-amount">
        <label>
          已有黄金市值
          <input
            v-model="held"
            type="text"
            inputmode="decimal"
            placeholder="选填"
            aria-label="已有黄金市值"
          />
        </label>
        元
        <span v-if="adjustment">· {{ adjustment }}</span>
      </div>
    </details>
  </section>
</template>
