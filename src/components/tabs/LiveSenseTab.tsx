import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ScanEye, Play, Square, Loader2, AlertCircle } from 'lucide-react';
import FocusModeOverlay from './FocusModeOverlay';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface DetectedItem {
  name: string;
  confidence: 'high' | 'medium' | 'low';
  bbox: [number, number, number, number];
  brief: string;
}

const SCAN_INTERVAL_MS = 3000;

const confidenceColor: Record<string, string> = {
  high: 'hsl(var(--teal-500))',
  medium: 'hsl(45 90% 50%)',
  low: 'hsl(0 70% 55%)',
};

export default function LiveSenseTab() {
  const [isActive, setIsActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [detectedItems, setDetectedItems] = useState<DetectedItem[]>([]);
  const [focusedItem, setFocusedItem] = useState<DetectedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    if (videoRef.current && cameraStream) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraStream]);

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
        // Skip silently
      } else if (err?.message?.includes('credits')) {
        toast.error('AI credits exhausted.');
        stopSensing();
      }
    } finally {
      setIsScanning(false);
    }
  }, [stopSensing]);

  useEffect(() => {
    if (isActive && cameraStream) {
      const timeout = setTimeout(() => captureAndAnalyze(), 1200);
      intervalRef.current = setInterval(captureAndAnalyze, SCAN_INTERVAL_MS);
      return () => {
        clearTimeout(timeout);
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [isActive, cameraStream, captureAndAnalyze]);

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
          background: 'linear-gradient(135deg, hsl(215 55% 48%) 0%, hsl(220 60% 32%) 100%)',
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
                Point your camera around — tap any object for its history
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

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Inactive */}
      {!isActive && !error && (
        <div className="animate-fade-in flex flex-col items-center gap-5 py-12">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{
            backgroundColor: 'hsl(215 55% 95%)',
            border: '2px solid hsl(215 55% 85%)',
          }}>
            <ScanEye className="w-9 h-9" style={{ color: 'hsl(215 55% 48%)' }} />
          </div>
          <div className="text-center">
            <p className="font-semibold text-foreground mb-1">Real-Time Scene Analysis</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
              AI identifies objects as you move around — tap any object for a deep dive
            </p>
          </div>
          <Button onClick={startCamera} size="lg" className="rounded-xl h-12 px-8 text-white" style={{ backgroundColor: 'hsl(215 55% 48%)' }}>
            <Play className="w-4 h-4 mr-2" /> Start Sensing
          </Button>
        </div>
      )}

      {/* Active camera */}
      {isActive && (
        <div className="animate-fade-in space-y-4">
          <div className="relative rounded-2xl overflow-hidden bg-black" style={{ border: '2px solid hsl(215 55% 60%)' }}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full aspect-video object-cover" />

            {/* Bounding boxes */}
            <div className="absolute inset-0">
              {detectedItems.map((item, i) => {
                const [xMin, yMin, xMax, yMax] = item.bbox;
                const isFocused = focusedItem?.name === item.name;
                const hasFocus = focusedItem !== null;
                const color = confidenceColor[item.confidence] || confidenceColor.medium;
                return (
                  <button
                    key={`${item.name}-${i}`}
                    onClick={(e) => { e.stopPropagation(); setFocusedItem(item); }}
                    className="absolute transition-all duration-500 ease-out cursor-pointer group/bbox active:scale-[0.97]"
                    style={{
                      left: `${Math.max(0, xMin * 100 - 2)}%`,
                      top: `${Math.max(0, yMin * 100 - 4)}%`,
                      width: `${Math.min(100 - xMin * 100, (xMax - xMin) * 100 + 4)}%`,
                      height: `${Math.min(100 - yMin * 100, (yMax - yMin) * 100 + 6)}%`,
                      padding: '4px',
                      opacity: hasFocus && !isFocused ? 0.15 : 1,
                    }}
                  >
                    {/* Visible border box */}
                    <div className="w-full h-full rounded-lg transition-all duration-300 group-hover/bbox:shadow-lg" style={{
                      border: `2.5px solid ${color}`,
                      boxShadow: isFocused ? `0 0 24px ${color}, inset 0 0 12px ${color}30` : `0 0 8px ${color}40`,
                      backgroundColor: `${color}08`,
                    }} />
                    {/* Label — clickable, positioned above the box */}
                    <span
                      className="absolute -top-5 left-1 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap cursor-pointer shadow-md transition-all duration-200 group-hover/bbox:scale-105 group-hover/bbox:-top-6"
                      style={{
                        backgroundColor: color,
                        color: 'white',
                        textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                        boxShadow: `0 2px 8px ${color}60`,
                      }}
                    >
                      {item.name}
                      <span className="ml-1.5 opacity-70 text-[9px]">↗</span>
                    </span>
                  </button>
                );
              })}

              {isScanning && (
                <div className="absolute top-3 right-3">
                  <Loader2 className="w-5 h-5 text-white animate-spin" style={{ filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.5))' }} />
                </div>
              )}

              {/* Corner marks */}
              <div className="absolute top-3 left-3 w-7 h-7 border-t-2 border-l-2 rounded-tl-lg" style={{ borderColor: 'hsl(215 55% 60% / 0.5)' }} />
              <div className="absolute top-3 right-3 w-7 h-7 border-t-2 border-r-2 rounded-tr-lg" style={{ borderColor: 'hsl(215 55% 60% / 0.5)' }} />
              <div className="absolute bottom-3 left-3 w-7 h-7 border-b-2 border-l-2 rounded-bl-lg" style={{ borderColor: 'hsl(215 55% 60% / 0.5)' }} />
              <div className="absolute bottom-3 right-3 w-7 h-7 border-b-2 border-r-2 rounded-br-lg" style={{ borderColor: 'hsl(215 55% 60% / 0.5)' }} />
            </div>
          </div>

          {/* Tap hint */}
          {detectedItems.length > 0 && !focusedItem && (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground animate-fade-in py-2 px-4 rounded-xl mx-auto w-fit" style={{ backgroundColor: 'hsl(var(--teal-50))', border: '1px solid hsl(var(--teal-200))' }}>
              <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'hsl(var(--teal-500))' }} />
              Tap any label to explore its history & connections
            </div>
          )}

          <Button onClick={stopSensing} variant="outline" className="w-full rounded-xl h-11 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
            <Square className="w-4 h-4 mr-2" /> Stop Sensing
          </Button>

          {detectedItems.length === 0 && isScanning && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 opacity-50" />
              Analyzing scene…
            </div>
          )}
        </div>
      )}

      {focusedItem && (
        <FocusModeOverlay item={focusedItem} onClose={() => setFocusedItem(null)} />
      )}
    </div>
  );
}
