import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Shield, Check, Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function useSafeword() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile-safeword', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('safeword')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data?.safeword as string | null;
    },
    enabled: !!user,
  });
}

export default function SafewordSetup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [word, setWord] = useState('');
  const [showWord, setShowWord] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = word.trim();
      if (trimmed.length < 4) throw new Error('Safeword must be at least 4 characters');
      const { error } = await supabase
        .from('profiles')
        .update({ safeword: trimmed })
        .eq('user_id', user!.id);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          throw new Error('That safeword is already taken. Choose another.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Safeword saved!');
      queryClient.invalidateQueries({ queryKey: ['profile-safeword'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="bg-accent/10 border border-accent/20 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Shield className="w-5 h-5 text-accent" />
        <h3 className="font-display text-base font-semibold text-foreground">Set your safeword</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Family members need your safeword to connect with you. Choose something only trusted people would know.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={showWord ? 'text' : 'password'}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder="Enter a unique safeword…"
            className="bg-background pr-10"
            minLength={4}
          />
          <button
            type="button"
            onClick={() => setShowWord(!showWord)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showWord ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <Button onClick={() => save.mutate()} disabled={word.trim().length < 4 || save.isPending}>
          {save.isPending ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

export function SafewordDisplay() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: safeword } = useSafeword();
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newWord, setNewWord] = useState('');

  const update = useMutation({
    mutationFn: async () => {
      const trimmed = newWord.trim();
      if (trimmed.length < 4) throw new Error('Safeword must be at least 4 characters');
      const { error } = await supabase
        .from('profiles')
        .update({ safeword: trimmed })
        .eq('user_id', user!.id);
      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          throw new Error('That safeword is already taken. Choose another.');
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Safeword updated!');
      setEditing(false);
      setNewWord('');
      queryClient.invalidateQueries({ queryKey: ['profile-safeword'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  if (!safeword) return null;

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <Shield className="w-4 h-4 text-accent" />
        <div className="relative">
          <Input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="New safeword…"
            className="h-8 text-xs bg-background w-40"
            minLength={4}
            autoFocus
          />
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => update.mutate()} disabled={newWord.trim().length < 4 || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setEditing(false); setNewWord(''); }}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <Shield className="w-4 h-4 text-accent" />
      <span className="text-muted-foreground">Your safeword:</span>
      <code className="bg-secondary px-2 py-0.5 rounded text-foreground font-mono text-xs">
        {visible ? safeword : '••••••'}
      </code>
      <button onClick={() => setVisible(!visible)} className="text-muted-foreground hover:text-foreground">
        {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      </button>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-primary hover:text-primary/80 font-medium transition-colors ml-1"
      >
        Change
      </button>
    </div>
  );
}
