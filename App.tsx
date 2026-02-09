
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, 
  Terminal, 
  Box, 
  Loader2, 
  Activity, 
  Crosshair, 
  ShieldAlert, 
  Cpu, 
  Zap,
  ChevronRight,
  Database,
  RefreshCcw,
  Maximize2
} from 'lucide-react';
import { analyzeScene } from './services/gemini';
import { Message, ROI, VoiceGender } from './types';

export default function App() {
  const [history, setHistory] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [aiResponse, setAiResponse] = useState("PRISM_V4.2 STANDING BY. OPTICAL LINK STABLE.");
  const [roiList, setRoiList] = useState<ROI[]>([]);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("IDLE");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  // Added voiceGender state to satisfy analyzeScene requirement for a 5th argument
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('MALE');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Initialize Camera
  const startCamera = useCallback(async () => {
    // Clean up existing stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: facingMode, 
          width: { ideal: 1920 }, 
          height: { ideal: 1080 } 
        },
        audio: false 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setStatus("LINK_OK");
    } catch (err) {
      console.error(err);
      setAiResponse("ERROR: OPTICAL LINK FAILED. CHECK PERMISSIONS.");
      setStatus("LINK_ERROR");
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [startCamera]);

  const toggleCamera = () => {
    setFacingMode(prev => prev === "user" ? "environment" : "user");
    setStatus("SWITCHING");
  };

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
        setIsListening(true);
        setStatus("LISTENING");
      };
      
      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setTranscript(text);
        processCommand(text);
      };
      
      recognition.onend = () => {
        setIsListening(false);
        if (!isProcessing) setStatus("IDLE");
      };
      
      recognitionRef.current = recognition;
    }
  }, [isProcessing]);

  // Helper: Precise Image Cropping
  const generateThumbnails = useCallback(async (sourceCanvas: HTMLCanvasElement, rois: ROI[]): Promise<ROI[]> => {
    const results: ROI[] = [];
    
    // Create an Image from the canvas to ensure we have a clean source
    const imgData = sourceCanvas.toDataURL('image/jpeg', 1.0);
    const sourceImg = new Image();
    sourceImg.src = imgData;
    
    await new Promise((resolve) => { sourceImg.onload = resolve; });

    const thumbSize = 256;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = thumbSize;
    cropCanvas.height = thumbSize;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return rois;

    for (const item of rois) {
      // Scale from percentage to pixels
      const centerX = (item.x / 100) * sourceImg.width;
      const centerY = (item.y / 100) * sourceImg.height;
      
      // Determine crop size (e.g., 20% of the shortest side)
      const side = Math.min(sourceImg.width, sourceImg.height) * 0.25;
      
      let sx = centerX - side / 2;
      let sy = centerY - side / 2;

      // Clamp coordinates to stay inside image
      sx = Math.max(0, Math.min(sourceImg.width - side, sx));
      sy = Math.max(0, Math.min(sourceImg.height - side, sy));

      ctx.clearRect(0, 0, thumbSize, thumbSize);
      ctx.drawImage(
        sourceImg,
        sx, sy, side, side,
        0, 0, thumbSize, thumbSize
      );

      results.push({
        ...item,
        thumbnail: cropCanvas.toDataURL('image/jpeg', 0.8)
      });
    }

    return results;
  }, []);

  const processCommand = async (userText: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    setStatus("ANALYZING");
    setAiResponse("PROCESSING TACTICAL DATA...");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Capture frame
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    try {
      // Fix: Provided missing voiceGender argument to satisfy analyzeScene call signature
      const { data } = await analyzeScene(base64Image, userText, history, 'GENERAL', voiceGender);
      
      // Generate actual distinct thumbnails for each ROI
      const roisWithThumbs = await generateThumbnails(canvas, data.roi);
      
      setRoiList(roisWithThumbs);
      setAiResponse(data.verbal);
      
      // Text to Speech
      const utterance = new SpeechSynthesisUtterance(data.verbal);
      utterance.pitch = 0.9;
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);

      // Fix: Use explicit Message type to satisfy the union type requirement for 'role'
      setHistory(prev => {
        const nextMessages: Message[] = [
          ...prev,
          { role: 'user', parts: [{ text: userText }] },
          { role: 'model', parts: [{ text: data.verbal }] }
        ];
        return nextMessages.slice(-10);
      });

    } catch (err) {
      console.error(err);
      setAiResponse("NEURAL LINK RESET. RETRYING...");
    } finally {
      setIsProcessing(false);
      setStatus("IDLE");
    }
  };

  const handleStartListening = () => {
    if (isListening || isProcessing) return;
    recognitionRef.current?.start();
  };

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-slate-950 font-inter">
      {/* BACKGROUND VIDEO LAYER */}
      <div className="absolute inset-0 z-0">
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="h-full w-full object-cover opacity-60 grayscale-[30%] brightness-[0.7]"
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {/* AR VIGNETTE */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(2,6,23,0.8)_100%)] pointer-events-none" />
      </div>

      {/* AR OVERLAY - MARKERS */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        {roiList.map((roi, idx) => (
          <div 
            key={idx}
            className="absolute transition-all duration-700 ease-out"
            style={{ 
              left: `${roi.x}%`, 
              top: `${roi.y}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <div className="relative">
              {/* Animated Ring */}
              <div className="w-12 h-12 border border-cyan-400/50 rounded-full animate-ping absolute -inset-6 opacity-40" />
              <div className="w-6 h-6 border-2 border-cyan-400 rounded-sm rotate-45 flex items-center justify-center">
                <Crosshair size={12} className="text-cyan-400 -rotate-45" />
              </div>
              
              {/* Label */}
              <div className="absolute left-8 top-0 whitespace-nowrap">
                <div className="bg-black/80 border-l-2 border-cyan-500 px-3 py-1 flex flex-col backdrop-blur-md">
                  <span className="text-[10px] font-orbitron font-black text-cyan-400 tracking-tighter uppercase">
                    OBJ_{idx.toString().padStart(2, '0')} // {roi.label}
                  </span>
                  <span className="text-[8px] text-cyan-200/60 font-mono tracking-tight uppercase max-w-[150px] truncate">
                    {roi.description}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* HUD WRAPPER */}
      <div className="relative z-20 h-full w-full flex flex-col p-4 lg:p-10 safe-pb pointer-events-none">
        
        {/* TOP HUD: STATUS & SENSORS */}
        <div className="flex justify-between items-start w-full">
          <div className="flex flex-col gap-2">
            <div className="glass-panel px-4 py-1.5 border-l-4 border-cyan-500 flex items-center gap-3">
              <Activity size={14} className="text-cyan-400 animate-pulse" />
              <div className="flex flex-col">
                <span className="text-[10px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">
                  PRISM_v4.2 // TACTICAL_LINK
                </span>
                <span className="text-[8px] font-mono text-cyan-500/60 font-bold uppercase">
                  {status} // CAM: {facingMode.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={toggleCamera}
                className="glass-panel px-2 py-1 flex items-center gap-2 pointer-events-auto hover:bg-cyan-500/10 active:scale-95 transition-all"
              >
                <RefreshCcw size={10} className="text-cyan-500" />
                <span className="text-[8px] font-black text-cyan-500 uppercase tracking-tighter">Switch Lens</span>
              </button>
              <div className="glass-panel px-2 py-1 flex items-center gap-2">
                <Database size={10} className="text-cyan-500" />
                <span className="text-[8px] font-black text-cyan-500 uppercase tracking-tighter">DATA_{history.length}</span>
              </div>
            </div>
          </div>

          <div className="hidden lg:flex glass-panel p-4 flex-col gap-2 border-r-4 border-cyan-500/40 w-48 lg:w-64">
            <div className="flex items-center gap-2 border-b border-white/5 pb-1">
              <Terminal size={12} className="text-cyan-500" />
              <span className="text-[9px] font-black text-cyan-400 uppercase tracking-widest">Live_Telemetry</span>
            </div>
            <div className="flex flex-col gap-1 overflow-hidden h-24 font-mono text-[9px] text-cyan-300/60 leading-tight">
              {roiList.length > 0 ? roiList.map((r, i) => (
                <div key={i} className="flex justify-between border-b border-white/5 pb-0.5">
                  <span className="truncate w-2/3 uppercase tracking-tighter">{r.label}</span>
                  <span className="text-cyan-500 font-bold">P:{Math.round(r.x)},{Math.round(r.y)}</span>
                </div>
              )) : (
                <div className="flex flex-col gap-2 opacity-50 italic">
                  <span>Scanning sector...</span>
                  <div className="flex gap-1">
                    <div className="h-1 w-full bg-cyan-900 overflow-hidden relative">
                      <div className="absolute inset-0 bg-cyan-400 animate-[loading_1.5s_infinite]" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE SECTION: INTERACTION */}
        <div className="flex-1 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative group pointer-events-auto">
            {/* Visualizer Rings */}
            <div className={`absolute -inset-10 border border-cyan-500/20 rounded-full transition-transform duration-500 ${isListening ? 'scale-125 opacity-100 animate-ping' : 'scale-100 opacity-0'}`} />
            <div className={`absolute -inset-6 border-2 border-cyan-400/30 rounded-full transition-transform duration-300 ${isProcessing ? 'animate-spin' : ''}`} />
            
            <button 
              onClick={handleStartListening}
              disabled={isProcessing}
              className={`relative w-28 h-28 lg:w-44 lg:h-44 rounded-full glass-panel border-4 flex flex-col items-center justify-center gap-2 transition-all duration-300 active:scale-95 shadow-[0_0_50px_rgba(34,211,238,0.2)]
                ${isListening ? 'border-cyan-400 scale-110' : 'border-cyan-500/20 hover:border-cyan-500/50'}
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {isProcessing ? (
                <Loader2 size={32} className="text-cyan-400 animate-spin" />
              ) : (
                <Mic size={32} className={`transition-colors ${isListening ? 'text-cyan-400 animate-pulse' : 'text-slate-400'}`} />
              )}
              <span className="text-[10px] font-orbitron font-black text-cyan-400 tracking-widest uppercase">
                {isListening ? "Listening" : isProcessing ? "Thinking" : "Voice Link"}
              </span>
            </button>
          </div>
        </div>

        {/* BOTTOM HUD: EVIDENCE & DIALOGUE */}
        <div className="flex flex-col gap-4 w-full items-center pointer-events-auto">
          
          {/* EVIDENCE TRAY (CROPS) */}
          <div className="flex gap-3 w-full max-w-4xl overflow-x-auto no-scrollbar py-2 justify-start lg:justify-center px-4">
            {roiList.length > 0 && roiList.map((item, i) => (
              <div 
                key={i} 
                className="flex-shrink-0 relative group transition-all duration-300 hover:scale-110 active:scale-90"
                onClick={() => setAiResponse(`DATA_LOG_${i}: ${item.description}`)}
              >
                <div className="w-20 h-20 lg:w-32 lg:h-32 rounded-lg overflow-hidden border-2 border-cyan-500/40 shadow-2xl bg-slate-900 flex items-center justify-center">
                  {item.thumbnail ? (
                    <img 
                      src={item.thumbnail} 
                      className="w-full h-full object-cover brightness-110 contrast-125" 
                      alt={item.label} 
                    />
                  ) : (
                    <Box size={24} className="text-cyan-500/20 animate-pulse" />
                  )}
                  
                  {/* Overlay for label */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 opacity-0 group-hover:opacity-100 lg:opacity-0 transition-all">
                    <span className="text-[8px] font-bold text-cyan-400 block truncate uppercase">{item.label}</span>
                  </div>
                </div>
                
                {/* Tactical Tag */}
                <div className="absolute -top-1 -right-1 bg-cyan-600 rounded px-1 py-0.5 border border-white/20 shadow-lg">
                  <span className="text-[7px] font-black text-white uppercase tracking-tighter">D_{i}</span>
                </div>
              </div>
            ))}
          </div>

          {/* MAIN DIALOGUE PANEL */}
          <div className="w-full lg:max-w-4xl glass-panel p-5 lg:p-8 rounded-t-[2.5rem] lg:rounded-t-[3rem] border-t-2 border-cyan-400/30 shadow-[0_-20px_60px_-15px_rgba(34,211,238,0.2)]">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-3">
                  <Cpu size={16} className="text-cyan-500" />
                  <div className="flex flex-col">
                    <span className="text-[10px] tracking-[0.4em] font-orbitron font-black text-slate-500 uppercase leading-none">Analysis_Core</span>
                  </div>
                </div>
                <div className="flex gap-1 h-3 items-end">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-0.5 bg-cyan-500/40 rounded-full" style={{ height: `${20 + Math.random() * 80}%` }} />
                  ))}
                </div>
              </div>

              <div className="min-h-[50px] flex flex-col gap-2">
                <div className="text-base lg:text-xl font-medium text-slate-100 leading-snug tracking-tight flicker">
                  {isProcessing ? (
                    <span className="flex items-center gap-2 italic text-cyan-500 animate-pulse">
                      <Zap size={16} /> UPLINK_ESTABLISHED...
                    </span>
                  ) : (
                    aiResponse
                  )}
                </div>
                
                {transcript && (
                  <div className="flex items-center gap-2 mt-1 opacity-40">
                    <ChevronRight size={10} className="text-cyan-500" />
                    <span className="text-[9px] font-mono italic truncate">CMD: {transcript}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading {
          from { transform: translateX(-100%); }
          to { transform: translateX(100%); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </main>
  );
}