import { useState, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Upload, Plus, Link2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import ObjectDetail from '@/components/ObjectDetail';

export default function ARCameraTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [objectName, setObjectName] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newHistory, setNewHistory] = useState('');
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: searchResults } = useQuery({
    queryKey: ['objects-search', objectName],
    queryFn: async () => {
      if (!objectName.trim()) return [];
      const { data, error } = await supabase
        .from('objects')
        .select('*')
        .ilike('name', `%${objectName}%`)
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: objectName.trim().length > 1,
  });

  const createObject = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .insert({
          name: objectName,
          description: newDescription,
          history: newHistory,
          image_url: capturedImage,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('Object added to the archive!');
      setSelectedObjectId(data.id);
      setShowCreate(false);
      setNewDescription('');
      setNewHistory('');
      queryClient.invalidateQueries({ queryKey: ['objects-search'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setCapturedImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  if (selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} onBack={() => setSelectedObjectId(null)} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">AR Camera</h2>
        <p className="text-muted-foreground mt-1">Capture or upload an object to explore its history</p>
      </div>

      {/* Camera / Upload Area */}
      <div className="animate-reveal-up stagger-1">
        <div
          onClick={() => fileInputRef.current?.click()}
          className="relative border-2 border-dashed border-border rounded-xl aspect-video flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-secondary/50 transition-all duration-[var(--duration-state)] group"
        >
          {capturedImage ? (
            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover rounded-xl" />
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <Camera className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Tap to upload a photo</p>
                <p className="text-xs text-muted-foreground mt-0.5">or drag and drop an image</p>
              </div>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {/* Object Name Input */}
      <div className="animate-reveal-up stagger-2 space-y-3">
        <label className="block text-sm font-medium text-foreground">What is this object?</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={objectName}
            onChange={(e) => setObjectName(e.target.value)}
            placeholder="e.g. Grandmother's silver locket"
            className="pl-10 bg-background"
          />
        </div>

        {/* Search Results */}
        {searchResults && searchResults.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <p className="text-xs text-muted-foreground px-4 py-2 border-b border-border">
              Found in archive
            </p>
            {searchResults.map((obj) => (
              <button
                key={obj.id}
                onClick={() => setSelectedObjectId(obj.id)}
                className="w-full text-left px-4 py-3 hover:bg-secondary/60 transition-colors border-b border-border last:border-0 active:scale-[0.99]"
              >
                <p className="text-sm font-medium text-foreground">{obj.name}</p>
                {obj.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{obj.description}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {objectName.trim() && searchResults && searchResults.length === 0 && !showCreate && (
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add "{objectName}" to the archive
          </Button>
        )}
      </div>

      {/* Create Object Form */}
      {showCreate && (
        <div className="animate-reveal-up bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">Add to Archive</h3>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
            <Textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe the object..."
              className="bg-background"
              rows={3}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Historical context</label>
            <Textarea
              value={newHistory}
              onChange={(e) => setNewHistory(e.target.value)}
              placeholder="What is the history behind this object?"
              className="bg-background"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => createObject.mutate()} disabled={createObject.isPending}>
              {createObject.isPending ? 'Saving...' : 'Save to Archive'}
            </Button>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
