import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScanEye, Play, Square, Loader2, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DetectedItem {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  bbox: [number, number, number, number];
  brief: string;
}

const SCAN_INTERVAL_MS = 4000;

const confidenceColor: Record<string, string> = {
  high: 'hsl(var(--teal-500))',
  medium: 'hsl(45 90% 50%)',
  low: 'hsl(0 70% 55%)',
};

const confidenceBg: Record<string, string> = {
  high: 'hsl(var(--teal-500) / 0.15)',
  medium: 'hsl(45 90% 50% / 0.15)',
  low: 'hsl(0 70% 55% / 0.15)',
};

export default function LiveSenseTab() {
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showPanel, setShowPanel] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      setCameraStream(stream);
      setIsActive(true);
    } catch {
      setError('Could not access camera. Please check permissions.');
      toast.error('Camera access denied.');
    }
  }, []);

  // Attach stream to video
  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

  // Stop everything
  const stopSensing = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    cameraStream?.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    setIsActive(false);
    setIsScanning(false);
    setDetectedItems([]);
  }, [cameraStream]);

  // Capture a frame and send to AI
  const captureAndAnalyze = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);

    setIsScanning(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('live-sense', {
        body: { imageBase64: dataUrl },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      if (data?.items && Array.isArray(data.items)) {
        setDetectedItems(data.items);
      }
    } catch (err: any) {
      console.error('Live sense error:', err);
      if (err?.message?.includes('Rate limited')) {
        // Skip silently, will retry next interval
      } else if (err?.message?.includes('credits')) {
        toast.error('AI credits exhausted.');
        stopSensing();
      }
    } finally {
      setIsScanning(false);
    }
  }, [stopSensing]);

  // Start periodic scanning
  useEffect(() => {
    if (isActive && cameraStream) {
      // Initial scan after a short delay for camera to stabilize
      const timeout = setTimeout(() => captureAndAnalyze(), 1200);
      intervalRef.current = setInterval(captureAndAnalyze, SCAN_INTERVAL_MS);
      return () => {
        clearTimeout(timeout);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [isActive, cameraStream, captureAndAnalyze]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      cameraStream?.getTracks().forEach((t) => t.stop());
    };
  }, [cameraStream]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="animate-fade-in">
        <div className="rounded-2xl p-5 relative overflow-hidden" style={{
          background: 'linear-gradient(135deg, hsl(262 60% 50%) 0%, hsl(262 70% 35%) 100%)',
        }}>
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 bg-white" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-[0.07] bg-white" />

          <div className="relative flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ScanEye className="w-5 h-5 text-white/90" />
                <h2 className="font-display text-xl font-semibold text-white">Live Sense</h2>
              </div>
              <p className="text-white/70 text-sm max-w-xs">
                Point your camera around — AI identifies objects in real time
              </p>
            </div>
            {isActive && (
              <div className="flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${isScanning ? 'animate-pulse' : ''}`}
                  style={{ backgroundColor: isScanning ? 'hsl(45 90% 60%)' : 'hsl(140 70% 55%)' }} />
                <span className="text-xs text-white/70">{isScanning ? 'Analyzing…' : 'Watching'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Inactive state — start button */}
      {!isActive && !error && (
        <div className="animate-fade-in flex flex-col items-center gap-5 py-12">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{
            backgroundColor: 'hsl(262 60% 95%)',
            border: '2px solid hsl(262 60% 88%)',
          }}>
            <ScanEye className="w-9 h-9" style={{ color: 'hsl(262 60% 50%)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground mb-1">Real-Time Scene Analysis</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              AI will continuously scan your camera feed and identify objects as you move around
            </p>
          </div>
          <Button onClick={startCamera} size="lg" className="rounded-xl h-12 px-8 text-white" style={{ backgroundColor: 'hsl(262 60% 50%)' }}>
            <Play className="w-4 h-4 mr-2" /> Start Sensing
          </Button>
        </div>
      )}

      {/* Active camera view with overlays */}
      {isActive && (
        <div className="animate-fade-in space-y-4">
          {/* Video container with bounding box overlays */}
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ border: '2px solid hsl(262 60% 65%)' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />

            {/* Bounding box overlays */}
            <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
              {detectedItems.map((item, i) => {
                const [xMin, yMin, xMax, yMax] = item.bbox;
                return (
                  <div
                    key={`${item.name}-${i}`}
                    className="absolute transition-all duration-500 ease-out"
                    style={{
                      left: `${xMin * 100}%`,
                      top: `${yMin * 100}%`,
                      width: `${(xMax - xMin) * 100}%`,
                      height: `${(yMax - yMin) * 100}%`,
                      border: `2px solid ${confidenceColor[item.confidence] || confidenceColor.medium}`,
                      borderRadius: '8px',
                    }}
                  >
                    <span
                      className="absolute -top-6 left-0 px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap"
                      style={{
                        backgroundColor: confidenceColor[item.confidence] || confidenceColor.medium,
                        color: 'white',
                      }}
                    >
                      {item.name}
                    </span>
                  </div>
                );
              })}

              {/* Scanning indicator */}
              {isScanning && (
                <div className="absolute top-3 right-3">
                  <Loader2 className="w-5 h-5 text-white animate-spin" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
                </div>
              )}

              {/* Corner marks */}
              <div className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: 'hsl(262 60% 65% / 0.5)' }} />
              <div className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: 'hsl(262 60% 65% / 0.5)' }} />
              <div className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: 'hsl(262 60% 65% / 0.5)' }} />
              <div className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: 'hsl(262 60% 65% / 0.5)' }} />
            </div>
          </div>

          {/* Stop button */}
          <Button onClick={stopSensing} variant="outline" className="w-full rounded-xl h-11 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
            <Square className="w-4 h-4 mr-2" /> Stop Sensing
          </Button>

          {/* Fixed bottom detected items panel */}
          {detectedItems.length > 0 && showPanel && (
            <div className="fixed bottom-0 left-0 right-0 z-50 animate-fade-in" style={{ maxHeight: '45vh' }}>
              <div className="rounded-t-2xl overflow-hidden shadow-lg border-t border-x" style={{ borderColor: 'hsl(262 60% 88%)' }}>
                <div className="px-4 py-2.5 flex items-center justify-between" style={{ backgroundColor: 'hsl(262 60% 50%)', color: 'white' }}>
                  <div className="flex items-center gap-2">
                    <ScanEye className="w-4 h-4" />
                    <h3 className="text-sm font-semibold">
                      Detected — {detectedItems.length} item{detectedItems.length !== 1 ? 's' : ''}
                    </h3>
                  </div>
                  <button
                    onClick={() => setShowPanel(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors active:scale-[0.95]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="divide-y divide-border overflow-y-auto bg-card" style={{ maxHeight: 'calc(45vh - 40px)' }}>
                  {detectedItems.map((item, i) => (
                    <div key={`${item.name}-${i}`} className="px-4 py-3 flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: confidenceColor[item.confidence] }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-foreground">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{
                            backgroundColor: confidenceBg[item.confidence],
                            color: confidenceColor[item.confidence],
                          }}>
                            {item.confidence}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.brief}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Collapsed indicator to re-open panel */}
          {detectedItems.length > 0 && !showPanel && (
            <button
              onClick={() => setShowPanel(true)}
              className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-lg flex items-center gap-2 active:scale-[0.97] transition-all"
              style={{ backgroundColor: 'hsl(262 60% 50%)' }}
            >
              <ScanEye className="w-4 h-4" />
              {detectedItems.length} detected
            </button>
          )}

          {/* Empty state while waiting for first result */}
          {detectedItems.length === 0 && isScanning && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
              Analyzing scene…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
