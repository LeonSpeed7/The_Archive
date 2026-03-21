import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Upload, Sparkles, Loader2, X, Globe, BookLock } from 'lucide-react';
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
  const [userDescription, setUserDescription] = useState('');
  const [aiResult, setAiResult] = useState<{ name: string; description: string; history: string } | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<'global' | 'personal'>('global');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      toast.error('Could not access camera. Please check permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
  }, [cameraStream]);

  const captureFromCamera = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
  }, [stopCamera]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCapturedImage(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const identifyObject = async () => {
    if (!capturedImage) {
      toast.error('Please capture or upload a photo first.');
      return;
    }
    setIsIdentifying(true);
    setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('identify-object', {
        body: { imageBase64: capturedImage, userHint: objectName || undefined },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setAiResult(data);
      if (data.name) setObjectName(data.name);
      toast.success('Object identified!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to identify object');
    } finally {
      setIsIdentifying(false);
    }
  };

  const saveToDatabase = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .insert({
          name: objectName || aiResult?.name || 'Unknown Object',
          description: userDescription || aiResult?.description || null,
          history: aiResult?.history || null,
          image_url: capturedImage,
          created_by: user!.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success('Saved to the Global Archive!');
      setSelectedObjectId(data.id);
      queryClient.invalidateQueries({ queryKey: ['objects-search'] });
      queryClient.invalidateQueries({ queryKey: ['global-objects'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const resetAll = () => {
    setCapturedImage(null);
    setObjectName('');
    setUserDescription('');
    setAiResult(null);
    stopCamera();
  };

  if (selectedObjectId) {
    return <ObjectDetail objectId={selectedObjectId} onBack={() => setSelectedObjectId(null)} />;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <canvas ref={canvasRef} className="hidden" />

      <div className="animate-reveal-up">
        <h2 className="font-display text-2xl font-semibold text-foreground">AR Camera</h2>
        <p className="text-muted-foreground mt-1">Capture or upload an object — AI will identify it</p>
      </div>

      {/* Camera / Upload Selector */}
      {!capturedImage && !cameraStream && (
        <div className="animate-reveal-up stagger-1 grid grid-cols-2 gap-4">
          <button
            onClick={startCamera}
            className="group relative border-2 border-dashed border-border rounded-xl aspect-[4/3] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-secondary/50 transition-all duration-300 active:scale-[0.97]"
          >
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Camera className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Use Camera</p>
            <p className="text-xs text-muted-foreground">Take a photo live</p>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="group relative border-2 border-dashed border-border rounded-xl aspect-[4/3] flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary/40 hover:bg-secondary/50 transition-all duration-300 active:scale-[0.97]"
          >
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center group-hover:bg-primary/10 transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary" />
            </div>
            <p className="text-sm font-medium text-foreground">Upload Photo</p>
            <p className="text-xs text-muted-foreground">From your gallery</p>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </div>
      )}

      {/* Live Camera View */}
      {cameraStream && !capturedImage && (
        <div className="animate-reveal-up stagger-1 space-y-3">
          <div className="relative rounded-xl overflow-hidden border border-border">
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />
          </div>
          <div className="flex gap-2">
            <Button onClick={captureFromCamera} className="flex-1">
              <Camera className="w-4 h-4 mr-1.5" /> Capture
            </Button>
            <Button variant="ghost" onClick={stopCamera}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Captured Image Preview */}
      {capturedImage && (
        <div className="animate-reveal-up stagger-1 relative">
          <img src={capturedImage} alt="Captured" className="w-full aspect-video object-cover rounded-xl border border-border" />
          <button
            onClick={resetAll}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors active:scale-[0.95]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Object Name & Description Inputs */}
      {capturedImage && (
        <div className="animate-reveal-up stagger-2 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Object name <span className="text-muted-foreground font-normal">(optional — AI will identify it)</span>
            </label>
            <Input
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
              placeholder="e.g. Silver locket, WWII compass..."
              className="bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Your notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder="Any context you'd like to add..."
              className="bg-background"
              rows={2}
            />
          </div>

          {/* Identify Button */}
          {!aiResult && (
            <Button onClick={identifyObject} disabled={isIdentifying} className="w-full" size="lg">
              {isIdentifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Identifying...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1.5" /> Identify with AI
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {/* AI Result */}
      {aiResult && (
        <div className="animate-reveal-up bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="font-display text-lg font-semibold text-foreground">AI Identification</h3>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Object</p>
            <p className="text-foreground font-medium text-lg">{aiResult.name}</p>
          </div>
          {aiResult.description && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Description</p>
              <p className="text-foreground/80">{aiResult.description}</p>
            </div>
          )}
          {aiResult.history && (
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Historical Background</p>
              <p className="text-foreground/80 leading-relaxed whitespace-pre-line">{aiResult.history}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button onClick={() => saveToDatabase.mutate()} disabled={saveToDatabase.isPending} className="flex-1">
              {saveToDatabase.isPending ? 'Saving...' : 'Save to Global Archive'}
            </Button>
            <Button variant="outline" onClick={resetAll}>
              Start Over
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
