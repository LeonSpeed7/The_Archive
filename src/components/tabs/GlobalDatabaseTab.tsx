import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { Search, Archive } from 'lucide-react';
import { Input } from '@/components/ui/input';
import ObjectDetail from '@/components/ObjectDetail';

export default function GlobalDatabaseTab() {
  const [search, setSearch] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);

  const { data: objects, isLoading } = useQuery({
    queryKey: ['all-objects', search],
    queryFn: async () => {
      let query = supabase.from('objects').select('*').order('created_at', { ascending: false });
      if (search.trim()) {
        query = query.ilike('name', `%${search}%`);
      }
      const { data, error } = await query.limit(50);
      if (error) throw error;
      return data;
    },
  });

  if (selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} onBack={() => setSelectedObjectId(null)} />;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">Global Archive</h2>
        <p className="text-muted-foreground mt-1">Explore objects shared by the community</p>
      </div>

      <div className="animate-reveal-up stagger-1 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the archive..."
          className="pl-10 bg-background"
        />
      </div>

      <div className="animate-reveal-up stagger-2 space-y-3">
        {isLoading && <p className="text-muted-foreground text-center py-8">Loading archive...</p>}
        {objects && objects.length === 0 && (
          <div className="text-center py-16">
            <Archive className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No objects found</p>
            <p className="text-sm text-muted-foreground/70 mt-1">
              Be the first to add one via the AR Camera tab
            </p>
          </div>
        )}
        {objects?.map((obj) => (
          <button
            key={obj.id}
            onClick={() => setSelectedObjectId(obj.id)}
            className="w-full text-left bg-card border border-border rounded-xl p-5 hover:shadow-md hover:shadow-foreground/5 transition-all duration-[var(--duration-state)] active:scale-[0.99] group"
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
        ))}
      </div>
    </div>
  );
}
