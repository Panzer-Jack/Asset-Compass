export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/main.css'],
  nitro: { preset: 'node-server', rollupConfig: { external: ['node:sqlite'] } },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '资产罗盘 · Asset Compass',
      meta: [{ name: 'theme-color', content: '#194b38' }],
    },
  },
})
