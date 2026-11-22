<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ kind: 'gold' | 'fund' }>()
const canvas = ref<HTMLCanvasElement | null>(null)
let observer: ResizeObserver | undefined
let monitor: MediaQueryList | undefined

type Point = [number, number]
type Ink = string | CanvasGradient
type Brush = CanvasRenderingContext2D

function project(x: number, y: number, z = 0): Point {
  return [(x - y) * 0.94, (x + y) * 0.43 - z]
}

function stroke(ctx: Brush, from: Point, to: Point, ink: string, width = 1) {
  ctx.beginPath()
  ctx.moveTo(...from)
  ctx.lineTo(...to)
  ctx.strokeStyle = ink
  ctx.lineWidth = width
  ctx.stroke()
}

function face(ctx: Brush, points: Point[], fill: Ink, edge: string) {
  ctx.beginPath()
  ctx.moveTo(...points[0]!)
  for (const point of points.slice(1)) ctx.lineTo(...point)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = edge
  ctx.lineWidth = 0.7
  ctx.stroke()
}

function gradient(ctx: Brush, from: Point, to: Point, stops: [number, string][]) {
  const result = ctx.createLinearGradient(...from, ...to)
  for (const [at, color] of stops) result.addColorStop(at, color)
  return result
}

function ground(ctx: Brush) {
  for (let i = -180; i <= 180; i += 18) {
    stroke(ctx, project(i, -180), project(i, 180), '#d3e9bb14', 0.65)
    stroke(ctx, project(-180, i), project(180, i), '#d3e9bb14', 0.65)
  }
  ctx.save()
  ctx.scale(1, 0.42)
  const shade = ctx.createRadialGradient(0, 8, 10, 0, 8, 100)
  shade.addColorStop(0, '#061b13a8')
  shade.addColorStop(1, '#061b1300')
  ctx.fillStyle = shade
  ctx.fillRect(-101, -93, 202, 202)
  ctx.restore()
}

function ingot(ctx: Brush, y: number, z: number) {
  // Each cast bar has a smaller upper face so the stacked tiers remain distinct.
  const uv = (x: number, v: number, h: number) => project(x, y + v, z + h)
  const top = [uv(-36, -8, 14), uv(36, -8, 14), uv(36, 8, 14), uv(-36, 8, 14)]
  const broad = gradient(ctx, uv(-40, 11, 14), uv(40, 11, 0), [
    [0, '#d9ad58'],
    [0.4, '#ebc773'],
    [0.72, '#ad7833'],
    [1, '#bd913e'],
  ])
  const sheen = gradient(ctx, top[0]!, top[2]!, [
    [0, '#e6c575'],
    [0.38, '#fff1ad'],
    [0.65, '#f3d788'],
    [1, '#d5a94e'],
  ])
  face(ctx, [top[2]!, top[3]!, uv(-40, 11, 0), uv(40, 11, 0)], broad, '#a58543')
  face(ctx, [top[1]!, top[2]!, uv(40, 11, 0), uv(40, -11, 0)], '#956d31', '#b89a51')
  face(ctx, top, sheen, '#f8e9aa')
  stroke(ctx, uv(-34, 7.7, 14), uv(34, 7.7, 14), '#fff3c5', 1)
  // The mint mark and two inset lines are stamped into the top face.
  face(ctx, [uv(-16, -4, 14), uv(-11, 0, 14), uv(-16, 4, 14), uv(-21, 0, 14)], '#d1ad5d', '#b79856')
  stroke(ctx, uv(-5, -2, 14), uv(17, -2, 14), '#ad934d', 1)
  stroke(ctx, uv(-5, 2, 14), uv(9, 2, 14), '#c0a456', 0.85)
}

function gold(ctx: Brush) {
  // Rendering rear to front at each tier preserves the isometric overlap.
  for (let tier = 0; tier < 3; tier++) {
    const count = 3 - tier
    for (let i = 0; i < count; i++) {
      ingot(ctx, (i - (count - 1) / 2) * 23, tier * 14)
    }
  }
}

function compass(ctx: Brush) {
  ctx.save()
  ctx.scale(1, 0.58)
  function disk(y: number, radius: number, color: Ink) {
    ctx.beginPath()
    ctx.arc(0, y, radius, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }
  for (let y = 8; y >= 0; y -= 1) disk(y, 66, y === 7 ? '#c9c993' : '#79875e')
  disk(
    0,
    66,
    gradient(
      ctx,
      [-52, -39],
      [57, 38],
      [
        [0, '#dce3a5'],
        [0.53, '#99ad76'],
        [1, '#dfdb99'],
      ],
    ),
  )
  disk(0, 62.5, '#264c3e')
  disk(0, 53, '#315a47')
  for (let i = 0; i < 48; i++) {
    const angle = (Math.PI * i) / 24
    const inner = i % 4 === 0 ? 53 : 58
    stroke(
      ctx,
      [inner * Math.cos(angle), inner * Math.sin(angle)],
      [60 * Math.cos(angle), 60 * Math.sin(angle)],
      '#c6d49a',
      1,
    )
  }
  ctx.rotate(0.48)
  face(
    ctx,
    [
      [0, -51],
      [10, 1],
      [0, -2],
    ],
    '#faf0ac',
    '#ebdfa5',
  )
  face(
    ctx,
    [
      [0, -51],
      [0, -2],
      [-10, 1],
    ],
    '#b8c779',
    '#c5d28b',
  )
  face(
    ctx,
    [
      [0, 50],
      [-10, 1],
      [0, -2],
    ],
    '#c0cfb1',
    '#c1cdad',
  )
  face(
    ctx,
    [
      [0, 50],
      [0, -2],
      [10, 1],
    ],
    '#729783',
    '#8eab94',
  )
  disk(0, 4, '#dedda0')
  ctx.restore()
}

function paint() {
  const element = canvas.value
  const ctx = element?.getContext('2d')
  if (!element || !ctx) return
  const { width, height } = element.getBoundingClientRect()
  if (!width || !height) return
  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  element.width = Math.round(width * dpr)
  element.height = Math.round(height * dpr)
  ctx.setTransform(element.width / width, 0, 0, element.height / height, 0, 0)
  const scale = Math.min(width / 208, height / 99)
  ctx.translate(width * 0.5, height * (props.kind === 'gold' ? 0.61 : 0.5))
  ctx.scale(scale, scale)
  ctx.lineJoin = 'round'
  ground(ctx)
  if (props.kind === 'gold') gold(ctx)
  else compass(ctx)
}

function watchResolution() {
  monitor?.removeEventListener('change', watchResolution)
  monitor = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
  monitor.addEventListener('change', watchResolution)
  paint()
}

onMounted(() => {
  observer = new ResizeObserver(paint)
  if (canvas.value) observer.observe(canvas.value)
  watchResolution()
})
watch(() => props.kind, paint, { flush: 'post' })
onBeforeUnmount(() => {
  observer?.disconnect()
  monitor?.removeEventListener('change', watchResolution)
})
</script>

<template>
  <canvas ref="canvas" class="focus-artwork" aria-hidden="true" />
</template>

<style scoped>
.focus-artwork {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
