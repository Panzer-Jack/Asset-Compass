import { execFileSync } from 'node:child_process'
import { fetch, ProxyAgent } from 'undici'

interface DownloadOptions {
  international?: boolean
  headers?: Record<string, string>
  body?: string
}
let overseasAgent: ProxyAgent | null | undefined
function proxyAgent() {
  if (overseasAgent !== undefined) return overseasAgent ?? undefined
  let proxy = process.env.ASSET_COMPASS_PROXY ?? process.env.HTTPS_PROXY ?? process.env.https_proxy
  if (proxy === undefined && process.platform === 'darwin') {
    try {
      const config = execFileSync('/usr/sbin/scutil', ['--proxy'], { encoding: 'utf8', timeout: 1500 })
      const host = config.match(/HTTPSProxy\s*:\s*([^\s]+)/)?.[1]
      const port = config.match(/HTTPSPort\s*:\s*(\d+)/)?.[1]
      if (/HTTPSEnable\s*:\s*1/.test(config) && host && port) proxy = 'http://' + host + ':' + port
    } catch {
      /* Direct access when no system proxy is available. */
    }
  }
  overseasAgent = proxy ? new ProxyAgent(proxy) : null
  return overseasAgent ?? undefined
}
export async function download(url: string, options: DownloadOptions = {}): Promise<Uint8Array> {
  const dispatcher = options.international ? proxyAgent() : undefined
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(url, {
        method: options.body === undefined ? 'GET' : 'POST',
        body: options.body,
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
          ...(options.body === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded' }),
          ...options.headers,
        },
        dispatcher,
        signal: AbortSignal.timeout(30000),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw new Error('来源返回 HTTP ' + response.status)
      }
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
}
