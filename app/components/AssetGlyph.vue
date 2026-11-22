<script setup lang="ts">
import type { Asset } from '~~/shared/market'
defineProps<{ asset: Asset }>()
</script>
<template>
  <span aria-hidden="true" class="ac-glyph" :class="asset.kind">
    {{ asset.kind === 'gold' ? 'Au' : 'ƒ' }}
  </span>
</template>
