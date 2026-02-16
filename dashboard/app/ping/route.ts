import { NextResponse } from 'next/server'

/** Simple ping so you can verify the deployment has new routes (e.g. /gateway-auth-config). */
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'Dashboard route is live',
    ts: Date.now(),
  })
}
