import { NextRequest, NextResponse } from 'next/server'

/**
 * Handle /gateway-auth-config (and /ping) in middleware so they work even if
 * App Router route handlers are not included in the deployment (e.g. cached build).
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname === '/gateway-auth-config') {
    const gateway = process.env.GATEWAY_URL || 'http://localhost:3002'
    const base = gateway.replace(/\/$/, '')
    try {
      const res = await fetch(`${base}/auth/config`, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      })
      const data = await res.json().catch(() => ({ ssoEnabled: false, loginUrl: null }))
      return NextResponse.json(data)
    } catch (e) {
      console.error('Gateway /auth/config proxy error:', e)
      return NextResponse.json({ ssoEnabled: false, loginUrl: null })
    }
  }

  if (pathname === '/ping') {
    return NextResponse.json({
      ok: true,
      message: 'Dashboard route is live',
      ts: Date.now(),
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/gateway-auth-config', '/ping'],
}
