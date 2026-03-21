import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Clock, Users, Volume2, Loader2, VolumeX, Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface Props {
  objectId: string;
  onBack: () => void;
}

export default function ObjectDetail({ objectId, onBack }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newStory, setNewStory] = useState('');
  const [storyVisibility, setStoryVisibility] = useState<'global' | 'family'>('global');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: object } = useQuery({
    queryKey: ['object', objectId],
    queryFn: async () => {
      const { data, error } = await supabase.from('objects').select('*').eq('id', objectId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: stories } = useQuery({
    queryKey: ['stories', objectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stories')
        .select('*, profiles:user_id(display_name, full_name)')
        .eq('object_id', objectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const addStory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('stories').insert({
        object_id: objectId,
        user_id: user!.id,
        content: newStory,
        visibility: storyVisibility,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Story added!');
      setNewStory('');
      queryClient.invalidateQueries({ queryKey: ['stories', objectId] });
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

      audio.onended = () => {
        setIsPlaying(false);
        audioRef.current = null;
      };

      await audio.play();
      setIsPlaying(true);
    } catch (err: any) {
      toast.error('Failed to play narration');
      console.error(err);
    } finally {
      setIsLoadingAudio(false);
    }
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
          <Button
            variant="outline"
            size="sm"
            onClick={playNarration}
            disabled={isLoadingAudio}
            className="gap-1.5"
          >
            {isLoadingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
            {isLoadingAudio ? 'Loading…' : isPlaying ? 'Stop' : 'Listen'}
          </Button>
        )}
      </div>

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

      {/* History Section */}
      {object.history && (
        <div className="animate-reveal-up stagger-1 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">History</h3>
          </div>
          <p className="text-foreground/80 leading-relaxed whitespace-pre-line">{object.history}</p>
        </div>
      )}

      {/* Community Stories */}
      <div className="animate-reveal-up stagger-2 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-accent" />
          <h3 className="font-display text-lg font-semibold text-foreground">
            Stories ({stories?.length ?? 0})
          </h3>
        </div>

        {stories?.map((story) => {
          const authorName = (story.profiles as any)?.full_name || (story.profiles as any)?.display_name || 'Anonymous';
          const vis = (story as any).visibility;
          return (
            <div key={story.id} className="bg-card border border-border rounded-lg p-4">
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
              </div>
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

          {/* Visibility toggle */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs text-muted-foreground">Who can see this?</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setStoryVisibility('global')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                  storyVisibility === 'global'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <Globe className="w-3 h-3" />
                Everyone
              </button>
              <button
                type="button"
                onClick={() => setStoryVisibility('family')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${
                  storyVisibility === 'family'
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <Lock className="w-3 h-3" />
                Family only
              </button>
            </div>
          </div>

          <Button
            onClick={() => addStory.mutate()}
            disabled={!newStory.trim() || addStory.isPending}
            size="sm"
          >
            {addStory.isPending ? 'Posting...' : 'Add Story'}
          </Button>
        </div>
      </div>
    </div>
  );
}
