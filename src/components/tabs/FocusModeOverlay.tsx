import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { X, History, Users, MessageSquare, Loader2, ChevronRight } from 'lucide-react';

interface FocusedItem {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  bbox: [number, number, number, number];
  brief: string;
}

interface FocusModeOverlayProps {
  item: FocusedItem;
  onClose: () => void;
}

interface StoryEntry {
  id: string;
  content: string;
  visibility: string;
  created_at: string;
  username?: string;
}

export default function FocusModeOverlay({ item, onClose }: FocusModeOverlayProps) {
  const [history, setHistory] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [communityStories, setCommunityStories] = useState<StoryEntry[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState(true);
  const [familyConnections, setFamilyConnections] = useState<string[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(true);

  // Fetch history for focused item
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingHistory(true);
      try {
        const { data, error } = await supabase.functions.invoke('live-sense', {
          body: { historyMode: true, itemNames: item.name },
        });
        if (cancelled) return;
        if (!error && data?.histories?.[0]?.history) {
          setHistory(data.histories[0].history);
        } else {
          setHistory(null);
        }
      } catch {
        if (!cancelled) setHistory(null);
      } finally {
        if (!cancelled) setIsLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.name]);

  // Search community objects matching name using AI search + keyword fallback
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingStories(true);
      try {
        // Split detected name into individual words for broader matching
        const nameWords = item.name.split(/\s+/).filter(w => w.length > 2);
        const searchPatterns = [item.name, ...nameWords];

        // Run AI semantic search and multiple keyword searches in parallel
        const searches = [
          supabase.functions.invoke('ai-search', { body: { query: item.name } }),
          ...searchPatterns.map(pattern =>
            supabase.from('objects').select('id').ilike('name', `%${pattern}%`).limit(10)
          ),
          // Also search by description for broader matches
          supabase.from('objects').select('id').ilike('description', `%${item.name}%`).limit(10),
        ];

        const results = await Promise.allSettled(searches);

        if (cancelled) return;

        const objectIdSet = new Set<string>();

        // First result is AI search
        const aiResult = results[0];
        if (aiResult.status === 'fulfilled' && (aiResult.value as any).data?.ids) {
          ((aiResult.value as any).data.ids as string[]).forEach(id => objectIdSet.add(id));
        }

        // Remaining results are keyword searches
        for (let i = 1; i < results.length; i++) {
          const r = results[i];
          if (r.status === 'fulfilled' && (r.value as any).data) {
            (r.value as any).data.forEach((o: { id: string }) => objectIdSet.add(o.id));
          }
        }

        const objectIds = [...objectIdSet];
        if (!objectIds.length) {
          if (!cancelled) setCommunityStories([]);
          if (!cancelled) setIsLoadingStories(false);
          return;
        }

        const { data: stories } = await supabase
          .from('stories')
          .select('id, content, visibility, created_at, user_id')
          .in('object_id', objectIds)
          .eq('visibility', 'global')
          .order('created_at', { ascending: false })
          .limit(8);

        if (cancelled) return;

        if (stories?.length) {
          const userIds = [...new Set(stories.map(s => s.user_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('user_id, username, display_name')
            .in('user_id', userIds);

          const profileMap = new Map(
            (profiles || []).map(p => [p.user_id, p.username || p.display_name || 'Anonymous'])
          );

          setCommunityStories(stories.map(s => ({
            id: s.id,
            content: s.content,
            visibility: s.visibility,
            created_at: s.created_at,
            username: profileMap.get(s.user_id) || 'Anonymous',
          })));
        } else {
          setCommunityStories([]);
        }
      } catch {
        if (!cancelled) setCommunityStories([]);
      } finally {
        if (!cancelled) setIsLoadingStories(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.name]);

  // Check personal/family objects matching name
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoadingConnections(true);
      try {
        // Split name into words for broader matching
        const nameWords = item.name.split(/\s+/).filter(w => w.length > 2);
        const allPatterns = [item.name, ...nameWords];

        // Check personal objects with multiple search patterns
        const personalSearches = allPatterns.map(pattern =>
          supabase.from('personal_objects').select('name, visibility').ilike('name', `%${pattern}%`).limit(5)
        );
        // Also search by description
        personalSearches.push(
          supabase.from('personal_objects').select('name, visibility').ilike('description', `%${item.name}%`).limit(5)
        );

        const [familyResult, ...personalResults] = await Promise.allSettled([
          supabase.rpc('search_connected_personal_objects', { p_search: item.name }),
          ...personalSearches,
        ]);

        if (cancelled) return;

        // Deduplicate personal objects by name
        const personalSet = new Set<string>();
        for (const r of personalResults) {
          if (r.status === 'fulfilled' && (r.value as any).data) {
            (r.value as any).data.forEach((o: { name: string }) => personalSet.add(o.name));
          }
        }

        const connections: string[] = [];
        if (personalSet.size > 0) {
          connections.push(`Found in your personal archive (${personalSet.size})`);
        }
        if (familyResult.status === 'fulfilled' && (familyResult.value as any).data?.length) {
          connections.push(`Found in family archives (${(familyResult.value as any).data.length})`);
        }
        setFamilyConnections(connections);
      } catch {
        if (!cancelled) setFamilyConnections([]);
      } finally {
        if (!cancelled) setIsLoadingConnections(false);
      }
    })();
    return () => { cancelled = true; };
  }, [item.name]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const confidenceLabel: Record<string, { color: string; bg: string }> = {
    high: { color: 'hsl(160 60% 40%)', bg: 'hsl(160 60% 95%)' },
    medium: { color: 'hsl(45 80% 40%)', bg: 'hsl(45 80% 95%)' },
    low: { color: 'hsl(0 60% 45%)', bg: 'hsl(0 60% 95%)' },
  };

  const conf = confidenceLabel[item.confidence] || confidenceLabel.medium;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
      style={{ animation: 'focus-backdrop-in 300ms ease-out forwards' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: 'focus-panel-in 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards' }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors active:scale-95"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[11px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide"
              style={{ backgroundColor: conf.bg, color: conf.color }}
            >
              {item.confidence}
            </span>
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground mt-2 overflow-wrap-break-word">
            {item.name}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{item.brief}</p>
        </div>

        <div className="h-px bg-border mx-6" />

        {/* History section */}
        <div className="px-6 py-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <History className="w-4 h-4" style={{ color: 'hsl(215 50% 50%)' }} />
            Historical Background
          </div>
          {isLoadingHistory ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Researching history…
            </div>
          ) : history ? (
            <p className="text-sm text-muted-foreground leading-relaxed">{history}</p>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No historical data available for this object.</p>
          )}
        </div>

        <div className="h-px bg-border mx-6" />

        {/* Personal/family connections */}
        <div className="px-6 py-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Users className="w-4 h-4" style={{ color: 'hsl(215 50% 50%)' }} />
            Personal & Family
          </div>
          {isLoadingConnections ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Checking archives…
            </div>
          ) : familyConnections.length > 0 ? (
            <div className="space-y-1.5">
              {familyConnections.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(215 50% 50%)' }} />
                  {c}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No matching items in your archives.</p>
          )}
        </div>

        <div className="h-px bg-border mx-6" />

        {/* Community stories */}
        <div className="px-6 py-4 pb-8 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <MessageSquare className="w-4 h-4" style={{ color: 'hsl(215 50% 50%)' }} />
            Community Stories
          </div>
          {isLoadingStories ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Searching community…
            </div>
          ) : communityStories.length > 0 ? (
            <div className="space-y-3">
              {communityStories.map((story) => (
                <div key={story.id} className="rounded-xl bg-muted/40 p-3 space-y-1">
                  <p className="text-sm text-foreground leading-relaxed line-clamp-3">{story.content}</p>
                  <p className="text-[11px] text-muted-foreground">
                    — {story.username}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">No community stories found for this object.</p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes focus-backdrop-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes focus-panel-in {
          from { opacity: 0; transform: translateY(40px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
