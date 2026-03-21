import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, BookLock, Globe, Users, Trash2, ArrowUpDown, Calendar, Tag, Sparkles } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import ObjectDetail from '@/components/ObjectDetail';

type SortKey = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc';

function sortObjects(items: any[], sortKey: SortKey) {
  return [...items].sort((a, b) => {
    switch (sortKey) {
      case 'date-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case 'date-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'name-asc': return a.name.localeCompare(b.name);
      case 'name-desc': return b.name.localeCompare(a.name);
      default: return 0;
    }
  });
}

export default function PersonalDatabaseTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'personal' | 'detail'>('personal');
  const [familySort, setFamilySort] = useState<SortKey>('date-desc');
  const [publicSort, setPublicSort] = useState<SortKey>('date-desc');

  const { data: personalObjects, isLoading } = useQuery({
    queryKey: ['personal-objects', search, user?.id],
    queryFn: async () => {
      let query = supabase
        .from('personal_objects')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (search.trim()) {
        query = query.ilike('name', `%${search}%`);
      }
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch user's public community objects
  const { data: publicObjects } = useQuery({
    queryKey: ['my-public-objects', search, user?.id],
    queryFn: async () => {
      let query = supabase
        .from('objects')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false });
      if (search.trim()) {
        query = query.ilike('name', `%${search}%`);
      }
      const { data, error } = await query.limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const deleteObject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('personal_objects').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Object removed from personal archive');
      queryClient.invalidateQueries({ queryKey: ['personal-objects'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleVisibility = useMutation({
    mutationFn: async ({ id, visibility }: { id: string; visibility: string }) => {
      const newVis = visibility === 'family' ? 'public' : 'family';
      const { error } = await supabase.from('personal_objects').update({ visibility: newVis } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personal-objects'] });
      toast.success('Visibility updated');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const familyItems = useMemo(() => {
    const items = personalObjects?.filter((o: any) => (o as any).visibility !== 'public') ?? [];
    return sortObjects(items, familySort);
  }, [personalObjects, familySort]);

  const publicItems = useMemo(() => {
    // Personal objects marked public + community objects created by user
    const personalPublic = personalObjects?.filter((o: any) => (o as any).visibility === 'public').map((o: any) => ({ ...o, _source: 'personal' })) ?? [];
    const communityOwn = publicObjects?.map((o: any) => ({ ...o, _source: 'community', visibility: 'public' })) ?? [];
    // Deduplicate by name+image in case same object exists in both
    const combined = [...personalPublic, ...communityOwn];
    return sortObjects(combined, publicSort);
  }, [personalObjects, publicObjects, publicSort]);

  const [selectedSource, setSelectedSource] = useState<'personal' | 'community'>('personal');

  if (viewMode === 'detail' && selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} source={selectedSource === 'community' ? 'global' : 'personal'} onBack={() => { setViewMode('personal'); setSelectedObjectId(null); }} />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">Personal Archive</h2>
        <p className="text-muted-foreground mt-1">Your private collection, organized by visibility</p>
      </div>

      <div className="animate-reveal-up stagger-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your archive..."
          className="pl-10 bg-background"
        />
      </div>

      {isLoading && <p className="text-muted-foreground text-center py-8">Loading...</p>}

      <div className="animate-reveal-up stagger-2 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Family-Only Column */}
        <VisibilityColumn
          title="Family Only"
          icon={<Users className="w-4 h-4" />}
          description="Visible only to your family connections"
          badgeVariant="secondary"
          items={familyItems}
          sortKey={familySort}
          onSortChange={setFamilySort}
          onSelect={(id, obj) => { setSelectedSource(obj?._source === 'community' ? 'community' : 'personal'); setSelectedObjectId(id); setViewMode('detail'); }}
          onDelete={(id) => deleteObject.mutate(id)}
          onToggleVisibility={(id, vis) => toggleVisibility.mutate({ id, visibility: vis })}
          toggleLabel="Move to Public"
          emptyIcon={<Users className="w-8 h-8 text-muted-foreground/30" />}
          emptyText="No family-only items yet"
        />

        {/* Public Column */}
        <VisibilityColumn
          title="Public"
          icon={<Globe className="w-4 h-4" />}
          description="Visible to everyone"
          badgeVariant="default"
          items={publicItems}
          sortKey={publicSort}
          onSortChange={setPublicSort}
          onSelect={(id, obj) => { setSelectedSource(obj?._source === 'community' ? 'community' : 'personal'); setSelectedObjectId(id); setViewMode('detail'); }}
          onDelete={(id) => deleteObject.mutate(id)}
          onToggleVisibility={(id, vis) => toggleVisibility.mutate({ id, visibility: vis })}
          toggleLabel="Move to Family"
          emptyIcon={<Globe className="w-8 h-8 text-muted-foreground/30" />}
          emptyText="No public items yet"
        />
      </div>
    </div>
  );
}

function VisibilityColumn({
  title, icon, description, badgeVariant, items, sortKey, onSortChange,
  onSelect, onDelete, onToggleVisibility, toggleLabel, emptyIcon, emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  badgeVariant: 'default' | 'secondary';
  items: any[];
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string, vis: string) => void;
  toggleLabel: string;
  emptyIcon: React.ReactNode;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <h3 className="font-display font-semibold text-foreground">{title}</h3>
          <Badge variant={badgeVariant} className="ml-auto text-xs tabular-nums">
            {items.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Sort bar */}
      <div className="px-4 py-2 border-b border-border/50 bg-muted/30">
        <Select value={sortKey} onValueChange={(v) => onSortChange(v as SortKey)}>
          <SelectTrigger className="h-8 text-xs w-full bg-transparent border-0 shadow-none focus:ring-0">
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date-desc">Newest first</SelectItem>
            <SelectItem value="date-asc">Oldest first</SelectItem>
            <SelectItem value="name-asc">Name A–Z</SelectItem>
            <SelectItem value="name-desc">Name Z–A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto max-h-[60vh] p-3 space-y-2">
        {items.length === 0 && (
          <div className="text-center py-12 space-y-2">
            {emptyIcon}
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        )}
        {items.map((obj: any) => (
          <div
            key={obj.id}
            className="group rounded-xl border border-border bg-background p-3 hover:shadow-md hover:shadow-foreground/5 transition-all duration-300"
          >
            <button
              onClick={() => onSelect(obj.id)}
              className="w-full text-left active:scale-[0.98] transition-transform"
            >
              <div className="flex gap-3 items-start">
                {obj.image_url && (
                  <img src={obj.image_url} alt={obj.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
                    {obj.name}
                  </h4>
                  {obj.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{obj.description}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/60 mt-1 tabular-nums">
                    {new Date(obj.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </button>
            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-primary flex-1"
                onClick={() => onToggleVisibility(obj.id, obj.visibility ?? 'family')}
              >
                {obj.visibility === 'public' ? <Users className="w-3 h-3 mr-1" /> : <Globe className="w-3 h-3 mr-1" />}
                {toggleLabel}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(obj.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
