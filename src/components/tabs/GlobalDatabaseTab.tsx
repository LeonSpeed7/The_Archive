import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Archive, Users, Clock, ArrowLeft, Sparkles, Loader2, Calendar } from 'lucide-react';
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

// Color palette for timeline entries (cycling)
const TIMELINE_COLORS = [
  { bg: 'hsl(262 80% 50%)', light: 'hsl(262 80% 95%)', text: 'hsl(262 80% 30%)' },  // purple
  { bg: 'hsl(199 89% 48%)', light: 'hsl(199 89% 93%)', text: 'hsl(199 89% 25%)' },  // blue
  { bg: 'hsl(142 71% 45%)', light: 'hsl(142 71% 93%)', text: 'hsl(142 71% 25%)' },  // green
  { bg: 'hsl(25 95% 53%)',  light: 'hsl(25 95% 93%)',  text: 'hsl(25 95% 30%)' },   // orange
  { bg: 'hsl(346 77% 50%)', light: 'hsl(346 77% 93%)', text: 'hsl(346 77% 30%)' },  // rose
  { bg: 'hsl(173 80% 40%)', light: 'hsl(173 80% 92%)', text: 'hsl(173 80% 22%)' },  // teal
];

export default function GlobalDatabaseTab() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [evolutionView, setEvolutionView] = useState<EvolutionTimeline | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

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

  if (selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} onBack={() => setSelectedObjectId(null)} />;
  }

  // Evolution timeline view - Vertical Milestones style
  if (evolutionView) {
    return (
      <div className="max-w-2xl mx-auto space-y-8">
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

        <div className="animate-reveal-up stagger-1 relative">
          {/* Vertical line */}
          <div className="absolute left-7 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-1">
            {evolutionView.entries.map((entry, i) => {
              const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
              return (
                <div key={i} className="relative flex items-stretch gap-5 group" style={{ animationDelay: `${i * 80}ms` }}>
                  {/* Icon circle */}
                  <div className="relative z-10 flex-shrink-0 w-14 flex items-start justify-center pt-5">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110"
                      style={{ backgroundColor: color.bg }}
                    >
                      <Calendar className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  {/* Content card */}
                  <div className="flex-1 py-2">
                    <div
                      className="rounded-xl border px-5 py-4 transition-all duration-300 group-hover:shadow-md"
                      style={{ borderColor: color.bg + '30', backgroundColor: color.light + '40' }}
                    >
                      <p className="text-xs font-mono font-bold tracking-wider mb-0.5" style={{ color: color.bg }}>
                        {entry.year}
                      </p>
                      <h4 className="font-display text-base font-semibold text-foreground">{entry.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{entry.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Main timeline
  const allTimelineObjects = [
    ...(objects?.map(o => ({ ...o, _source: 'global' as const })) ?? []),
    ...(connectedObjects?.map(o => ({ ...o, _source: 'connected' as const })) ?? []),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const uniqueNames = [...new Set(objects?.map(o => o.name) ?? [])];

  return (
    <div className="max-w-2xl mx-auto space-y-10">
      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">
          Global <span className="text-primary">Archive</span>
        </h2>
        <p className="text-muted-foreground mt-1">Community timeline of archived objects</p>
      </div>

      <div className="animate-reveal-up stagger-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search the archive..." className="pl-10 bg-background" />
      </div>

      {/* Vertical Milestones Timeline */}
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
            {/* Vertical spine */}
            <div className="absolute left-7 top-0 bottom-0 w-0.5 bg-border" />

            <div className="space-y-1">
              {allTimelineObjects.map((obj, i) => {
                const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
                const originDate = (obj as any).estimated_origin;
                return (
                  <button
                    key={`${obj._source}-${obj.id}`}
                    onClick={() => setSelectedObjectId(obj.id)}
                    className="relative flex items-stretch gap-5 group w-full text-left"
                  >
                    {/* Icon */}
                    <div className="relative z-10 flex-shrink-0 w-14 flex items-start justify-center pt-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110 overflow-hidden"
                        style={{ backgroundColor: obj.image_url ? undefined : color.bg }}
                      >
                        {obj.image_url ? (
                          <img src={obj.image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Clock className="w-5 h-5 text-white" />
                        )}
                      </div>
                    </div>

                    {/* Card */}
                    <div className="flex-1 py-1.5">
                      <div
                        className="rounded-xl border px-5 py-4 transition-all duration-300 group-hover:shadow-md"
                        style={{ borderColor: color.bg + '30', backgroundColor: color.light + '40' }}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-xs font-mono font-bold tracking-wider" style={{ color: color.bg }}>
                            {originDate || new Date(obj.created_at).toLocaleDateString()}
                          </p>
                          {obj._source === 'connected' && (
                            <span className="inline-flex items-center gap-1 text-xs bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                              <Users className="w-3 h-3" />
                              Family
                            </span>
                          )}
                        </div>
                        <h4 className="font-display text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                          {obj.name}
                        </h4>
                        {obj.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{obj.description}</p>
                        )}
                      </div>
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
        <div className="animate-reveal-up stagger-3 space-y-4 pt-6 border-t border-border">
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
