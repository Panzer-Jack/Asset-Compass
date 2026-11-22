import { domesticGold } from '../../../shared/market'
import { dailyPrices } from '../../utils/market-feeds'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') ?? ''
  if (id !== domesticGold.id && !/^\d{6}$/.test(id))
    throw createError({ statusCode: 400, statusMessage: 'Invalid instrument' })
  return dailyPrices(id, getQuery(event).refresh === '1')
})
