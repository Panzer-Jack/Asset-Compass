import { goldModel } from '../../utils/market-feeds'
export default defineEventHandler((event) => goldModel(getQuery(event).refresh === '1'))
