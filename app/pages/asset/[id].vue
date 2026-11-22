<script setup lang="ts">
import { asOf, monthsBefore, percent, direction, trailingChange } from '~~/shared/market'
import { signalAtChinaClose } from '~~/shared/strategy'
const route = useRoute()
const {
  assets,
  focus,
  last,
  histories,
  model,
  intraday,
  series,
  showAdd,
  save,
  history,
  remove,
  loadModel,
  loadIntraday,
} = useCompass()
const id = computed(() => String(route.params.id))
const asset = computed(() => assets.value.find((a) => a.id === id.value))
const isGold = computed(() => asset.value?.kind === 'gold')
const rows = computed(() => series.value[id.value] ?? [])
const months = ref(3),
  index = ref(-1),
  view = ref<'daily' | 'intraday'>('daily'),
  removeDialog = ref<HTMLDialogElement>()
const groups = computed(() => [...new Set(assets.value.map((a) => a.group))])
watch(
  id,
  () => {
    index.value = -1
    view.value = 'daily'
    if (!asset.value) return
    last.value = id.value
    save()
    void history(id.value)
    if (isGold.value) {
      void loadModel()
      void loadIntraday()
    }
  },
  { immediate: true },
)
watch(months, () => {
  index.value = -1
})
const range = computed(() => {
  const end = rows.value.at(-1)
  if (!end) return []
  const start = monthsBefore(end.date, months.value)
  return rows.value.filter((p) => p.date >= start)
})
const cursor = computed(() =>
  index.value >= 0 ? Math.min(index.value, range.value.length - 1) : range.value.length - 1,
)
const current = computed(() => range.value[cursor.value])
const signals = computed(() =>
  range.value.map((p) => signalAtChinaClose(model.value.response?.data ?? [], p.date)),
)
const signal = computed(() => signals.value[cursor.value])
const lines = computed(() => {
  const main = {
    name: isGold.value ? '国内金价' : '单位净值',
    color: 'var(--text)',
    directional: true,
    values: range.value.map((p) => p.value),
  }
  return [
    main,
    isGold.value
      ? {
          name: '目标仓位',
          color: '#bf9443',
          right: true,
          values: signals.value.map((p) => p?.weight ?? null),
        }
      : { name: '60 日波动率', color: '#bf9443', right: true, values: range.value.map((p) => p.volatility) },
  ]
})
const price = computed(() => current.value?.value.toFixed(isGold.value ? 2 : 4) ?? '—')
const dateChange = computed(() => {
  if (!current.value) return null
  const previous = asOf(rows.value, current.value.date, true)
  return previous ? current.value.index / previous.index - 1 : null
})
const fundReturn = computed(() => (current.value ? trailingChange(rows.value, 3, current.value) : null))
const times = computed(() => intraday.value.response?.data.points ?? [])
function pin() {
  focus.value = id.value
  save()
}
async function confirmRemove() {
  removeDialog.value?.close()
  remove(id.value)
  await navigateTo(last.value ? '/asset/' + last.value : '/')
}
</script>
<template>
  <div id="ac-detail-page">
    <div class="ac-detail-layout">
      <aside class="ac-side">
        <div class="ac-side-head">
          <h2>我的关注</h2>
          <button aria-label="添加关注标的" @click="showAdd = true">＋</button>
        </div>
        <nav id="ac-side-assets" aria-label="切换详情标的">
          <div v-for="g in groups" :key="g" class="ac-side-group">
            <h3>{{ g }}</h3>
            <button
              v-for="a in assets.filter((a) => a.group === g)"
              :key="a.id"
              :aria-current="a.id === id"
              @click="navigateTo('/asset/' + a.id)"
            >
              <AssetGlyph :asset="a" />
              <span>
                <b>{{ a.short }}</b>
                <small>{{ a.id }}</small>
              </span>
            </button>
          </div>
        </nav>
      </aside>
      <div v-if="asset" class="ac-detail-main">
        <div class="ac-detail-head">
          <div>
            <p class="ac-ticker">{{ asset.group }}　/　{{ asset.id }}</p>
            <h1>{{ asset.short }}</h1>
            <p v-if="!isGold" class="ac-caption">{{ asset.name }}</p>
          </div>
          <PeriodSelect v-model="months" :options="[1, 3, 6, 12]" />
        </div>
        <section class="ac-analysis">
          <GoldFormula v-if="isGold" :signal="signal" :loading="model.loading" :error="model.error" />
          <section v-else class="ac-model">
            <div class="ac-model-head">
              <div>
                <p class="ac-model-label">观察公式 · 场外基金</p>
                <h2>净值与波动率</h2>
              </div>
              <div class="ac-result">
                <b :class="direction(fundReturn)">{{ percent(fundReturn, true) }}</b>
                <small>近 3 月累计涨跌</small>
              </div>
            </div>
            <p id="ac-equation">区间收益 = 各日（1 ＋ 净值增长率）的连乘积 − 1</p>
            <div id="ac-factors">
              <div class="ac-factor">
                <b>单位净值 {{ price }}</b>
                <small>人民币 / 份</small>
              </div>
              <div class="ac-factor">
                <b :class="direction(dateChange)">日涨跌 {{ percent(dateChange, true) }}</b>
                <small>按披露的净值增长率</small>
              </div>
              <div class="ac-factor">
                <b>波动率 {{ percent(current?.volatility) }}</b>
                <small>60 日样本标准差 × √252</small>
              </div>
            </div>
            <p id="ac-evaluation">净值归属日 {{ current?.date || '—' }} · 按基金披露更新</p>
          </section>
          <div class="ac-trend">
            <div class="ac-trend-head">
              <h2>{{ isGold ? '走势与模型' : '净值走势' }}</h2>
              <div v-if="isGold" class="ac-periods" aria-label="行情类型">
                <button :aria-pressed="view === 'daily'" @click="view = 'daily'">日线</button>
                <button :aria-pressed="view === 'intraday'" @click="view = 'intraday'">延时分时</button>
              </div>
            </div>
            <template v-if="view === 'daily'">
              <div class="ac-readouts">
                <span>
                  <i class="ac-line-key"></i>
                  {{ isGold ? '金价' : '净值' }}
                  <b>{{ price }}</b>
                  　{{ isGold ? '元/克' : '元/份' }}
                </span>
                <span>
                  <i class="ac-line-key model"></i>
                  {{ isGold ? '目标仓位' : '60 日波动率' }}（右轴）
                  <b>{{ percent(isGold ? signal?.weight : current?.volatility) }}</b>
                </span>
              </div>
              <div class="ac-detail-plot">
                <TrendChart
                  :dates="range.map((p) => p.date)"
                  :lines="lines"
                  :cursor="cursor"
                  format="price"
                  :precision="isGold ? 2 : 4"
                  :empty="histories[id]?.loading ? '正在读取历史行情…' : '暂无历史行情'"
                  @select="index = $event"
                />
              </div>
              <input
                v-if="range.length"
                id="ac-crosshair"
                aria-label="查看指定日期的行情与公式"
                type="range"
                :value="cursor"
                min="0"
                :max="range.length - 1"
                @input="index = Number(($event.target as HTMLInputElement).value)"
              />
              <div class="ac-chart-note">
                {{ current?.date || '—' }} · {{ cursor === range.length - 1 ? '最新观测日' : '历史观测日' }}　
                <button v-if="cursor !== range.length - 1" class="ac-text-btn" @click="index = -1">
                  回到最新
                </button>
              </div>
            </template>
            <template v-else>
              <p class="ac-caption">
                上海黄金交易所 · 元/克 · 来源时间 {{ intraday.response?.data.sourceTime || '—' }}
              </p>
              <div class="ac-detail-plot">
                <TrendChart
                  :dates="times.map((p) => p.time)"
                  :lines="[
                    {
                      name: '延时金价',
                      color: 'var(--text)',
                      directional: true,
                      values: times.map((p) => p.value),
                    },
                  ]"
                  format="price"
                  :empty="
                    intraday.loading ? '正在读取延时行情…' : intraday.error || '来源暂无可核实的分时行情'
                  "
                />
              </div>
              <p class="ac-chart-note">仓位按日线计算。夜盘按交易所的交易日归属显示。</p>
            </template>
            <p v-if="histories[id]?.error" class="ac-annotation" role="status">{{ histories[id]?.error }}</p>
            <p v-if="view === 'intraday' && times.length && intraday.error" class="ac-annotation">
              {{ intraday.error }}
            </p>
          </div>
        </section>
        <div class="ac-detail-actions">
          <button class="ac-text-btn ac-pin" :disabled="focus === id" @click="pin">
            {{ focus === id ? '已设为总览焦点' : '设为总览焦点' }}
          </button>
          <button class="ac-text-btn ac-pin" @click="removeDialog?.showModal()">移出关注</button>
        </div>
        <div class="ac-sources ac-source" v-if="isGold">
          国内金价来自
          <a href="https://www.sge.com.cn/sjzx/mrhq" target="_blank" rel="noreferrer">上海黄金交易所</a>
          。仓位采用美元计价的
          <a href="https://www.spdrgoldshares.com/usa/gld/" target="_blank" rel="noreferrer">
            SPDR Gold Shares（GLD）
          </a>
          收盘价和
          <a href="https://fred.stlouisfed.org/series/DGS2" target="_blank" rel="noreferrer">FRED 美国利率</a>
          。策略仓位以分配给这套策略的资金为基数。
        </div>
        <div class="ac-sources ac-source" v-else>
          <a :href="'https://fundf10.eastmoney.com/jjjz_' + id + '.html'" target="_blank" rel="noreferrer">
            天天基金历史净值
          </a>
          · 场外基金按份额披露净值，QDII 净值可能晚于国内交易日公布。横轴按净值归属日展示。
        </div>
      </div>
      <div v-else class="ac-detail-main">
        <h1>此标的未在关注列表中</h1>
        <button class="ac-text-btn" @click="navigateTo('/')">返回总览</button>
      </div>
    </div>
    <dialog ref="removeDialog" class="ac-dialog">
      <div class="ac-dialog-head">
        <h2>移出关注</h2>
        <button aria-label="关闭" class="ac-close" @click="removeDialog?.close()">×</button>
      </div>
      <p>将「{{ asset?.short }}」移出当前关注列表？之后可以再次添加。</p>
      <div class="ac-actions"><button class="ac-primary" @click="confirmRemove">移出关注</button></div>
    </dialog>
  </div>
</template>
