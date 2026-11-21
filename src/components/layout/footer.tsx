'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Sparkles, Github, Twitter } from 'lucide-react'

const COLS = [
  {
    title: 'Marketplace',
    links: [
      { href: '/explore', label: 'Explore' },
      { href: '/categories', label: 'Categories' },
      { href: '/featured', label: 'Featured' },
    ],
  },
  {
    title: 'Sell',
    links: [
      { href: '/register?role=seller', label: 'Become a Seller' },
      { href: '/seller/guide', label: 'Seller Guide' },
      { href: '/seller/fees', label: 'Fees & Payouts' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/login', label: 'Login' },
      { href: '/register', label: 'Sign Up' },
      { href: '/account', label: 'My Account' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/contact', label: 'Contact' },
      { href: '/legal', label: 'Legal' },
    ],
  },
]

export default function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6 }}
      className="w-full border-t border-black/5 bg-white dark:border-white/5 dark:bg-neutral-950"
    >
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-6">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="text-base font-semibold tracking-tight">Aera Market</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-neutral-600 dark:text-neutral-400">
              A professional multi-vendor marketplace for digital products, operated by Aera Intelligence.
            </p>
            <div className="mt-5 flex items-center gap-2">
              <a href="#" aria-label="Twitter" className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-neutral-600 transition hover:bg-black/5 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10">
                <Twitter className="h-3.5 w-3.5" />
              </a>
              <a href="#" aria-label="GitHub" className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 text-neutral-600 transition hover:bg-black/5 dark:border-white/10 dark:text-neutral-300 dark:hover:bg-white/10">
                <Github className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>

          {COLS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {col.title}
              </p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="text-sm text-neutral-700 transition hover:text-indigo-600 dark:text-neutral-300 dark:hover:text-indigo-400"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-black/5 pt-6 text-xs text-neutral-500 sm:flex-row dark:border-white/5 dark:text-neutral-400">
          <p>© {new Date().getFullYear()} Aera Intelligence (Pvt) Ltd. All rights reserved.</p>
          <p className="flex items-center gap-3">
            <Link href="/legal/privacy" className="hover:text-indigo-600 dark:hover:text-indigo-400">Privacy</Link>
            <Link href="/legal/terms" className="hover:text-indigo-600 dark:hover:text-indigo-400">Terms</Link>
          </p>
        </div>
      </div>
    </motion.footer>
  )
}
