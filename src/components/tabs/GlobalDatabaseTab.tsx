import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Archive, Users, Clock, ChevronRight, ArrowLeft, Sparkles, Loader2 } from 'lucide-react';
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

export default function GlobalDatabaseTab() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [evolutionView, setEvolutionView] = useState<EvolutionTimeline | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  // Global objects (chronological for timeline)
  const { data: objects, isLoading } = useQuery({
    queryKey: ['all-objects', search],
    queryFn: async () => {
      let query = supabase.from('objects').select('*').order('created_at', { ascending: true });
      if (search.trim()) {
        query = query.ilike('name', `%${search}%`);
      }
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Connected users' personal objects
  const { data: connectedObjects } = useQuery({
    queryKey: ['connected-objects', search, user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('search_connected_personal_objects', {
        p_search: search.trim(),
      });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const generateEvolution = async (objectName: string) => {
    setGeneratingFor(objectName);
    try {
      const { data, error } = await supabase.functions.invoke('generate-timeline', {
        body: { objectName },
      });
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
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="font-display text-2xl font-semibold text-foreground">{evolutionView.title}</h2>
          </div>
          <p className="text-muted-foreground">AI-generated evolution timeline</p>
        </div>

        <div className="animate-reveal-up stagger-1 relative">
          {/* Timeline line */}
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-6">
            {evolutionView.entries.map((entry, i) => (
              <div key={i} className="relative flex gap-5 items-start">
                {/* Dot */}
                <div className="relative z-10 w-10 h-10 rounded-full bg-primary/10 border-2 border-primary flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                {/* Content */}
                <div className="bg-card border border-border rounded-xl p-5 flex-1 hover:shadow-md hover:shadow-foreground/5 transition-shadow duration-300">
                  <p className="text-xs font-mono text-primary font-semibold tracking-wide mb-1">{entry.year}</p>
                  <h4 className="font-display text-base font-semibold text-foreground">{entry.name}</h4>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{entry.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Group objects by date for the main timeline
  const allTimelineObjects = [
    ...(objects?.map(o => ({ ...o, _source: 'global' as const })) ?? []),
    ...(connectedObjects?.map(o => ({ ...o, _source: 'connected' as const })) ?? []),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Group by month/year
  const grouped = allTimelineObjects.reduce<Record<string, typeof allTimelineObjects>>((acc, obj) => {
    const d = new Date(obj.created_at);
    const key = `${d.toLocaleString('default', { month: 'long' })} ${d.getFullYear()}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(obj);
    return acc;
  }, {});

  // Get unique object names for the evolution section
  const uniqueNames = [...new Set(objects?.map(o => o.name) ?? [])];

  return (
    <div className="max-w-3xl mx-auto space-y-10">
      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">Global Archive</h2>
        <p className="text-muted-foreground mt-1">Community timeline of archived objects</p>
      </div>

      <div className="animate-reveal-up stagger-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the archive..."
          className="pl-10 bg-background"
        />
      </div>

      {/* Main Timeline */}
      <div className="animate-reveal-up stagger-2">
        {isLoading && <p className="text-muted-foreground text-center py-8">Loading archive...</p>}

        {allTimelineObjects.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <Archive className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No objects found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Be the first to add one via the AR Camera tab</p>
          </div>
        )}

        {Object.keys(grouped).length > 0 && (
          <div className="relative">
            {/* Timeline spine */}
            <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />

            <div className="space-y-8">
              {Object.entries(grouped).map(([monthYear, items]) => (
                <div key={monthYear}>
                  {/* Month label */}
                  <div className="relative z-10 flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center flex-shrink-0">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{monthYear}</h3>
                  </div>

                  {/* Objects in this month */}
                  <div className="ml-[52px] space-y-3">
                    {items.map((obj) => (
                      <button
                        key={`${obj._source}-${obj.id}`}
                        onClick={() => setSelectedObjectId(obj.id)}
                        className="w-full text-left bg-card border border-border rounded-xl p-4 hover:shadow-md hover:shadow-foreground/5 transition-all duration-300 active:scale-[0.99] group"
                      >
                        <div className="flex gap-3 items-start">
                          {obj.image_url && (
                            <img src={obj.image_url} alt={obj.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-display text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                                {obj.name}
                              </h4>
                              {obj._source === 'connected' && (
                                <span className="inline-flex items-center gap-1 text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">
                                  <Users className="w-3 h-3" />
                                  Family
                                </span>
                              )}
                            </div>
                            {obj.description && (
                              <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{obj.description}</p>
                            )}
                            <p className="text-xs text-muted-foreground/60 mt-1">
                              {new Date(obj.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Similar Object Evolution Section */}
      {uniqueNames.length > 0 && (
        <div className="animate-reveal-up stagger-3 space-y-4 pt-4 border-t border-border">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-display text-lg font-semibold text-foreground">Explore Object Evolutions</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              See how similar objects evolved over history — tap any object to generate its AI timeline
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
                  <Clock className="w-3.5 h-3.5 text-muted-foreground" />
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
