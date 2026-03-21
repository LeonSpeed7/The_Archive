import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Share2, User, Copy, Check, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import FamilyConnections from '@/components/FamilyConnections';

export default function FamilyTreeTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberRelationship, setMemberRelationship] = useState('');
  const [memberBio, setMemberBio] = useState('');
  const [memberBirthYear, setMemberBirthYear] = useState('');
  const [memberParentId, setMemberParentId] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  // Get or create family tree
  const { data: tree } = useQuery({
    queryKey: ['family-tree', user?.id],
    queryFn: async () => {
      const { data: existing } = await supabase
        .from('family_trees')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (existing) return existing;

      const { data: created, error } = await supabase
        .from('family_trees')
        .insert({ user_id: user!.id, name: 'My Family Tree' })
        .select()
        .single();
      if (error) throw error;
      return created;
    },
    enabled: !!user,
  });

  const { data: members } = useQuery({
    queryKey: ['family-members', tree?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('tree_id', tree!.id)
        .order('created_at');
      if (error) throw error;
      return data;
    },
    enabled: !!tree,
  });

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('family_members').insert({
        tree_id: tree!.id,
        name: memberName,
        relationship: memberRelationship || null,
        bio: memberBio || null,
        birth_year: memberBirthYear ? parseInt(memberBirthYear) : null,
        parent_id: memberParentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Family member added!');
      setMemberName('');
      setMemberRelationship('');
      setMemberBio('');
      setMemberBirthYear('');
      setMemberParentId(null);
      setShowAddMember(false);
      queryClient.invalidateQueries({ queryKey: ['family-members'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleShare = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('family_trees')
        .update({ is_shared: !tree!.is_shared })
        .eq('id', tree!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-tree'] });
      toast.success(tree?.is_shared ? 'Tree is now private' : 'Tree is now shared!');
    },
  });

  const copyShareLink = () => {
    const link = `${window.location.origin}/shared/${tree?.share_token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied!');
  };

  // Build tree structure
  const rootMembers = members?.filter((m) => !m.parent_id) ?? [];
  const getChildren = (parentId: string) => members?.filter((m) => m.parent_id === parentId) ?? [];

  const renderMember = (member: any, depth = 0) => (
    <div key={member.id} style={{ marginLeft: depth * 24 }}>
      <button
        onClick={() => setSelectedMember(member)}
        className="w-full text-left bg-card border border-border rounded-lg p-4 hover:shadow-md hover:shadow-foreground/5 transition-all duration-[var(--duration-state)] active:scale-[0.99] group mb-2"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
            <User className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground group-hover:text-primary transition-colors">{member.name}</p>
            <p className="text-xs text-muted-foreground">
              {member.relationship}
              {member.birth_year && ` · b. ${member.birth_year}`}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
        </div>
      </button>
      {getChildren(member.id).map((child) => renderMember(child, depth + 1))}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="animate-reveal-up flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold text-foreground">Family Tree</h2>
          <p className="text-muted-foreground mt-1">Your private family history</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => toggleShare.mutate()}>
            <Share2 className="w-4 h-4 mr-1.5" />
            {tree?.is_shared ? 'Make Private' : 'Share'}
          </Button>
          <Button size="sm" onClick={() => setShowAddMember(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Member
          </Button>
        </div>
      </div>

      {/* Share link */}
      {tree?.is_shared && (
        <div className="animate-reveal-up bg-accent/10 border border-accent/20 rounded-lg p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Tree is shared</p>
            <p className="text-xs text-muted-foreground mt-0.5">Anyone with the link can view</p>
          </div>
          <Button variant="outline" size="sm" onClick={copyShareLink}>
            {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </div>
      )}

      {/* Add Member Form */}
      {showAddMember && (
        <div className="animate-reveal-up bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">New Family Member</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Name *</label>
              <Input
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Full name"
                className="bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Relationship</label>
              <Input
                value={memberRelationship}
                onChange={(e) => setMemberRelationship(e.target.value)}
                placeholder="e.g. Grandmother"
                className="bg-background"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Birth Year</label>
            <Input
              type="number"
              value={memberBirthYear}
              onChange={(e) => setMemberBirthYear(e.target.value)}
              placeholder="e.g. 1945"
              className="bg-background w-40"
            />
          </div>
          {members && members.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Parent (optional)</label>
              <select
                value={memberParentId ?? ''}
                onChange={(e) => setMemberParentId(e.target.value || null)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">None (root)</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Bio</label>
            <Textarea
              value={memberBio}
              onChange={(e) => setMemberBio(e.target.value)}
              placeholder="A few words about this person..."
              className="bg-background"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => addMember.mutate()} disabled={!memberName.trim() || addMember.isPending}>
              {addMember.isPending ? 'Adding...' : 'Add Member'}
            </Button>
            <Button variant="ghost" onClick={() => setShowAddMember(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Tree View */}
      <div className="animate-reveal-up stagger-2 space-y-2">
        {members && members.length === 0 && (
          <div className="text-center py-16">
            <User className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Your family tree is empty</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Add your first family member to begin</p>
          </div>
        )}
        {rootMembers.map((member) => renderMember(member))}
      </div>

      {/* Member Detail Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={(open) => !open && setSelectedMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">{selectedMember?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {selectedMember?.relationship && (
              <p className="text-sm text-muted-foreground">{selectedMember.relationship}</p>
            )}
            {selectedMember?.birth_year && (
              <p className="text-sm text-muted-foreground">Born: {selectedMember.birth_year}</p>
            )}
            {selectedMember?.bio && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Bio</h4>
                <p className="text-foreground/80 leading-relaxed">{selectedMember.bio}</p>
              </div>
            )}
            {!selectedMember?.bio && !selectedMember?.birth_year && (
              <p className="text-muted-foreground text-sm italic">No additional details yet.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
