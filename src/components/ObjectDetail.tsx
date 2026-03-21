import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Users, Volume2, Loader2, VolumeX, Globe, Lock, Sparkles, Calendar, ChevronLeft, ChevronRight, Pencil, X, Check, UserCircle, Trash2 } from 'lucide-react';
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
  relatedImages?: { id: string; name: string; image_url: string }[];
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
      if (isPersonal) {
        const { data, error } = await supabase.rpc('get_personal_object_if_allowed', { p_object_id: objectId });
        if (error) throw error;
        if (!data || (Array.isArray(data) && data.length === 0)) throw new Error('Object not found or access denied');
        return Array.isArray(data) ? data[0] : data;
      }
      const { data, error } = await supabase.from('objects').select('*').eq('id', objectId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stories } = useQuery({
    queryKey: ['stories', objectId, source],
    queryFn: async () => {
      const col = isPersonal ? 'personal_object_id' : 'object_id';
      const { data: storyRows, error } = await supabase
        .from('stories')
        .select('*')
        .eq(col, objectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!storyRows || storyRows.length === 0) return [];

      // Batch-fetch author profiles
      const userIds = [...new Set(storyRows.map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, full_name, username')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      return storyRows.map((s) => ({ ...s, profiles: profileMap.get(s.user_id) || null }));
    },
  });

  // Fetch related community objects by name similarity
  const { data: communityObjects } = useQuery({
    queryKey: ['related-community-objects', object?.name],
    queryFn: async () => {
      if (!object?.name) return [];
      // Get all community objects, we'll match by name keywords
      const { data, error } = await supabase
        .from('objects')
        .select('id, name, image_url, description')
        .neq('id', objectId)
        .not('image_url', 'is', null)
        .limit(100);
      if (error) throw error;
      return data || [];
    },
    enabled: !!object?.name,
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

  // Match community images to timeline entries based on keyword similarity
  const enrichedEvolution = evolution?.map((entry) => {
    if (!communityObjects || communityObjects.length === 0) return entry;
    const entryWords = (entry.name + ' ' + entry.description).toLowerCase().split(/\s+/);
    const objectNameWords = (object?.name || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
    
    const matches = communityObjects.filter((co) => {
      const coName = co.name.toLowerCase();
      // Match if the community object name shares keywords with the timeline entry or the main object
      return objectNameWords.some((w: string) => coName.includes(w)) ||
             entryWords.some((w) => w.length > 3 && coName.includes(w));
    });
    
    return { ...entry, relatedImages: matches.length > 0 ? matches.slice(0, 3) : undefined };
  });

  const playNarration = async () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
      return;
    }

    // Build narration from all available text
    const parts = [object?.name, object?.description, object?.history].filter(Boolean);
    if (parts.length === 0) {
      toast.error('No content available to narrate');
      return;
    }

    setIsLoadingAudio(true);
    try {
      const narrationText = parts.join('. ');
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
      if (!response.ok) {
        const errBody = await response.text();
        console.error('TTS response:', response.status, errBody);
        throw new Error(`TTS request failed: ${response.status}`);
      }
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

  // Fetch current user's profile for display at top
  const { data: myProfile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, username, display_name')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Editing state
  const isOwner = (isPersonal && (object as any)?.user_id === user?.id) || (!isPersonal && (object as any)?.created_by === user?.id);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editOrigin, setEditOrigin] = useState('');
  const [editHistory, setEditHistory] = useState('');

  const startEditing = () => {
    setEditName(object.name || '');
    setEditDesc(object.description || '');
    setEditOrigin((object as any).estimated_origin || '');
    setEditHistory(object.history || '');
    setEditing(true);
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      const trimmedName = editName.trim();
      if (!trimmedName) throw new Error('Name is required');
      const table = isPersonal ? 'personal_objects' : 'objects';
      const updates: any = {
        name: trimmedName,
        description: editDesc.trim() || null,
        estimated_origin: editOrigin.trim() || null,
        history: editHistory.trim() || null,
      };
      const { error } = await supabase.from(table).update(updates).eq('id', objectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Object updated!');
      setEditing(false);
      setEvolution(null); // reset timeline so it regenerates
      queryClient.invalidateQueries({ queryKey: [isPersonal ? 'personal-object' : 'object', objectId] });
      queryClient.invalidateQueries({ queryKey: ['objects-search'] });
      queryClient.invalidateQueries({ queryKey: ['global-objects'] });
      queryClient.invalidateQueries({ queryKey: ['all-objects'] });
      queryClient.invalidateQueries({ queryKey: ['personal-objects'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!object) return <div className="text-center text-muted-foreground py-12">Loading...</div>;

  const estimatedOrigin = (object as any).estimated_origin;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* User identity bar */}
      {myProfile && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fade-in">
          <UserCircle className="w-4 h-4 text-primary" />
          <span className="font-medium text-foreground">{myProfile.full_name || myProfile.display_name}</span>
          {myProfile.username && <span className="font-mono">@{myProfile.username}</span>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-[0.97]"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          {isOwner && !editing && (
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          )}
          {isOwner && (
            <DeleteObjectButton
              objectId={objectId}
              table={isPersonal ? 'personal_objects' : 'objects'}
              onDeleted={onBack}
            />
          )}
          <Button variant="outline" size="sm" onClick={playNarration} disabled={isLoadingAudio} className="gap-1.5">
            {isLoadingAudio ? <Loader2 className="w-4 h-4 animate-spin" /> : isPlaying ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            {isLoadingAudio ? 'Loading…' : isPlaying ? 'Stop' : 'Listen'}
          </Button>
        </div>
      </div>

      {/* Object info — editable or read-only */}
      {editing ? (
        <div className="animate-fade-in rounded-xl border border-border bg-card p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" /> Edit Object
          </h3>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <Textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Describe this object…"
              rows={3}
              className="resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Estimated Origin</label>
            <input
              value={editOrigin}
              onChange={(e) => setEditOrigin(e.target.value)}
              placeholder="e.g. 1920s Japan"
              className="w-full h-9 px-3 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">History</label>
            <Textarea
              value={editHistory}
              onChange={(e) => setEditHistory(e.target.value)}
              placeholder="Tell the history of this object…"
              rows={5}
              className="resize-none"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => saveEdit.mutate()} disabled={saveEdit.isPending || !editName.trim()} className="gap-1.5">
              {saveEdit.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saveEdit.isPending ? 'Saving…' : 'Save'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="gap-1.5">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}

      {/* Evolution Timeline */}
      <div className="animate-reveal-up stagger-1 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">Evolution Timeline</h3>
          </div>
          {enrichedEvolution && enrichedEvolution.length > 0 && (
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

        {enrichedEvolution && enrichedEvolution.length > 0 && (
          <div ref={evoScrollRef} className="flex gap-0 overflow-x-auto pb-3" style={{ scrollbarWidth: 'none' }}>
            {enrichedEvolution.map((entry, i) => {
              const color = TIMELINE_COLORS[i % TIMELINE_COLORS.length];
              const isLast = i === enrichedEvolution.length - 1;
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
                    {entry.relatedImages && entry.relatedImages.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: color.bg }}>
                          From Community
                        </p>
                        <div className="flex gap-1 flex-wrap">
                          {entry.relatedImages.map((ri) => (
                            <div key={ri.id} className="relative group">
                              <img
                                src={ri.image_url}
                                alt={ri.name}
                                className="w-10 h-10 object-cover rounded border"
                                style={{ borderColor: color.bg + '40' }}
                              />
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-foreground text-background text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                {ri.name}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loadingEvolution && (!enrichedEvolution || enrichedEvolution.length === 0) && (
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

/* ─── Delete Object Button ─── */
function DeleteObjectButton({ objectId, table, onDeleted }: { objectId: string; table: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: async () => {
      // Delete related stories first
      const col = table === 'personal_objects' ? 'personal_object_id' : 'object_id';
      await supabase.from('stories').delete().eq(col, objectId);
      if (table === 'personal_objects') {
        const { error } = await supabase.from('personal_objects').delete().eq('id', objectId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('objects').delete().eq('id', objectId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Object deleted');
      queryClient.invalidateQueries({ queryKey: ['objects-search'] });
      queryClient.invalidateQueries({ queryKey: ['global-objects'] });
      queryClient.invalidateQueries({ queryKey: ['all-objects'] });
      queryClient.invalidateQueries({ queryKey: ['personal-objects'] });
      onDeleted();
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-destructive font-medium">Delete?</span>
        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => deleteMut.mutate()} disabled={deleteMut.isPending}>
          {deleteMut.isPending ? 'Deleting…' : 'Yes'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirming(false)}>No</Button>
      </div>
    );
  }

  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive gap-1.5" onClick={() => setConfirming(true)}>
      <Trash2 className="w-4 h-4" /> Delete
    </Button>
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
  const [storyVisibility, setStoryVisibility] = useState<'global' | 'family'>(isPersonal ? 'family' : 'global');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editVisibility, setEditVisibility] = useState<'global' | 'family'>(isPersonal ? 'family' : 'global');

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
                  <VisibilityToggle value={editVisibility} onChange={setEditVisibility} isPersonal={isPersonal} />
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
                      <Globe className="w-2.5 h-2.5" /> Community
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
          <VisibilityToggle value={storyVisibility} onChange={setStoryVisibility} isPersonal={isPersonal} />
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
  isPersonal = false,
}: {
  value: 'global' | 'family';
  onChange: (v: 'global' | 'family') => void;
  isPersonal?: boolean;
}) {
  if (isPersonal) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="w-3 h-3 text-accent" />
        <span className="font-medium text-accent">Family only</span>
        <span className="text-[10px]">(personal objects can't be shared publicly)</span>
      </div>
    );
  }

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
        <Globe className="w-3 h-3" /> Community
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
