import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Aera Market — Digital Products Marketplace',
  description:
    'Buy and sell premium source code, UI kits, plugins, game assets, and developer tools on Aera Market.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-white`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
