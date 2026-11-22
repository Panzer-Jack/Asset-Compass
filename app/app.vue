<script setup lang="ts">
const { assets, focus, last, initialize, refresh, loadModel, loadIntraday, histories, showAdd } = useCompass()
const route = useRoute()
const refreshing = ref(false),
  ready = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
async function update(force: boolean) {
  if (refreshing.value) return
  refreshing.value = true
  try {
    const work: Promise<unknown>[] = [refresh(force)]
    if (route.params.id === 'Au99.99') work.push(loadModel(force), loadIntraday(force))
    await Promise.allSettled(work)
  } finally {
    refreshing.value = false
  }
}
function onVisible() {
  if (document.visibilityState === 'visible') void update(false)
}
onMounted(() => {
  initialize()
  ready.value = true
  void update(false)
  timer = setInterval(onVisible, 60000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})
const latest = computed(() =>
  assets.value
    .map((a) => histories.value[a.id]?.response?.data.at(-1)?.date ?? '')
    .sort()
    .at(-1),
)
</script>
<template>
  <div id="asset-compass">
    <header class="ac-header">
      <div class="ac-bar">
        <NuxtLink to="/" class="ac-brand">
          <span class="ac-logo" aria-hidden="true"></span>
          Asset Compass
        </NuxtLink>
        <nav class="ac-nav" aria-label="主导航">
          <NuxtLink to="/" :class="{ 'ac-nav-current': route.path === '/' }">总览</NuxtLink>
          <NuxtLink
            v-if="last || focus"
            :to="'/asset/' + (last || focus)"
            :class="{ 'ac-nav-current': route.path.startsWith('/asset/') }"
          >
            详情
          </NuxtLink>
          <button v-else @click="showAdd = true">详情</button>
        </nav>
        <div class="ac-snapshot">
          <i class="ac-status-dot"></i>
          本地观察台
          <span v-if="latest" class="ac-stamp">最新行情 {{ latest }}</span>
          <button class="ac-status-button" :disabled="refreshing" @click="update(true)">
            {{ refreshing ? '读取中…' : '↻ 刷新' }}
          </button>
        </div>
      </div>
    </header>
    <main v-if="ready" class="ac-main"><NuxtPage /></main>
    <AddAsset />
  </div>
</template>
