import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Archive, Users, ArrowLeft, Sparkles, Loader2, Calendar, ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import ObjectDetail from '@/components/ObjectDetail';

interface TimelineEntry {
  year: string;
  name: string;
  description: string;
}

interface EvolutionTimeline {
  title: string;
  entries: TimelineEntry[];
}

const TIMELINE_COLORS = [
  { bg: 'hsl(28 80% 52%)', light: 'hsl(28 80% 95%)', text: 'hsl(28 80% 30%)' },
  { bg: 'hsl(168 45% 43%)', light: 'hsl(168 45% 93%)', text: 'hsl(168 45% 25%)' },
  { bg: 'hsl(210 18% 30%)', light: 'hsl(210 18% 92%)', text: 'hsl(210 18% 18%)' },
  { bg: 'hsl(48 87% 50%)', light: 'hsl(48 87% 93%)', text: 'hsl(48 87% 30%)' },
  { bg: 'hsl(145 50% 42%)', light: 'hsl(145 50% 93%)', text: 'hsl(145 50% 25%)' },
  { bg: 'hsl(187 100% 42%)', light: 'hsl(187 100% 92%)', text: 'hsl(187 100% 22%)' },
];

export default function GlobalDatabaseTab() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedSource, setSelectedSource] = useState<'global' | 'personal'>('global');
  const [evolutionView, setEvolutionView] = useState<EvolutionTimeline | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: objects, isLoading } = useQuery({
    queryKey: ['all-objects', search],
    queryFn: async () => {
      let query = supabase.from('objects').select('*').order('created_at', { ascending: true });
      if (search.trim()) query = query.ilike('name', `%${search}%`);
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
  });

  // User's own personal objects
  const { data: myPersonalObjects } = useQuery({
    queryKey: ['my-personal-objects-community', search, user?.id],
    queryFn: async () => {
      let query = supabase.from('personal_objects').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      if (search.trim()) query = query.ilike('name', `%${search}%`);
      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Connected family members' personal objects
  const { data: connectedObjects } = useQuery({
    queryKey: ['connected-objects', search, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_connected_personal_objects', { p_search: search.trim() });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const generateEvolution = async (objectName: string) => {
    setGeneratingFor(objectName);
    try {
      const { data, error } = await supabase.functions.invoke('generate-timeline', { body: { objectName } });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setEvolutionView(data as EvolutionTimeline);
    } catch (err: any) {
      console.error(err);
    } finally {
      setGeneratingFor(null);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  if (selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} source={selectedSource} onBack={() => { setSelectedObjectId(null); setSelectedSource('global'); }} />;
  }

  // Evolution timeline view
  if (evolutionView) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <button
          onClick={() => setEvolutionView(null)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Archive
        </button>

        <div className="animate-reveal-up">
          <h2 className="font-display text-2xl font-semibold text-foreground">{evolutionView.title}</h2>
          <p className="text-muted-foreground mt-1">AI-generated evolution timeline</p>
        </div>

        {/* Horizontal evolution timeline */}
        <div className="animate-reveal-up stagger-1 relative">
          <div className="flex gap-2 mb-3 justify-end">
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => scroll('left')}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => scroll('right')}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="relative overflow-hidden">
            <div ref={scrollRef} className="flex gap-0 overflow-x-auto pb-4 scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
              {evolutionView.entries.map((entry, i) => {
                const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
                const isLast = i === evolutionView.entries.length - 1;
                return (
                  <div key={i} className="flex-shrink-0 flex flex-col items-center" style={{ width: 220, animationDelay: `${i * 80}ms` }}>
                    <p className="text-xs font-mono font-bold tracking-wider mb-2" style={{ color: color.bg }}>
                      {entry.year}
                    </p>
                    <div className="flex items-center w-full">
                      <div className="flex-1 h-0.5" style={{ backgroundColor: i === 0 ? 'transparent' : color.bg + '40' }} />
                      <div className="w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: color.bg, backgroundColor: color.light }} />
                      <div className="flex-1 h-0.5" style={{ backgroundColor: isLast ? 'transparent' : color.bg + '40' }} />
                    </div>
                    <div className="mt-3 w-[200px] rounded-xl border px-4 py-3" style={{ borderColor: color.bg + '30', backgroundColor: color.light + '40' }}>
                      <h4 className="font-display text-sm font-semibold text-foreground leading-tight">{entry.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-3">{entry.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main archive
  const allTimelineObjects = [
    ...(objects?.map(o => ({ ...o, _source: 'global' as const })) ?? []),
    ...(myPersonalObjects?.map(o => ({ ...o, _source: 'mine' as const })) ?? []),
    ...(connectedObjects?.map(o => ({ ...o, _source: 'connected' as const })) ?? []),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const uniqueNames = [...new Set(objects?.map(o => o.name) ?? [])];

  return (
    <div className="relative -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-10 min-h-[60vh] space-y-10 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, hsl(210 29% 18%), hsl(210 18% 22%), hsl(210 29% 16%))' }}>
      {/* Grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--color-community)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--color-community)) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />
      {/* Radial glow */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 40%, hsl(28 80% 52% / 0.08) 0%, transparent 60%)' }} />

      <div className="relative z-10 max-w-2xl mx-auto animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-white">
          Community <span style={{ color: 'hsl(28 80% 52%)' }}>Archive</span>
        </h2>
        <p className="text-white/70 mt-1">Community timeline of archived objects — sorted by date uploaded</p>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto animate-reveal-up stagger-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the archive..." className="pl-10 bg-white/[0.08] border-white/20 text-white placeholder:text-white/40 focus-visible:ring-white/30" />
      </div>

      {/* Horizontal Timeline */}
      <div className="relative z-10 animate-reveal-up stagger-2">
        {isLoading && <p className="text-white/70 text-center py-8">Loading archive...</p>}

        {allTimelineObjects.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Archive className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/70">No objects found</p>
            <p className="text-sm text-white/50 mt-1">Be the first to add one via the AI Camera tab</p>
          </div>
        )}

        {allTimelineObjects.length > 0 && (
          <div className="relative">
            <div className="flex gap-2 mb-3 justify-end px-4">
              <Button variant="outline" size="icon" className="w-8 h-8 bg-white/10 border-white/15 text-white/70 hover:bg-white/20 hover:text-white" onClick={() => scroll('left')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="w-8 h-8 bg-white/10 border-white/15 text-white/70 hover:bg-white/20 hover:text-white" onClick={() => scroll('right')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div ref={scrollRef} className="flex gap-0 overflow-x-auto pb-8 pt-2 px-5" style={{ scrollbarWidth: 'none' }}>
              {allTimelineObjects.map((obj, i) => {
                const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
                const isLast = i === allTimelineObjects.length - 1;
                const uploadDate = new Date(obj.created_at);
                const estimatedOrigin = (obj as any).estimated_origin;
                const isCenterItem = allTimelineObjects.length > 2 && i === Math.floor(allTimelineObjects.length / 2);

                return (
                  <button
                    key={`${obj._source}-${obj.id}`}
                    onClick={() => {
                      setSelectedObjectId(obj.id);
                      setSelectedSource(obj._source === 'global' ? 'global' : 'personal');
                    }}
                    className="flex-shrink-0 flex flex-col items-center group no-underline"
                    style={{ width: 220, textDecoration: 'none' }}
                  >
                    <p className="text-[10px] font-mono font-bold tracking-wider mb-2 text-white/70 no-underline">
                      {uploadDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>

                    <div className="flex items-center w-full">
                      <div className="flex-1 h-px" style={{ backgroundColor: i === 0 ? 'transparent' : 'hsl(200 30% 40% / 0.3)' }} />
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0 transition-all duration-300 group-hover:scale-125 border-2"
                        style={{
                          backgroundColor: color.bg,
                          borderColor: 'hsl(200 60% 70% / 0.4)',
                          boxShadow: isCenterItem ? `0 0 14px ${color.bg}60` : `0 0 6px ${color.bg}30`,
                        }}
                      />
                      <div className="flex-1 h-px" style={{ backgroundColor: isLast ? 'transparent' : 'hsl(200 30% 40% / 0.3)' }} />
                    </div>

                    <div
                      className={`mt-4 w-[200px] rounded-xl border px-4 py-3 text-left transition-all duration-300 backdrop-blur-sm group-hover:-translate-y-1 ${
                        isCenterItem
                          ? 'shadow-lg shadow-black/30 border-2 scale-105'
                          : 'group-hover:shadow-md group-hover:shadow-black/20'
                      }`}
                      style={{
                        borderColor: isCenterItem ? color.bg + '80' : 'hsl(200 20% 30% / 0.4)',
                        backgroundColor: isCenterItem ? color.bg + '18' : 'hsl(220 18% 18% / 0.7)',
                      }}
                    >
                      {obj.image_url && (
                        <img src={obj.image_url} alt={obj.name} className="w-full h-24 object-cover rounded-lg mb-2 opacity-90" />
                      )}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className={`font-display text-sm font-semibold leading-tight truncate transition-colors ${
                          isCenterItem ? 'text-white' : 'text-white/90 group-hover:text-white'
                        }`}>
                          {obj.name}
                        </h4>
                        {obj._source === 'connected' && (
                          <Users className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(var(--color-community))' }} title="Family member's object" />
                        )}
                        {obj._source === 'mine' && (
                          <BookLock className="w-3 h-3 flex-shrink-0" style={{ color: 'hsl(var(--color-success))' }} title="Your personal object" />
                        )}
                      </div>
                      {estimatedOrigin && (
                        <p className="text-[10px] font-mono font-semibold mb-1" style={{ color: color.bg }}>
                          Origin: {estimatedOrigin}
                        </p>
                      )}
                      {obj.description && (
                        <p className="text-xs text-white/65 line-clamp-2 leading-relaxed">{obj.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Explore Evolutions */}
      {uniqueNames.length > 0 && (
        <div className="relative z-10 max-w-2xl mx-auto animate-reveal-up stagger-3 space-y-4 pt-6 border-t border-white/10">
          <div>
            <h3 className="font-display text-lg font-semibold text-white">
              Explore <span style={{ color: 'hsl(28 80% 52%)' }}>Evolutions</span>
            </h3>
            <p className="text-sm text-white/60 mt-1">
              Tap any object to see how it evolved over history
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueNames.slice(0, 20).map((name) => (
              <button
                key={name}
                onClick={() => generateEvolution(name)}
                disabled={generatingFor !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white/[0.08] border border-white/[0.15] text-sm font-medium text-white/90 hover:border-white/30 hover:bg-white/[0.14] transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
              >
                {generatingFor === name ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-white/50" />
                )}
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
