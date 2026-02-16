import { NextResponse } from 'next/server'

/**
 * Server-side proxy for gateway /auth/config.
 * Uses GATEWAY_URL at runtime so auth config works even if rewrites were built without it.
 */
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
