<script setup lang="ts">
defineProps<{ options: number[] }>()
const selected = defineModel<number>({ required: true })
</script>
<template>
  <div class="ac-periods" aria-label="时间范围">
    <button v-for="n in options" :key="n" type="button" :aria-pressed="selected === n" @click="selected = n">
      {{ n === 12 ? '1 年' : n + ' 月' }}
    </button>
  </div>
</template>
