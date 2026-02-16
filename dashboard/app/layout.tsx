import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Gateway Chat',
  description: 'Chat dashboard for AI Gateway',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
