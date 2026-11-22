import { initialAssets } from '../../shared/market'
import { dailyPrices, goldModel } from '../utils/market-feeds'

// While the personal server is running, keep the default daily series warm even
// with the browser closed. Additional instruments refresh when their watchlist is open.
export default defineNitroPlugin((nitro) => {
  const refresh = () => Promise.allSettled([...initialAssets.map((a) => dailyPrices(a.id)), goldModel()])
  const first = setTimeout(refresh, 1500)
  const timer = setInterval(refresh, 60 * 60 * 1000)
  first.unref()
  timer.unref()
  nitro.hooks.hook('close', () => {
    clearTimeout(first)
    clearInterval(timer)
  })
})
