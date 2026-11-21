import Header from '@/components/layout/header'
import Footer from '@/components/layout/footer'
import PerspectiveTunnelHero from '@/components/ui/perspective-tunnel-hero'
import { Hero10 } from '@/components/ui/hero-10'
import CategoriesSection from '@/components/marketplace/categories-section'
import StatsSection from '@/components/marketplace/stats-section'

const PRODUCT_IMAGES_A = [
  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618477388954-7852f32655ec?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=800&auto=format&fit=crop&q=80',
]

const PRODUCT_IMAGES_B = [
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1614624532983-4ce03382d63d?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80',
]

const PRODUCT_IMAGES_C = [
  'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1642132652860-471b4228023e?w=800&auto=format&fit=crop&q=80',
]

export default function HomePage() {
  return (
    <main className="relative">
      <Header />

      {/* 1. HERO — Perspective tunnel */}
      <PerspectiveTunnelHero />

      {/* 2. FEATURES — Hero10 instance */}
      <Hero10
        title="Why creators choose"
        titleHighlight="Aera Market"
        description="A marketplace engineered for developers, designers, and digital studios — with secure delivery, fast payouts, and a global audience of tech buyers."
        socialProof="Trusted by 8,000+ creators in 40+ countries"
        images={PRODUCT_IMAGES_A}
        imageAlts={['Source code preview', 'UI kit showcase', 'React templates']}
        animation="subtle"
        primaryCTA={{ ctaEnabled: true, text: 'Explore Products', link: '/explore', size: 'lg' }}
        secondaryCTA={{ ctaEnabled: true, text: 'Become a Seller', link: '/register?role=seller', size: 'lg' }}
      />

      {/* 3. CATEGORIES — custom grid */}
      <CategoriesSection />

      {/* 4. HOW IT WORKS — Hero10 instance */}
      <Hero10
        title="Launch your product in"
        titleHighlight="three simple steps"
        description="Upload your files, set your price, and start earning. We handle secure delivery, payments, buyer support, and payouts — so you can focus on building."
        images={PRODUCT_IMAGES_B}
        imageAlts={['Upload process', 'Pricing dashboard', 'Analytics view']}
        animation="subtle"
        variant="standard"
        primaryCTA={{ ctaEnabled: true, text: 'Start Selling', link: '/register?role=seller', size: 'lg' }}
        secondaryCTA={{ ctaEnabled: true, text: 'Read Seller Guide', link: '/seller/guide', variant: 'outline', size: 'lg' }}
      />

      {/* 5. STATS — custom section */}
      <StatsSection />

      {/* 6. FINAL CTA — Hero10 instance (footer CTA layer) */}
      <Hero10
        title="Ready to join the"
        titleHighlight="Aera Marketplace?"
        description="Whether you're discovering premium source code or listing your own digital products, Aera Market is built to help you ship faster and earn more."
        images={PRODUCT_IMAGES_C}
        imageAlts={['Marketplace preview', 'Product discovery', 'Design showcase']}
        animation="subtle"
        variant="compact"
        primaryCTA={{ ctaEnabled: true, text: 'Create Free Account', link: '/register', size: 'lg' }}
        secondaryCTA={{ ctaEnabled: true, text: 'Sign In', link: '/login', variant: 'outline', size: 'lg' }}
      />

      {/* 7. FOOTER — compact site links */}
      <Footer />
    </main>
  )
}
