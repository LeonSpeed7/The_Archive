import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, BookLock, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import ObjectDetail from '@/components/ObjectDetail';

export default function PersonalDatabaseTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'personal' | 'detail'>('personal');

  const { data: objects, isLoading } = useQuery({
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
      const { data, error } = await query.limit(50);
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

  if (viewMode === 'detail' && selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} onBack={() => { setViewMode('personal'); setSelectedObjectId(null); }} />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">Personal Archive</h2>
        <p className="text-muted-foreground mt-1">Your private collection of identified objects</p>
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

      <div className="animate-reveal-up stagger-2 space-y-3">
        {isLoading && <p className="text-muted-foreground text-center py-8">Loading...</p>}
        {objects && objects.length === 0 && (
          <div className="text-center py-16">
            <BookLock className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">Your personal archive is empty</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Use the AR Camera to identify objects and save them here
            </p>
          </div>
        )}
        {objects?.map((obj) => (
          <div
            key={obj.id}
            className="w-full text-left bg-card border border-border rounded-xl p-5 hover:shadow-md hover:shadow-foreground/5 transition-all duration-300 group flex items-start gap-4"
          >
            <button
              onClick={() => { setSelectedObjectId(obj.id); setViewMode('detail'); }}
              className="flex-1 text-left min-w-0 active:scale-[0.99]"
            >
              <div className="flex gap-4 items-start">
                {obj.image_url && (
                  <img src={obj.image_url} alt={obj.name} className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {obj.name}
                  </h3>
                  {obj.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{obj.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground/70 mt-2">
                    Added {new Date(obj.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive flex-shrink-0"
              onClick={() => deleteObject.mutate(obj.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
