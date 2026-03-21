import { Camera, Globe, TreePine, BookLock, ArrowRight, Sparkles, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onGetStarted: () => void;
}

const features = [
  {
    icon: Camera,
    title: 'AI-Powered Identification',
    description: 'Point your camera at any object — our AI identifies it, traces its origins, and adds it to the archive automatically.',
  },
  {
    icon: Globe,
    title: 'Community Archive',
    description: 'Browse a shared timeline of objects contributed by the community. Discover stories and history behind everyday items.',
  },
  {
    icon: BookLock,
    title: 'Personal Collection',
    description: 'Keep a private archive of objects meaningful to you. Share selectively with family or keep them just for yourself.',
  },
  {
    icon: TreePine,
    title: 'Family Tree',
    description: 'Map your family connections and link objects to the people who cherished them. Preserve lineage alongside legacy.',
  },
];

const stats = [
  { label: 'Objects Archived', value: '∞' },
  { label: 'AI Models', value: '2' },
  { label: 'Privacy First', value: '✓' },
];

export default function LandingPage({ onGetStarted }: Props) {
  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(180deg, hsl(var(--teal-50)) 0%, hsl(var(--background)) 40%)' }}>
      {/* Nav */}
      <header className="sticky top-0 z-50 backdrop-blur-md border-b" style={{ backgroundColor: 'hsl(var(--teal-900) / 0.95)', borderColor: 'hsl(var(--teal-700) / 0.5)' }}>
        <div className="container flex items-center justify-between h-14">
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="font-display text-xl font-semibold tracking-tight text-white hover:opacity-80 transition-opacity cursor-pointer">The Archive</button>
          <Button
            onClick={onGetStarted}
            size="sm"
            className="gap-1.5"
            style={{ backgroundColor: 'hsl(var(--teal-cta))', color: 'white' }}
          >
            Get Started <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="container py-20 sm:py-28 text-center max-w-3xl mx-auto">
        <div className="animate-reveal-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-8" style={{ backgroundColor: 'hsl(var(--teal-100))', color: 'hsl(var(--teal-600))' }}>
            <Sparkles className="w-3.5 h-3.5" />
            AI-powered object archiving
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.08] tracking-tight" style={{ color: 'hsl(var(--teal-900))' }}>
            Every object has a story.
            <br />
            <span style={{ color: 'hsl(var(--teal-cta))' }}>Preserve yours.</span>
          </h2>
          <p className="mt-6 text-lg sm:text-xl leading-relaxed max-w-2xl mx-auto" style={{ color: 'hsl(var(--muted-foreground))' }}>
            The Archive uses AI to identify, catalog, and trace the history of objects that matter to you — from family heirlooms to everyday artifacts.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={onGetStarted}
              size="lg"
              className="gap-2 text-base px-8 shadow-lg transition-all duration-300 hover:-translate-y-0.5"
              style={{ backgroundColor: 'hsl(var(--teal-cta))', color: 'white', boxShadow: '0 8px 24px hsl(var(--teal-cta) / 0.3)' }}
            >
              Start Archiving <ArrowRight className="w-4 h-4" />
            </Button>
            <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>Free to use · No credit card needed</p>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="border-y" style={{ borderColor: 'hsl(var(--teal-200))', backgroundColor: 'hsl(var(--teal-50))' }}>
        <div className="container py-6 flex items-center justify-center gap-12 sm:gap-20">
          {stats.map((s) => (
            <div key={s.label} className="text-center animate-reveal-up">
              <p className="font-display text-2xl font-bold" style={{ color: 'hsl(var(--teal-cta))' }}>{s.value}</p>
              <p className="text-xs font-medium mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="container py-20 sm:py-24 max-w-5xl mx-auto">
        <div className="text-center mb-14 animate-reveal-up">
          <h3 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: 'hsl(var(--teal-900))' }}>
            How it works
          </h3>
          <p className="mt-3 text-lg" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Four tools, one mission — preserving what matters.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="animate-reveal-up rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                style={{
                  animationDelay: `${i * 100}ms`,
                  borderColor: 'hsl(var(--teal-200))',
                  backgroundColor: 'hsl(var(--teal-50))',
                  boxShadow: '0 2px 8px hsl(var(--teal-900) / 0.04)',
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--teal-400)), hsl(var(--teal-cta)))' }}
                >
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h4 className="font-display text-lg font-semibold" style={{ color: 'hsl(var(--teal-900))' }}>{f.title}</h4>
                <p className="mt-2 leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>{f.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trust section */}
      <section className="border-t" style={{ borderColor: 'hsl(var(--teal-200))', background: 'linear-gradient(180deg, hsl(var(--teal-50)), hsl(var(--background)))' }}>
        <div className="container py-16 max-w-3xl mx-auto text-center animate-reveal-up">
          <div className="flex items-center justify-center gap-8 mb-8">
            <div className="flex items-center gap-2" style={{ color: 'hsl(var(--teal-600))' }}>
              <Shield className="w-5 h-5" />
              <span className="text-sm font-medium">Privacy by design</span>
            </div>
            <div className="flex items-center gap-2" style={{ color: 'hsl(var(--teal-600))' }}>
              <Users className="w-5 h-5" />
              <span className="text-sm font-medium">Family-first sharing</span>
            </div>
          </div>
          <h3 className="font-display text-2xl font-bold mb-4" style={{ color: 'hsl(var(--teal-900))' }}>
            Ready to start preserving?
          </h3>
          <p className="mb-8" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Create your free account and begin archiving the objects and stories that define your heritage.
          </p>
          <Button
            onClick={onGetStarted}
            size="lg"
            className="gap-2 px-8 shadow-lg transition-all duration-300 hover:-translate-y-0.5"
            style={{ backgroundColor: 'hsl(var(--teal-cta))', color: 'white', boxShadow: '0 8px 24px hsl(var(--teal-cta) / 0.3)' }}
          >
            Create Free Account <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8" style={{ borderColor: 'hsl(var(--teal-200))', backgroundColor: 'hsl(var(--teal-50))' }}>
        <div className="container text-center">
          <p className="text-sm" style={{ color: 'hsl(var(--muted-foreground))' }}>
            © {new Date().getFullYear()} The Archive — Preserving heritage, one object at a time.
          </p>
        </div>
      </footer>
    </div>
  );
}
