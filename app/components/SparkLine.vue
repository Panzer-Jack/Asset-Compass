<script setup lang="ts">
const props = defineProps<{ values: number[] }>()
const path = computed(() => {
  const min = Math.min(...props.values),
    span = Math.max(...props.values) - min
  return props.values
    .map(
      (v, i) =>
        (i ? 'L' : 'M') +
        (2 + (88 * i) / Math.max(1, props.values.length - 1)).toFixed(1) +
        ' ' +
        (span ? 24 - ((v - min) / span) * 21 : 13).toFixed(1),
    )
    .join(' ')
})
</script>
<template>
  <svg v-if="values.length" class="ac-spark" viewBox="0 0 92 26" aria-hidden="true">
    <path
      :d="path"
      fill="none"
      :stroke="values.at(-1)! >= values[0]! ? 'var(--up)' : 'var(--down)'"
      stroke-width="1.7"
      stroke-linejoin="round"
    />
  </svg>
  <span v-else>—</span>
</template>
