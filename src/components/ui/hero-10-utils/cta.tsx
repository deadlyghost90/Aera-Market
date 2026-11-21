'use client'

import Link from 'next/link'
import { Button, type ButtonProps } from '@/components/ui/button'

export interface CtaProps {
  ctaEnabled?: boolean
  text: string
  link: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
}

export function Cta({ cta }: { cta: CtaProps }) {
  if (!cta.ctaEnabled) return null

  return (
    <Button asChild variant={cta.variant ?? 'default'} size={cta.size ?? 'default'}>
      <Link href={cta.link}>{cta.text}</Link>
    </Button>
  )
}
