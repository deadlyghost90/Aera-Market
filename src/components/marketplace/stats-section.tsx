'use client'

import { motion, useInView, animate } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const STATS = [
  { value: 25000, suffix: '+', label: 'Digital products listed' },
  { value: 8000, suffix: '+', label: 'Active creators & sellers' },
  { value: 120000, suffix: '+', label: 'Secure downloads delivered' },
  { value: 99.9, suffix: '%', label: 'Order fulfillment uptime' },
]

function CountUp({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!inView) return
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    return () => controls.stop()
  }, [inView, value])

  const formatted = value >= 1000 ? Math.round(display).toLocaleString() : display.toFixed(1)

  return (
    <span ref={ref}>
      {formatted}{suffix}
    </span>
  )
}

export default function StatsSection() {
  return (
    <section className="relative w-full overflow-hidden bg-neutral-100 py-20 dark:bg-neutral-900 sm:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(99,102,241,0.10),transparent_60%)]" />

      <div className="relative mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-xs font-mono uppercase tracking-[0.4em] text-indigo-600 dark:text-indigo-400">
            Growing Every Day
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            A marketplace built for scale
          </h2>
        </motion.div>

        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-2xl border border-black/10 bg-white/70 p-5 text-center backdrop-blur dark:border-white/10 dark:bg-white/[0.03]"
            >
              <p className="text-2xl font-bold tracking-tight sm:text-3xl">
                <CountUp value={s.value} suffix={s.suffix} />
              </p>
              <p className="mt-1 text-xs text-neutral-500 sm:text-sm dark:text-neutral-400">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
