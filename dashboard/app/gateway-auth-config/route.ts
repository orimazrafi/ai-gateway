import { NextResponse } from 'next/server'

/**
 * Server-side proxy for gateway /auth/config.
 * Lives at /gateway-auth-config so it is NOT caught by the /api/:path* rewrite.
 * Uses GATEWAY_URL at runtime.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
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
