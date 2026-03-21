import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Upload, Sparkles, Loader2, X, Globe, BookLock, Aperture, ImagePlus, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import ObjectDetail from '@/components/ObjectDetail';

const MAX_AI_USES = 10;

export default function ARCameraTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [objectName, setObjectName] = useState('');
  const [userDescription, setUserDescription] = useState('');
  const [aiResult, setAiResult] = useState<{ name: string; description: string; history: string; estimated_origin?: string } | null>(null);
  const [isIdentifying, setIsIdentifying] = useState(false);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<'global' | 'personal'>('global');
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { data: usageCount = 0 } = useQuery({
    queryKey: ['ai-usage', user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('ai_usage')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user!.id);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  const remainingUses = MAX_AI_USES - usageCount;

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCameraStream(stream);
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

  const cropImageToBox = (imageDataUrl: string, crop: number[]): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const [xMin, yMin, xMax, yMax] = crop;
        const sx = Math.max(0, Math.floor(xMin * img.width));
        const sy = Math.max(0, Math.floor(yMin * img.height));
        const sw = Math.min(img.width - sx, Math.floor((xMax - xMin) * img.width));
        const sh = Math.min(img.height - sy, Math.floor((yMax - yMin) * img.height));
        if (sw <= 0 || sh <= 0) { resolve(imageDataUrl); return; }
        const cv = document.createElement('canvas');
        cv.width = sw;
        cv.height = sh;
        cv.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        resolve(cv.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => reject(new Error('Failed to load image for cropping'));
      img.src = imageDataUrl;
    });
  };

  const identifyObject = async () => {
    if (!capturedImage) {
      toast.error('Please capture or upload a photo first.');
      return;
    }
    if (remainingUses <= 0) {
      toast.error('You have reached the maximum of 10 AI identifications.');
      return;
    }
    setIsIdentifying(true);
    setAiResult(null);
    try {
      await supabase.from('ai_usage').insert({ user_id: user!.id });
      const { data, error } = await supabase.functions.invoke('identify-object', {
        body: { imageBase64: capturedImage, userHint: objectName || undefined },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      if (data.crop && Array.isArray(data.crop) && data.crop.length === 4) {
        try {
          const cropped = await cropImageToBox(capturedImage, data.crop);
          setCapturedImage(cropped);
          toast.success('Object identified & image cropped!');
        } catch {
          toast.success('Object identified!');
        }
      } else {
        toast.success('Object identified!');
      }
      setAiResult(data);
      if (data.name) setObjectName(data.name);
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] });
    } catch (err: any) {
      toast.error(err.message || 'Failed to identify object');
    } finally {
      setIsIdentifying(false);
    }
  };

  const saveToDatabase = useMutation({
    mutationFn: async () => {
      const table = archiveTarget === 'global' ? 'objects' : 'personal_objects';
      const payload: any = {
        name: objectName || aiResult?.name || 'Unknown Object',
        description: userDescription || aiResult?.description || null,
        history: aiResult?.history || null,
        estimated_origin: aiResult?.estimated_origin || null,
        image_url: capturedImage,
      };
      if (archiveTarget === 'global') {
        payload.created_by = user!.id;
      } else {
        payload.user_id = user!.id;
      }
      const { data, error } = await supabase.from(table).insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const label = archiveTarget === 'global' ? 'Community Archive' : 'Personal Archive';
      toast.success(`Saved to ${label}!`);
      if (archiveTarget === 'global') setSelectedObjectId(data.id);
      queryClient.invalidateQueries({ queryKey: ['objects-search'] });
      queryClient.invalidateQueries({ queryKey: ['global-objects'] });
      queryClient.invalidateQueries({ queryKey: ['personal-objects'] });
      if (archiveTarget === 'personal') resetAll();
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

  const usagePct = (usageCount / MAX_AI_USES) * 100;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="animate-fade-in">
        <div className="rounded-2xl p-5 relative overflow-hidden" style={{
          background: 'linear-gradient(135deg, hsl(var(--teal-500)) 0%, hsl(173 80% 30%) 100%)',
        }}>
          {/* Subtle decorative circles */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10" style={{ backgroundColor: 'white' }} />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-[0.07]" style={{ backgroundColor: 'white' }} />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Aperture className="w-5 h-5 text-white/90" />
                <h2 className="font-display text-xl font-semibold text-white">AI Archiving</h2>
              </div>
              <p className="text-white/70 text-sm max-w-xs">
                Capture or upload an object — AI identifies it and adds it to the archive
              </p>
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="flex items-center gap-1.5 justify-end">
                <Zap className="w-3.5 h-3.5 text-white/80" />
                <span className="text-sm font-bold tabular-nums text-white">
                  {remainingUses}
                </span>
                <span className="text-xs text-white/60">left</span>
              </div>
              <div className="w-20 h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ backgroundColor: 'hsl(0 0% 100% / 0.2)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${100 - usagePct}%`,
                  backgroundColor: remainingUses <= 2 ? 'hsl(0 80% 65%)' : 'hsl(0 0% 100% / 0.85)',
                }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Camera / Upload Selector */}
      {!capturedImage && !cameraStream && (
        <div className="animate-fade-in grid grid-cols-2 gap-4" style={{ animationDelay: '0.1s' }}>
          <button
            onClick={startCamera}
            className="group relative rounded-2xl aspect-[4/3] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 active:scale-[0.97] overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, hsl(var(--teal-50)) 0%, hsl(var(--background)) 100%)',
              border: '2px solid hsl(var(--teal-200))',
            }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style={{
              backgroundColor: 'hsl(var(--teal-100))',
            }}>
              <Camera className="w-6 h-6" style={{ color: 'hsl(var(--teal-600))' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Use Camera</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Take a photo live</p>
            </div>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="group relative rounded-2xl aspect-[4/3] flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300 active:scale-[0.97] overflow-hidden"
            style={{
              background: 'linear-gradient(160deg, hsl(262 80% 97%) 0%, hsl(var(--background)) 100%)',
              border: '2px solid hsl(262 60% 88%)',
            }}
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110" style={{
              backgroundColor: 'hsl(262 60% 93%)',
            }}>
              <ImagePlus className="w-6 h-6" style={{ color: 'hsl(262 60% 50%)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Upload Photo</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">From your gallery</p>
            </div>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
        </div>
      )}

      {/* Live Camera View */}
      {cameraStream && !capturedImage && (
        <div className="animate-fade-in space-y-3">
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ border: '2px solid hsl(var(--teal-300))' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />
            {/* Viewfinder overlay */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: 'hsl(var(--teal-400) / 0.6)' }} />
              <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: 'hsl(var(--teal-400) / 0.6)' }} />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: 'hsl(var(--teal-400) / 0.6)' }} />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: 'hsl(var(--teal-400) / 0.6)' }} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={captureFromCamera} className="flex-1 rounded-xl h-11" style={{ backgroundColor: 'hsl(var(--teal-500))' }}>
              <Aperture className="w-4 h-4 mr-1.5" /> Capture
            </Button>
            <Button variant="outline" onClick={stopCamera} className="rounded-xl h-11">
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Captured Image Preview */}
      {capturedImage && (
        <div className="animate-fade-in relative rounded-2xl overflow-hidden" style={{ border: '2px solid hsl(var(--teal-300))' }}>
          <img src={capturedImage} alt="Captured" className="w-full aspect-video object-cover" />
          <button
            onClick={resetAll}
            className="absolute top-3 right-3 w-9 h-9 rounded-xl bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-all duration-200 active:scale-[0.95]"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Subtle gradient at bottom for readability */}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
        </div>
      )}

      {/* Object Name & Description Inputs */}
      {capturedImage && (
        <div className="animate-fade-in space-y-4 rounded-2xl p-5" style={{
          backgroundColor: 'hsl(var(--teal-50))',
          border: '1px solid hsl(var(--teal-200))',
        }}>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Object name <span className="text-muted-foreground font-normal text-xs">(optional — AI will identify it)</span>
            </label>
            <Input
              value={objectName}
              onChange={(e) => setObjectName(e.target.value)}
              placeholder="e.g. Silver locket, WWII compass..."
              className="bg-background rounded-xl"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Your notes <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </label>
            <Textarea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              placeholder="Any context you'd like to add..."
              className="bg-background rounded-xl"
              rows={2}
            />
          </div>

          {!aiResult && (
            <Button
              onClick={identifyObject}
              disabled={isIdentifying || remainingUses <= 0}
              className="w-full rounded-xl h-11 text-white"
              size="lg"
              style={{ backgroundColor: isIdentifying ? undefined : 'hsl(var(--teal-500))' }}
            >
              {isIdentifying ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Identifying...
                </>
              ) : remainingUses <= 0 ? (
                'No AI scans remaining'
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
        <div className="animate-fade-in rounded-2xl overflow-hidden" style={{ border: '1px solid hsl(var(--teal-200))' }}>
          {/* Result header */}
          <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: 'hsl(var(--teal-500))', color: 'white' }}>
            <Sparkles className="w-4 h-4" />
            <h3 className="font-display text-sm font-semibold">AI Identification</h3>
          </div>

          <div className="p-5 space-y-4 bg-card">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'hsl(var(--teal-500))' }}>Object</p>
              <p className="text-foreground font-semibold text-lg">{aiResult.name}</p>
            </div>
            {aiResult.description && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'hsl(var(--teal-500))' }}>Description</p>
                <p className="text-foreground/80 text-sm leading-relaxed">{aiResult.description}</p>
              </div>
            )}
            {aiResult.history && (
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: 'hsl(var(--teal-500))' }}>Historical Background</p>
                <p className="text-foreground/80 text-sm leading-relaxed whitespace-pre-line">{aiResult.history}</p>
              </div>
            )}

            {/* Archive Target Selector */}
            <div className="pt-3 border-t border-border space-y-3">
              <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'hsl(var(--teal-500))' }}>Save to</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setArchiveTarget('global')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                    archiveTarget === 'global' ? 'text-white shadow-md' : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                  style={archiveTarget === 'global'
                    ? { backgroundColor: 'hsl(var(--teal-500))', border: '1px solid hsl(var(--teal-500))' }
                    : { border: '1px solid hsl(var(--teal-200))' }
                  }
                >
                  <Globe className="w-4 h-4" />
                  Community
                </button>
                <button
                  onClick={() => setArchiveTarget('personal')}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 active:scale-[0.97] ${
                    archiveTarget === 'personal' ? 'text-white shadow-md' : 'bg-background text-muted-foreground hover:text-foreground'
                  }`}
                  style={archiveTarget === 'personal'
                    ? { backgroundColor: 'hsl(262 60% 50%)', border: '1px solid hsl(262 60% 50%)' }
                    : { border: '1px solid hsl(var(--teal-200))' }
                  }
                >
                  <BookLock className="w-4 h-4" />
                  My Archive
                </button>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => saveToDatabase.mutate()} disabled={saveToDatabase.isPending}
                  className="flex-1 rounded-xl h-11 text-white"
                  style={{ backgroundColor: 'hsl(var(--teal-500))' }}>
                  {saveToDatabase.isPending ? 'Saving...' : `Save to ${archiveTarget === 'global' ? 'Community' : 'Personal'} Archive`}
                </Button>
                <Button variant="outline" onClick={resetAll} className="rounded-xl h-11">
                  Start Over
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
