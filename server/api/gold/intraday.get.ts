import { loadSpotIntraday } from '../../utils/domestic-sources'
import { snapshot } from '../../utils/cache'

export default defineEventHandler((event) =>
  snapshot('intraday:Au99.99', 60000, getQuery(event).refresh === '1', loadSpotIntraday),
)
