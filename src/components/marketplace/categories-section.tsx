'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Code2, LayoutTemplate, Palette, Terminal, Puzzle, Plug,
  Gamepad2, Image as ImageIcon, BookOpen, ArrowUpRight,
} from 'lucide-react'

const CATEGORIES = [
  { label: 'Source Code & Projects', icon: Code2, accent: 'from-blue-500/20 to-cyan-500/20', iconColor: 'text-blue-500' },
  { label: 'Website Templates', icon: LayoutTemplate, accent: 'from-violet-500/20 to-purple-500/20', iconColor: 'text-violet-500' },
  { label: 'UI Kits & Design', icon: Palette, accent: 'from-pink-500/20 to-rose-500/20', iconColor: 'text-pink-500' },
  { label: 'Scripts & Automation', icon: Terminal, accent: 'from-emerald-500/20 to-teal-500/20', iconColor: 'text-emerald-500' },
  { label: 'Plugins & Extensions', icon: Puzzle, accent: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-500' },
  { label: 'APIs & Dev Tools', icon: Plug, accent: 'from-indigo-500/20 to-blue-500/20', iconColor: 'text-indigo-500' },
  { label: 'Game Dev Assets', icon: Gamepad2, accent: 'from-red-500/20 to-pink-500/20', iconColor: 'text-red-500' },
  { label: 'Graphics & Digital', icon: ImageIcon, accent: 'from-fuchsia-500/20 to-purple-500/20', iconColor: 'text-fuchsia-500' },
  { label: 'Documentation', icon: BookOpen, accent: 'from-sky-500/20 to-cyan-500/20', iconColor: 'text-sky-500' },
]

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}

const item = {
  hidden: { opacity: 0, y: 20, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
}

export default function CategoriesSection() {
  return (
    <section className="relative w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.10),transparent_60%)]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-xs font-mono uppercase tracking-[0.4em] text-indigo-600 dark:text-indigo-400">
            Browse the Marketplace
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Curated categories for every{' '}
            <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
              digital creator
            </span>
          </h2>
          <p className="mt-4 text-sm text-neutral-600 sm:text-base dark:text-neutral-400">
            From production-ready source code to UI kits, plugins, and game assets — discover exactly what you need, faster.
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon
            return (
              <motion.div key={cat.label} variants={item}>
                <Link
                  href="/explore"
                  className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-black/10 bg-white/70 p-5 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-indigo-400/40"
                >
                  <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${cat.accent} opacity-0 transition-opacity duration-300 group-hover:opacity-100`} />
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-neutral-100 dark:bg-white/5">
                    <Icon className={`h-5 w-5 ${cat.iconColor}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{cat.label}</p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      Explore products
                    </p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-500" />
                </Link>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
