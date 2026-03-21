import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Link2, Unlink, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function useConnections() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['family-connections', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_connections')
        .select('*')
        .or(`requester_id.eq.${user!.id},target_id.eq.${user!.id}`);
      if (error) throw error;
      const connectedIds = data.map(c =>
        c.requester_id === user!.id ? c.target_id : c.requester_id
      );
      if (connectedIds.length === 0) return [];
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('user_id, display_name, full_name, username')
        .in('user_id', connectedIds);
      if (pErr) throw pErr;
      return data.map(c => {
        const otherId = c.requester_id === user!.id ? c.target_id : c.requester_id;
        const profile = profiles?.find(p => p.user_id === otherId);
        return {
          ...c,
          connected_user_id: otherId,
          connected_name: profile?.full_name || profile?.display_name || 'Unknown',
          connected_username: profile?.username || '',
          relationship: (c as any).relationship || 'other',
        };
      });
    },
    enabled: !!user,
  });
}

export default function FamilyConnections() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: connections = [] } = useConnections();
  const [safeword, setSafeword] = useState('');
  const [username, setUsername] = useState('');
  const [showForm, setShowForm] = useState(false);

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('connect_by_safeword', {
        p_safeword: safeword.trim(),
        p_username: username.trim().toLowerCase(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Family member connected!');
      setSafeword('');
      setUsername('');
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['family-connections'] });
    },
    onError: (err: any) => toast.error(err.message || 'Connection failed'),
  });

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) => {
      const { error } = await supabase.from('family_connections').delete().eq('id', connectionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Connection removed');
      queryClient.invalidateQueries({ queryKey: ['family-connections'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-accent" />
          <h3 className="font-display text-base font-semibold text-foreground">Family Connections</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowForm(!showForm)}>
          <UserPlus className="w-4 h-4 mr-1.5" />
          Connect
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter a family member's username and safeword to connect.
          </p>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="Their username"
            className="bg-background font-mono"
          />
          <div className="flex gap-2">
            <Input
              value={safeword}
              onChange={(e) => setSafeword(e.target.value)}
              placeholder="Their safeword"
              className="bg-background"
            />
            <Button
              onClick={() => connect.mutate()}
              disabled={!safeword.trim() || !username.trim() || connect.isPending}
            >
              {connect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </Button>
          </div>
        </div>
      )}

      {connections.length > 0 && (
        <div className="space-y-2">
          {connections.map((c: any) => (
            <div key={c.id} className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">{c.connected_name}</p>
                <p className="text-xs text-muted-foreground">@{c.connected_username} · Connected family member</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => disconnect.mutate(c.id)}
              >
                <Unlink className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {connections.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">No family connections yet.</p>
      )}
    </div>
  );
}
