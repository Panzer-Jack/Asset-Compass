<script setup lang="ts">
import { domesticGold, funds, type Asset } from '~~/shared/market'
const { assets, add, showAdd } = useCompass()
const code = ref(''),
  name = ref(''),
  group = ref(''),
  busy = ref(false),
  message = ref(''),
  dialog = ref<HTMLDialogElement>()
watch(showAdd, async (open) => {
  if (open) {
    code.value = ''
    name.value = ''
    group.value = ''
    message.value = ''
    await nextTick()
    dialog.value?.showModal()
  } else dialog.value?.close()
})
async function submit(asset?: Asset) {
  if (busy.value) return
  const id = code.value.trim(),
    known = funds.find((f) => f.id === id)
  const selected = asset ||
    known || {
      kind: 'fund' as const,
      id,
      short: name.value.trim(),
      name: name.value.trim(),
      group: group.value.trim() || '场外基金',
    }
  if (!asset && !/^\d{6}$/.test(id)) {
    message.value = '请输入六位基金代码。'
    return
  }
  if (assets.value.some((a) => a.id === selected.id)) {
    message.value = '这个标的已在关注列表中。'
    return
  }
  busy.value = true
  message.value = '正在核验历史数据…'
  try {
    if (!asset && !known) {
      const lookup = await $fetch<{ data: string }>('/api/fund/' + id, { retry: 0 }).catch(() => {
        throw new Error('未能核验基金名称，请核对代码或稍后重试。')
      })
      selected.name = lookup.data
      if (!selected.short) selected.short = lookup.data
    }
    await add(selected)
    showAdd.value = false
  } catch (error) {
    message.value = error instanceof Error ? error.message : '添加失败，请稍后重试。'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <dialog ref="dialog" class="ac-dialog" aria-labelledby="add-title" @close="showAdd = false">
    <div class="ac-dialog-head">
      <h2 id="add-title">添加关注标的</h2>
      <button class="ac-close" aria-label="关闭" @click="showAdd = false">×</button>
    </div>
    <button
      v-for="a in [domesticGold, ...funds]"
      :key="a.id"
      class="ac-preset"
      :disabled="busy || assets.some((x) => x.id === a.id)"
      @click="submit(a)"
    >
      {{ a.name }} · {{ a.id }} {{ assets.some((x) => x.id === a.id) ? '✓' : '＋' }}
    </button>
    <form class="ac-fields" @submit.prevent="submit()">
      <h3>自定义场外基金</h3>
      <label>
        基金代码
        <input
          v-model="code"
          placeholder="六位代码"
          inputmode="numeric"
          maxlength="6"
          required
          pattern="[0-9]{6}"
        />
      </label>
      <label>
        显示简称（选填）
        <input v-model="name" maxlength="48" placeholder="默认使用基金名称" />
      </label>
      <label>
        分组
        <input v-model="group" maxlength="16" placeholder="场外基金" />
      </label>
      <p role="status">{{ message }}</p>
      <button type="submit" class="ac-primary" :disabled="busy">
        {{ busy ? '正在核验…' : '添加到关注' }}
      </button>
    </form>
  </dialog>
</template>
