import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, ChevronRight, ChevronLeft, Camera, Globe, BookLock, TreePine, Sparkles, Users, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Tab = 'camera' | 'personal' | 'database' | 'tree';

interface Step {
  tab: Tab;
  title: string;
  description: string;
  icon: typeof Camera;
  tip: string;
}

const STEPS: Step[] = [
  {
    tab: 'camera',
    title: 'AI Camera',
    description: 'This is your starting point. Snap a photo of any object — a family heirloom, an old tool, a vintage item — and our AI will identify it, trace its history, and add it to your archive.',
    icon: Camera,
    tip: 'Try uploading a photo of something meaningful to you to see AI identification in action.',
  },
  {
    tab: 'personal',
    title: 'My Archive',
    description: 'Your private collection. Objects saved here are visible only to you and your connected family members. Add personal stories and memories to each item.',
    icon: BookLock,
    tip: 'After scanning an object with AI Camera, save it here to build your personal collection.',
  },
  {
    tab: 'database',
    title: 'Community Database',
    description: 'A shared timeline of objects contributed by the entire community. Browse, explore evolutions, and discover the stories behind everyday artifacts.',
    icon: Globe,
    tip: 'You\'ll also see your personal and family objects here, marked with special icons.',
  },
  {
    tab: 'tree',
    title: 'Family Tree',
    description: 'Map your family connections and link objects to the people who cherished them. Connect with family members using safewords to share archives privately.',
    icon: TreePine,
    tip: 'Set up your safeword in Account Settings so family members can connect with you.',
  },
];

export function useGuidedExploration() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['guided-exploration', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('guided_exploration')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return (data as any).guided_exploration as boolean;
    },
    enabled: !!user,
  });
}

export function useToggleGuidedExploration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ guided_exploration: enabled } as any)
        .eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['guided-exploration'] });
      queryClient.invalidateQueries({ queryKey: ['full-profile'] });
    },
  });
}

interface Props {
  activeTab: Tab;
  onNavigateTab: (tab: Tab) => void;
}

export default function GuidedExploration({ activeTab, onNavigateTab }: Props) {
  const { data: enabled, isLoading } = useGuidedExploration();
  const toggleMut = useToggleGuidedExploration();
  const [dismissed, setDismissed] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Sync step to active tab
  useEffect(() => {
    const idx = STEPS.findIndex(s => s.tab === activeTab);
    if (idx >= 0) setCurrentStep(idx);
  }, [activeTab]);

  if (isLoading || !enabled || dismissed) return null;

  const step = STEPS[currentStep];
  const Icon = step.icon;
  const isFirst = currentStep === 0;
  const isLast = currentStep === STEPS.length - 1;

  const goTo = (idx: number) => {
    setCurrentStep(idx);
    onNavigateTab(STEPS[idx].tab);
  };

  const handleDismiss = () => setDismissed(true);

  const handleTurnOff = () => {
    toggleMut.mutate(false);
    setDismissed(true);
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[340px] rounded-2xl border shadow-xl animate-reveal-up"
      style={{
        backgroundColor: 'hsl(var(--teal-50))',
        borderColor: 'hsl(var(--teal-200))',
        boxShadow: '0 12px 40px hsl(var(--teal-900) / 0.12)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-t-2xl"
        style={{ background: 'linear-gradient(135deg, hsl(var(--teal-500)), hsl(var(--teal-cta)))' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-white/90" />
          <span className="text-sm font-semibold text-white">Guided Tour</span>
          <span className="text-[10px] font-mono text-white/70 ml-1">
            {currentStep + 1}/{STEPS.length}
          </span>
        </div>
        <button
          onClick={handleDismiss}
          className="text-white/70 hover:text-white transition-colors active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5 px-4 pt-3">
        {STEPS.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className="h-1 rounded-full transition-all duration-300 active:scale-95"
            style={{
              flex: i === currentStep ? 2 : 1,
              backgroundColor: i === currentStep
                ? 'hsl(var(--teal-cta))'
                : i < currentStep
                  ? 'hsl(var(--teal-400))'
                  : 'hsl(var(--teal-200))',
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(var(--teal-400)), hsl(var(--teal-cta)))' }}
          >
            <Icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="font-display text-base font-semibold" style={{ color: 'hsl(var(--teal-900))' }}>
              {step.title}
            </h4>
          </div>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {step.description}
        </p>

        {/* Tip */}
        <div
          className="flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
          style={{ backgroundColor: 'hsl(var(--teal-100))', color: 'hsl(var(--teal-700))' }}
        >
          <Sparkles className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'hsl(var(--teal-cta))' }} />
          <span>{step.tip}</span>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 pb-4">
        <button
          onClick={handleTurnOff}
          className="text-[11px] transition-colors"
          style={{ color: 'hsl(var(--muted-foreground))' }}
        >
          Don't show again
        </button>
        <div className="flex gap-2">
          {!isFirst && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => goTo(currentStep - 1)}
              style={{ borderColor: 'hsl(var(--teal-200))', color: 'hsl(var(--teal-700))' }}
            >
              <ChevronLeft className="w-3 h-3" /> Back
            </Button>
          )}
          {isLast ? (
            <Button
              size="sm"
              className="h-8 text-xs text-white"
              onClick={handleDismiss}
              style={{ backgroundColor: 'hsl(var(--teal-cta))' }}
            >
              Done!
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-8 text-xs gap-1 text-white"
              onClick={() => goTo(currentStep + 1)}
              style={{ backgroundColor: 'hsl(var(--teal-cta))' }}
            >
              Next <ChevronRight className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
