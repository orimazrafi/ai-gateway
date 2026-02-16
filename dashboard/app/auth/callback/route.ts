import { NextRequest, NextResponse } from 'next/server'

/**
 * Google OAuth callback: real Next.js route so redirect_uri can be the dashboard.
 * Receives ?code=... from Google, sends the user to the gateway to exchange and get the token.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const gateway = process.env.GATEWAY_URL || 'http://localhost:3002'
  const gatewayBase = gateway.replace(/\/$/, '')

  if (error) {
    return NextResponse.redirect(`${origin}?error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}?error=no_code`)
  }

  // Send user to gateway; gateway exchanges code (with redirect_uri = this dashboard URL) and redirects to dashboard#token=...
  const callbackUrl = new URL(`${gatewayBase}/auth/callback`)
  callbackUrl.searchParams.set('code', code)
  return NextResponse.redirect(callbackUrl.toString())
}
