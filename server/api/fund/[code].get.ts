import { resolveFundName } from '../../utils/domestic-sources'
import { snapshot } from '../../utils/cache'
export default defineEventHandler((event) => {
  const code = getRouterParam(event, 'code') ?? ''
  if (!/^\d{6}$/.test(code)) throw createError({ statusCode: 400, statusMessage: 'Invalid fund code' })
  return snapshot('name:' + code, 7 * 86400000, false, () => resolveFundName(code))
})
