import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Users, Volume2, Loader2, VolumeX, Globe, Lock, Sparkles, Calendar, ChevronLeft, ChevronRight, Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props {
  objectId: string;
  onBack: () => void;
  source?: 'global' | 'personal';
}

interface TimelineEntry {
  year: string;
  name: string;
  description: string;
}

const TIMELINE_COLORS = [
  { bg: 'hsl(262 80% 50%)', light: 'hsl(262 80% 95%)' },
  { bg: 'hsl(199 89% 48%)', light: 'hsl(199 89% 93%)' },
  { bg: 'hsl(142 71% 45%)', light: 'hsl(142 71% 93%)' },
  { bg: 'hsl(25 95% 53%)',  light: 'hsl(25 95% 93%)' },
  { bg: 'hsl(346 77% 50%)', light: 'hsl(346 77% 93%)' },
  { bg: 'hsl(173 80% 40%)', light: 'hsl(173 80% 92%)' },
];

export default function ObjectDetail({ objectId, onBack, source = 'global' }: Props) {
  const isPersonal = source === 'personal';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newStory, setNewStory] = useState('');
  const [storyVisibility, setStoryVisibility] = useState<'global' | 'family'>('global');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const evoScrollRef = useRef<HTMLDivElement>(null);

  // Evolution timeline state
  const [evolution, setEvolution] = useState<TimelineEntry[] | null>(null);
  const [loadingEvolution, setLoadingEvolution] = useState(false);

  const { data: object } = useQuery({
    queryKey: [isPersonal ? 'personal-object' : 'object', objectId],
    queryFn: async () => {
      const table = isPersonal ? 'personal_objects' : 'objects';
      const { data, error } = await supabase.from(table).select('*').eq('id', objectId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stories } = useQuery({
    queryKey: ['stories', objectId, source],
    queryFn: async () => {
      const col = isPersonal ? 'personal_object_id' : 'object_id';
      const { data, error } = await supabase
        .from('stories')
        .select('*, profiles:user_id(display_name, full_name)')
        .eq(col, objectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Auto-generate evolution timeline when object loads
  useEffect(() => {
    if (object?.name && !evolution && !loadingEvolution) {
      setLoadingEvolution(true);
      supabase.functions.invoke('generate-timeline', { body: { objectName: object.name } })
        .then(({ data, error }) => {
          if (!error && data && !data.error && data.entries) {
            setEvolution(data.entries);
          }
        })
        .catch(() => {})
        .finally(() => setLoadingEvolution(false));
    }
  }, [object?.name]);

  const addStory = useMutation({
    mutationFn: async () => {
      const insertData: any = {
        user_id: user!.id,
        content: newStory,
        visibility: storyVisibility,
      };
      if (isPersonal) {
        insertData.personal_object_id = objectId;
      } else {
        insertData.object_id = objectId;
      }
      const { error } = await supabase.from('stories').insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Story added!');
      setNewStory('');
      queryClient.invalidateQueries({ queryKey: ['stories', objectId, source] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const playNarration = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    if (!object?.history) {
      toast.error('No history available to narrate');
      return;
    }

    setIsLoadingAudio(true);
    try {
      const narrationText = `${object.name}. ${object.description || ''} ${object.history}`;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/text-to-speech`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: narrationText }),
        }
      );
      if (!response.ok) throw new Error('TTS request failed');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => { setIsPlaying(false); audioRef.current = null; };
      await audio.play();
      setIsPlaying(true);
    } catch (err: any) {
      toast.error('Failed to play narration');
      console.error(err);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  const scrollEvo = (dir: 'left' | 'right') => {
    evoScrollRef.current?.scrollBy({ left: dir === 'left' ? -260 : 260, behavior: 'smooth' });
  };

  if (!object) return <div className="text-center text-muted-foreground py-12">Loading...</div>;

  const estimatedOrigin = (object as any).estimated_origin;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        {object.history && (
          <Button variant="outline" size="sm" onClick={playNarration} disabled={isLoadingAudio} className="gap-1.5">
            {isLoadingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {isLoadingAudio ? 'Loading…' : isPlaying ? 'Stop' : 'Listen'}
          </Button>
        )}
      </div>

      {/* Object info */}
      <div className="animate-reveal-up">
        {object.image_url && (
          <img src={object.image_url} alt={object.name} className="w-full aspect-video object-cover rounded-xl mb-6" />
        )}
        <h2 className="font-display text-3xl font-bold text-foreground leading-tight">{object.name}</h2>
        {estimatedOrigin && (
          <p className="text-sm text-primary font-mono font-semibold mt-2">Origin: {estimatedOrigin}</p>
        )}
        {object.description && <p className="text-muted-foreground mt-3 text-lg">{object.description}</p>}
      </div>

      {/* History */}
      {object.history && (
        <div className="animate-reveal-up stagger-1 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">History</h3>
          </div>
          <p className="text-foreground/80 leading-relaxed whitespace-pre-line">{object.history}</p>
        </div>
      )}

      {/* Evolution Timeline */}
      <div className="animate-reveal-up stagger-1 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">Evolution Timeline</h3>
          </div>
          {evolution && evolution.length > 0 && (
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => scrollEvo('left')}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button variant="outline" size="icon" className="w-7 h-7" onClick={() => scrollEvo('right')}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {loadingEvolution && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating evolution timeline…
          </div>
        )}

        {evolution && evolution.length > 0 && (
          <div ref={evoScrollRef} className="flex gap-0 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
            {evolution.map((entry, i) => {
              const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
              const isLast = i === evolution.length - 1;
              return (
                <div key={i} className="flex-shrink-0 flex flex-col items-center" style={{ width: 190 }}>
                  <p className="text-[10px] font-mono font-bold tracking-wider mb-1.5" style={{ color: color.bg }}>
                    {entry.year}
                  </p>
                  <div className="flex items-center w-full">
                    <div className="flex-1 h-0.5" style={{ backgroundColor: i === 0 ? 'transparent' : color.bg + '40' }} />
                    <div className="w-3.5 h-3.5 rounded-full border-2 flex-shrink-0" style={{ borderColor: color.bg, backgroundColor: color.light }}>
                      <Calendar className="w-2 h-2 m-auto mt-[1px]" style={{ color: color.bg }} />
                    </div>
                    <div className="flex-1 h-0.5" style={{ backgroundColor: isLast ? 'transparent' : color.bg + '40' }} />
                  </div>
                  <div className="mt-2 w-[175px] rounded-lg border px-3 py-2.5" style={{ borderColor: color.bg + '30', backgroundColor: color.light + '40' }}>
                    <h4 className="text-xs font-semibold text-foreground leading-tight">{entry.name}</h4>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{entry.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loadingEvolution && (!evolution || evolution.length === 0) && (
          <p className="text-sm text-muted-foreground text-center py-4">No evolution data available</p>
        )}
      </div>

      {/* Community Stories */}
      <StoriesSection
        stories={stories}
        objectId={objectId}
        isPersonal={isPersonal}
        source={source}
        user={user}
        queryClient={queryClient}
      />
    </div>
  );
}

/* ─── Stories Section ─── */
function StoriesSection({
  stories,
  objectId,
  isPersonal,
  source,
  user,
  queryClient,
}: {
  stories: any[] | undefined;
  objectId: string;
  isPersonal: boolean;
  source: string;
  user: any;
  queryClient: any;
}) {
  const [newStory, setNewStory] = useState('');
  const [storyVisibility, setStoryVisibility] = useState<'global' | 'family'>('global');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editVisibility, setEditVisibility] = useState<'global' | 'family'>('global');

  // Fetch family connections to determine name display
  const { data: familyIds } = useQuery({
    queryKey: ['family-ids', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_connections')
        .select('requester_id, target_id')
        .or(`requester_id.eq.${user!.id},target_id.eq.${user!.id}`);
      if (error) throw error;
      const ids = new Set<string>();
      data.forEach((c) => {
        ids.add(c.requester_id === user!.id ? c.target_id : c.requester_id);
      });
      return ids;
    },
    enabled: !!user,
  });

  const addStory = useMutation({
    mutationFn: async () => {
      const insertData: any = {
        user_id: user!.id,
        content: newStory,
        visibility: storyVisibility,
      };
      if (isPersonal) {
        insertData.personal_object_id = objectId;
      } else {
        insertData.object_id = objectId;
      }
      const { error } = await supabase.from('stories').insert(insertData);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Story published!');
      setNewStory('');
      queryClient.invalidateQueries({ queryKey: ['stories', objectId, source] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateStory = useMutation({
    mutationFn: async ({ id, content, visibility }: { id: string; content: string; visibility: string }) => {
      const { error } = await supabase
        .from('stories')
        .update({ content, visibility })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Story updated!');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['stories', objectId, source] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const getAuthorDisplay = (story: any) => {
    const profile = story.profiles as any;
    if (!profile) return 'Anonymous';
    const storyUserId = story.user_id;

    // Own story — show full name
    if (storyUserId === user?.id) {
      return profile.full_name || profile.display_name || 'You';
    }
    // Family member — show full name
    if (familyIds?.has(storyUserId)) {
      return profile.full_name || profile.display_name || 'Anonymous';
    }
    // Public viewer — show username
    return profile.username ? `@${profile.username}` : profile.display_name || 'Anonymous';
  };

  const startEdit = (story: any) => {
    setEditingId(story.id);
    setEditContent(story.content);
    setEditVisibility(story.visibility || 'global');
  };

  return (
    <div className="animate-reveal-up stagger-2 space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-accent" />
        <h3 className="font-display text-lg font-semibold text-foreground">
          Stories ({stories?.length ?? 0})
        </h3>
      </div>

      {stories?.map((story) => {
        const authorName = getAuthorDisplay(story);
        const vis = story.visibility;
        const isOwn = story.user_id === user?.id;
        const isEditing = editingId === story.id;

        return (
          <div key={story.id} className="bg-card border border-border rounded-lg p-4">
            {isEditing ? (
              <div className="space-y-3">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="bg-background"
                  rows={3}
                />
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">Visibility:</span>
                  <VisibilityToggle value={editVisibility} onChange={setEditVisibility} />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => updateStory.mutate({ id: story.id, content: editContent, visibility: editVisibility })}
                    disabled={!editContent.trim() || updateStory.isPending}
                    className="gap-1"
                  >
                    <Check className="w-3 h-3" /> {updateStory.isPending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-foreground/90 leading-relaxed">{story.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs text-muted-foreground">
                    by {authorName} · {new Date(story.created_at).toLocaleDateString()}
                  </p>
                  {vis === 'family' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                      <Lock className="w-2.5 h-2.5" /> Family only
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      <Globe className="w-2.5 h-2.5" /> Public
                    </span>
                  )}
                  {isOwn && (
                    <button
                      onClick={() => startEdit(story)}
                      className="ml-auto text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* Add story form */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="text-sm font-medium text-foreground mb-3">Share your story</h4>
        <Textarea
          value={newStory}
          onChange={(e) => setNewStory(e.target.value)}
          placeholder="What does this object mean to you?"
          className="bg-background mb-3"
          rows={3}
        />
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs text-muted-foreground">Who can see this?</span>
          <VisibilityToggle value={storyVisibility} onChange={setStoryVisibility} />
        </div>
        <Button
          onClick={() => addStory.mutate()}
          disabled={!newStory.trim() || addStory.isPending}
          size="sm"
        >
          {addStory.isPending ? 'Posting…' : 'Publish Story'}
        </Button>
      </div>
    </div>
  );
}

/* ─── Visibility Toggle ─── */
function VisibilityToggle({
  value,
  onChange,
}: {
  value: 'global' | 'family';
  onChange: (v: 'global' | 'family') => void;
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => onChange('global')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
          value === 'global'
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        <Globe className="w-3 h-3" /> Everyone
      </button>
      <button
        type="button"
        onClick={() => onChange('family')}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
          value === 'family'
            ? 'bg-accent text-accent-foreground'
            : 'bg-card text-muted-foreground hover:text-foreground'
        }`}
      >
        <Lock className="w-3 h-3" /> Family only
      </button>
    </div>
  );
}
