import type { Session } from 'electron'

/** True when the renderer is served by the Vite dev server (electron-vite dev). */
export function isDevRenderer(): boolean {
  return Boolean(process.env['ELECTRON_RENDERER_URL'])
}

export function buildContentSecurityPolicy(dev: boolean): string {
  const scriptSrc = dev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'"
  const connectSrc = dev
    ? "connect-src 'self' ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*"
    : "connect-src 'self'"

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    "font-src 'self'",
    connectSrc,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ')
}

export function installContentSecurityPolicy(session: Session, dev: boolean): void {
  const policy = buildContentSecurityPolicy(dev)
  session.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('devtools://')) {
      callback({ responseHeaders: details.responseHeaders })
      return
    }
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    })
  })
}
