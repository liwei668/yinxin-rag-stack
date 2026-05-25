import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Providers } from '../src/components/Providers'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Yinxin.AGI',
  description: '你的任务，交给Yinxin搞定',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Yinxin.AGI',
    statusBarStyle: 'default',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <meta name="theme-color" content="#10b981" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.css" />
      </head>
      <body className="font-sans antialiased h-full">
        <Providers>
          {children}
        </Providers>
        <Script
          src="https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  )
}
