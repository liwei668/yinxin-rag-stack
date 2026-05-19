import type { Metadata } from 'next'
import { Providers } from '../src/components/Providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Yinxin.AGI.ai',
  description: '你的任务，交给Yinxin搞定',
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
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.css" />
        <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.4/dist/katex.min.js"></script>
      </head>
      <body className="font-sans antialiased h-full">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}