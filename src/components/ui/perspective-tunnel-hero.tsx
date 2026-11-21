'use client'

import {
  motion,
  useTransform,
  useReducedMotion,
  useMotionValue,
  useSpring,
  type MotionValue,
} from 'framer-motion'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

const IMAGES = [
  { src: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80', title: 'Source Code' },
  { src: 'https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=800&auto=format&fit=crop&q=80', title: 'UI Kits' },
  { src: 'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&auto=format&fit=crop&q=80', title: 'React Kits' },
  { src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80', title: '3D Assets' },
  { src: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&auto=format&fit=crop&q=80', title: 'Dev Tools' },
  { src: 'https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=800&auto=format&fit=crop&q=80', title: 'Design Packs' },
  { src: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80', title: 'AI Toolkits' },
  { src: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80', title: 'Game Assets' },
  { src: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80', title: 'Retro Packs' },
]

interface TunnelCardData {
  item: { src: string; title: string }
  angleCos: number
  angleSin: number
  radiusFactorX: number
  radiusFactorY: number
  rotationZ: number
  index: number
}

const TUNNEL_CARDS: TunnelCardData[] = IMAGES.map((item, i) => {
  const goldenAngle = i * 137.5 * (Math.PI / 180)
  const radiusFactorX = 0.28 + (i % 3) * 0.08
  const radiusFactorY = 0.26 + (i % 2) * 0.09
  return {
    item,
    angleCos: Math.cos(goldenAngle),
    angleSin: Math.sin(goldenAngle),
    radiusFactorX,
    radiusFactorY,
    rotationZ: (i % 2 === 0 ? 1 : -1) * (3 + (i % 5) * 2),
    index: i,
  }
})

const SPRING_CONFIG = { stiffness: 60, damping: 25, mass: 0.5 }

interface StageDimensions {
  width: number
  height: number
  isMobile: boolean
}

function useCameraParallax(enabled: boolean) {
  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const x = useSpring(rawX, SPRING_CONFIG)
  const y = useSpring(rawY, SPRING_CONFIG)

  useEffect(() => {
    if (!enabled) return
    const onMove = (e: PointerEvent) => {
      rawX.set((e.clientX / window.innerWidth - 0.5) * 2)
      rawY.set((e.clientY / window.innerHeight - 0.5) * 2)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [enabled, rawX, rawY])

  return { x, y }
}

interface TunnelCardProps {
  card: TunnelCardData
  progress: MotionValue<number>
  pointer: { x: MotionValue<number>; y: MotionValue<number> }
  total: number
  stage: StageDimensions
}

function TunnelCard({ card, progress, pointer, total, stage }: TunnelCardProps) {
  const staggerSpan = 0.55
  const start = (card.index / total) * (1 - staggerSpan)
  const end = start + staggerSpan
  const localProgress = useTransform(progress, [start, end], [0, 1])
  const farZ = stage.isMobile ? -1200 : -1700
  const nearZ = stage.isMobile ? 350 : 500
  const z = useTransform(localProgress, [0, 1], [farZ, nearZ])
  const opacity = useTransform(localProgress, [0, 0.18, 0.82, 0.98], [0, 1, 1, 0])

  const cardWidth = stage.isMobile
    ? Math.max(130, Math.min(180, stage.width * 0.38))
    : Math.max(180, Math.min(270, stage.width * 0.18))

  const baseX = card.angleCos * (stage.width * card.radiusFactorX)
  const baseY = card.angleSin * (stage.height * card.radiusFactorY)
  const panStrength = stage.isMobile ? 20 : 45

  const transform = useTransform(
    [z, pointer.x, pointer.y],
    ([currZ, px, py]: number[]) => {
      const offsetX = baseX - px * panStrength
      const offsetY = baseY - py * panStrength
      return `translate3d(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px), ${currZ}px) rotateZ(${card.rotationZ}deg)`
    },
  )

  return (
    <motion.div
      style={{ width: cardWidth, transform, opacity, zIndex: card.index + 1 }}
      className="pointer-events-auto absolute left-1/2 top-1/2 aspect-[4/5] will-change-transform select-none cursor-pointer"
    >
      <div className="group relative h-full w-full overflow-hidden rounded-2xl bg-neutral-200 dark:bg-neutral-900 shadow-2xl shadow-neutral-950/20 dark:shadow-black/90 ring-1 ring-black/10 dark:ring-white/15 transition-all duration-500 hover:ring-indigo-500/70 dark:hover:ring-indigo-400/70 hover:shadow-indigo-500/25">
        <img
          src={card.item.src}
          alt={card.item.title}
          draggable={false}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent flex items-end p-4 sm:p-5">
          <span className="text-xs sm:text-sm font-mono tracking-widest uppercase text-white/95 drop-shadow-md">
            {card.item.title}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

export default function PerspectiveTunnelHero() {
  const containerRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<StageDimensions>({ width: 1440, height: 900, isMobile: false })

  useEffect(() => {
    const updateDimensions = () => {
      setStage({ width: window.innerWidth, height: window.innerHeight, isMobile: window.innerWidth < 768 })
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  const rawProgress = useMotionValue(0)
  const smoothProgress = useSpring(rawProgress, { stiffness: 80, damping: 30, restDelta: 0.0001 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      const current = rawProgress.get()
      // Release scroll once tunnel is complete (or when scrolling up at the top)
      if (current >= 1 && e.deltaY > 0) return
      if (current <= 0 && e.deltaY < 0) return
      e.preventDefault()
      const delta = e.deltaY * 0.0008
      rawProgress.set(Math.min(1, Math.max(0, current + delta)))
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [rawProgress])

  const pointer = useCameraParallax(!reduce)

  const titleScale = useTransform(smoothProgress, [0, 0.5, 1], [0.7, 1, 1.35])
  const titleOpacity = useTransform(smoothProgress, [0, 0.12, 0.85, 1], [0.25, 1, 1, 0])
  const promptOpacity = useTransform(smoothProgress, [0, 0.12], [1, 0])
  const ctaOpacity = useTransform(smoothProgress, [0.85, 1], [0, 1])
  const ctaY = useTransform(smoothProgress, [0.85, 1], [20, 0])

  return (
    <div
      ref={containerRef}
      className="relative h-[100svh] w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-white select-none flex items-center justify-center"
      style={{ perspective: stage.isMobile ? '900px' : '1200px', transformStyle: 'preserve-3d' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e1b4b_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_60%,transparent_100%)] opacity-70 dark:opacity-65" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15)_0%,transparent_70%)] dark:bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.2)_0%,transparent_75%)]" />
      <div className="pointer-events-none absolute h-[48vmin] w-[48vmin] rounded-full border border-indigo-500/15 dark:border-indigo-400/10" />
      <div className="pointer-events-none absolute h-[76vmin] w-[76vmin] rounded-full border border-dashed border-neutral-300/60 dark:border-white/10" />

      <motion.div
        style={{ scale: titleScale, opacity: titleOpacity }}
        className="pointer-events-none z-0 flex flex-col items-center text-center px-6 max-w-2xl"
      >
        <p className="text-xs font-mono uppercase tracking-[0.4em] text-indigo-600 dark:text-indigo-400 mb-4 inline-flex items-center gap-2">
          <Sparkles className="h-3 w-3" /> Aera Market
        </p>
        <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tighter leading-[0.9] bg-gradient-to-b from-neutral-950 via-neutral-800 to-neutral-400 dark:from-white dark:via-white dark:to-white/40 bg-clip-text text-transparent">
          BUILD. SELL.
          <br />
          SHIP DIGITAL.
        </h1>
        <p className="mt-4 max-w-[42ch] text-sm sm:text-base font-light text-neutral-600 dark:text-neutral-400">
          The premium marketplace for developers, designers, and creators to sell source code, UI kits, plugins, and digital assets.
        </p>
      </motion.div>

      <motion.div
        style={{ opacity: promptOpacity }}
        className="pointer-events-none absolute bottom-8 z-20 flex flex-col items-center gap-2 text-xs font-mono uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-400"
      >
        <span>Scroll to Explore</span>
        <div className="h-6 w-px bg-gradient-to-b from-indigo-500 to-transparent" />
      </motion.div>

      <div className="absolute inset-0 pointer-events-none" style={{ transformStyle: 'preserve-3d' }}>
        {TUNNEL_CARDS.map((card, i) => (
          <TunnelCard key={i} card={card} progress={smoothProgress} pointer={pointer} total={TUNNEL_CARDS.length} stage={stage} />
        ))}
      </div>

      {/* CTA appears at end of tunnel */}
      <motion.div
        style={{ opacity: ctaOpacity, y: ctaY }}
        className="pointer-events-none absolute inset-x-0 bottom-16 z-30 flex flex-col items-center gap-4 px-6"
      >
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/explore">
              Explore Products <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-full backdrop-blur">
            <Link href="/register">Become a Seller</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
