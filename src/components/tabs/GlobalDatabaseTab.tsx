import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Archive, Users, ArrowLeft, Sparkles, Loader2, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
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
  { bg: 'hsl(262 80% 50%)', light: 'hsl(262 80% 95%)', text: 'hsl(262 80% 30%)' },
  { bg: 'hsl(199 89% 48%)', light: 'hsl(199 89% 93%)', text: 'hsl(199 89% 25%)' },
  { bg: 'hsl(142 71% 45%)', light: 'hsl(142 71% 93%)', text: 'hsl(142 71% 25%)' },
  { bg: 'hsl(25 95% 53%)',  light: 'hsl(25 95% 93%)',  text: 'hsl(25 95% 30%)' },
  { bg: 'hsl(346 77% 50%)', light: 'hsl(346 77% 93%)', text: 'hsl(346 77% 30%)' },
  { bg: 'hsl(173 80% 40%)', light: 'hsl(173 80% 92%)', text: 'hsl(173 80% 22%)' },
];

export default function GlobalDatabaseTab() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
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
    return <ObjectDetail objectId={selectedObjectId} onBack={() => setSelectedObjectId(null)} />;
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
                    {/* Date label */}
                    <p className="text-xs font-mono font-bold tracking-wider mb-2" style={{ color: color.bg }}>
                      {entry.year}
                    </p>
                    {/* Dot + line */}
                    <div className="flex items-center w-full">
                      <div className="flex-1 h-0.5" style={{ backgroundColor: i === 0 ? 'transparent' : color.bg + '40' }} />
                      <div className="w-4 h-4 rounded-full border-2 flex-shrink-0" style={{ borderColor: color.bg, backgroundColor: color.light }} />
                      <div className="flex-1 h-0.5" style={{ backgroundColor: isLast ? 'transparent' : color.bg + '40' }} />
                    </div>
                    {/* Card below */}
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
    ...(connectedObjects?.map(o => ({ ...o, _source: 'connected' as const })) ?? []),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const uniqueNames = [...new Set(objects?.map(o => o.name) ?? [])];

  return (
    <div className="space-y-10 max-w-[100vw]">
      <div className="max-w-2xl mx-auto animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Global <span className="text-primary">Archive</span>
        </h2>
        <p className="text-muted-foreground mt-1">Community timeline of archived objects — sorted by date uploaded</p>
      </div>

      <div className="max-w-2xl mx-auto animate-reveal-up stagger-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the archive..." className="pl-10 bg-background" />
      </div>

      {/* Horizontal Timeline */}
      <div className="animate-reveal-up stagger-2">
        {isLoading && <p className="text-muted-foreground text-center py-8">Loading archive...</p>}

        {allTimelineObjects.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Archive className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No objects found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Be the first to add one via the AR Camera tab</p>
          </div>
        )}

        {allTimelineObjects.length > 0 && (
          <div className="relative">
            {/* Scroll arrows */}
            <div className="flex gap-2 mb-3 justify-end px-4">
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => scroll('left')}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="w-8 h-8" onClick={() => scroll('right')}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>

            <div ref={scrollRef} className="flex gap-0 overflow-x-auto pb-6 px-4" style={{ scrollbarWidth: 'none' }}>
              {allTimelineObjects.map((obj, i) => {
                const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
                const isLast = i === allTimelineObjects.length - 1;
                const uploadDate = new Date(obj.created_at);
                const estimatedOrigin = (obj as any).estimated_origin;

                return (
                  <button
                    key={`${obj._source}-${obj.id}`}
                    onClick={() => setSelectedObjectId(obj.id)}
                    className="flex-shrink-0 flex flex-col items-center group"
                    style={{ width: 220 }}
                  >
                    {/* Upload date label */}
                    <p className="text-[10px] font-mono font-bold tracking-wider mb-2 opacity-70" style={{ color: color.bg }}>
                      {uploadDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>

                    {/* Horizontal spine: line — dot — line */}
                    <div className="flex items-center w-full">
                      <div className="flex-1 h-0.5" style={{ backgroundColor: i === 0 ? 'transparent' : 'hsl(var(--border))' }} />
                      <div
                        className="w-5 h-5 rounded-full border-[3px] flex-shrink-0 transition-transform duration-200 group-hover:scale-125 overflow-hidden"
                        style={{ borderColor: color.bg, backgroundColor: color.light }}
                      >
                        {obj.image_url && (
                          <img src={obj.image_url} alt="" className="w-full h-full object-cover rounded-full" />
                        )}
                      </div>
                      <div className="flex-1 h-0.5" style={{ backgroundColor: isLast ? 'transparent' : 'hsl(var(--border))' }} />
                    </div>

                    {/* Card */}
                    <div
                      className="mt-3 w-[200px] rounded-xl border px-4 py-3 text-left transition-all duration-300 group-hover:shadow-md group-hover:-translate-y-1"
                      style={{ borderColor: color.bg + '30', backgroundColor: color.light + '40' }}
                    >
                      {obj.image_url && (
                        <img src={obj.image_url} alt={obj.name} className="w-full h-24 object-cover rounded-lg mb-2" />
                      )}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <h4 className="font-display text-sm font-semibold text-foreground leading-tight truncate group-hover:text-primary transition-colors">
                          {obj.name}
                        </h4>
                        {obj._source === 'connected' && (
                          <Users className="w-3 h-3 text-accent flex-shrink-0" />
                        )}
                      </div>
                      {estimatedOrigin && (
                        <p className="text-[10px] font-mono text-primary font-semibold mb-1">
                          Origin: {estimatedOrigin}
                        </p>
                      )}
                      {obj.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{obj.description}</p>
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
        <div className="max-w-2xl mx-auto animate-reveal-up stagger-3 space-y-4 pt-6 border-t border-border">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              Explore <span className="text-primary">Evolutions</span>
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tap any object to see how it evolved over history
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueNames.slice(0, 20).map((name) => (
              <button
                key={name}
                onClick={() => generateEvolution(name)}
                disabled={generatingFor !== null}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-card border border-border text-sm font-medium text-foreground hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 active:scale-[0.97] disabled:opacity-50"
              >
                {generatingFor === name ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
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
