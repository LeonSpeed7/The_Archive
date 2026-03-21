import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Share2, User, Copy, Check, Unlink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useConnections } from '@/components/FamilyConnections';

export default function FamilyTreeTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: connections = [], isLoading } = useConnections();
  const [showAddForm, setShowAddForm] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [safeword, setSafeword] = useState('');

  const connect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('connect_by_safeword', {
        p_safeword: safeword.trim(),
        p_nickname: memberName.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`${memberName.trim() || 'Family member'} added!`);
      setSafeword('');
      setMemberName('');
      setShowAddForm(false);
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
      toast.success('Member removed');
      queryClient.invalidateQueries({ queryKey: ['family-connections'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="animate-reveal-up flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">Family Tree</h2>
          <p className="text-muted-foreground mt-1">Connect with real family members by safeword</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add Member
        </Button>
      </div>

      {/* Add member via safeword */}
      {showAddForm && (
        <div className="animate-reveal-up bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Add a Family Member</h3>
          <p className="text-sm text-muted-foreground">
            Enter their name and safeword to connect. Once connected, you'll both see each other's archived objects in search results.
          </p>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Name *</label>
            <Input
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              placeholder="e.g. Grandma Rose, Uncle James…"
              className="bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Their safeword *</label>
            <Input
              value={safeword}
              onChange={(e) => setSafeword(e.target.value)}
              placeholder="Enter their safeword…"
              className="bg-background"
              onKeyDown={(e) => e.key === 'Enter' && safeword.trim() && memberName.trim() && connect.mutate()}
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => connect.mutate()}
              disabled={!safeword.trim() || !memberName.trim() || connect.isPending}
            >
              {connect.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Connected Members List */}
      <div className="animate-reveal-up stagger-1 space-y-3">
        {isLoading && <p className="text-muted-foreground text-center py-8">Loading…</p>}

        {!isLoading && connections.length === 0 && !showAddForm && (
          <div className="text-center py-16">
            <User className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No family members connected yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Click "Add Member" and enter a family member's safeword to connect
            </p>
          </div>
        )}

        {(connections as any[]).map((c) => (
          <div
            key={c.id}
            className="bg-card border border-border rounded-xl p-5 flex items-center gap-4 hover:shadow-md hover:shadow-foreground/5 transition-all duration-300"
          >
            <div className="w-11 h-11 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-accent" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{c.nickname || c.connected_name}</p>
              <p className="text-xs text-muted-foreground">{c.connected_name} · Connected family member</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={() => disconnect.mutate(c.id)}
            >
              <Unlink className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
