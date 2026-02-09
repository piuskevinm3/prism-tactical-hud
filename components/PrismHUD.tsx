"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Mic, Sparkles, X, Eye, Heart, Settings, User, UserCheck, 
  Gauge, Cpu, Activity, Zap, Layers, 
  Target, Scan, Waves, Volume2, VolumeX, ChevronRight,
  ShieldAlert, Wrench, Check, Terminal, RefreshCcw, Camera,
  Info, Crosshair
} from 'lucide-react';
import { ROI, Message, InsightFocus, VoiceGender } from '../types';
import { analyzeScene, playTacticalAudio } from '../services/gemini';

export default function PrismHUD() {
  const [history, setHistory] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>('MALE');
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [aiResponse, setAiResponse] = useState("PRISM_V12.8 // SYSTEMS_READY");
  const [roiList, setRoiList] = useState<ROI[]>([]);
  const [ambientData, setAmbientData] = useState({ score: 0, mood: "Calibrating" });
  const [status, setStatus] = useState("STABLE");
  const [inspectingRoiIdx, setInspectingRoiIdx] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState<InsightFocus>("GENERAL");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [barHeights, setBarHeights] = useState<number[]>([]);
  const [transcript, setTranscript] = useState("");
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    setBarHeights([...Array(8)].map(() => 10 + Math.random() * 80));
    const interval = setInterval(() => {
      setBarHeights([...Array(8)].map(() => 10 + Math.random() * 80));
    }, 450);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      
      recognition.onstart = () => {
        setIsListening(true);
        setStatus("LISTENING");
      };
      
      recognition.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setTranscript(text);
        processPulse(text);
      };
      
      recognition.onend = () => {
        setIsListening(false);
        if (!isProcessing) setStatus("STABLE");
      };
      
      recognitionRef.current = recognition;
    }
  }, [isProcessing]);

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      if (isProcessing) return;
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error("PRISM // Audio link failed.");
      }
    }
  };

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.load();
    }

    // Hardware sync delay
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false 
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(() => setStatus("INTERACTION_REQ"));
          setStatus("STABLE");
        };
      }
    } catch (err) {
      setAiResponse("PRISM // CRITICAL_LINK_FAILURE");
      setStatus("ERROR");
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, [startCamera]);

  const toggleCamera = () => {
    setStatus("SYNCING_LENS");
    setFacingMode(prev => prev === "user" ? "environment" : "user");
    setIsSettingsOpen(false);
  };

  const generateTacticalCrops = useCallback((sourceCanvas: HTMLCanvasElement, rois: ROI[]): ROI[] => {
    const cropCanvas = document.createElement('canvas');
    const thumbSize = 512; 
    cropCanvas.width = thumbSize;
    cropCanvas.height = thumbSize;
    const ctx = cropCanvas.getContext('2d');
    if (!ctx) return rois;

    return rois.map(roi => {
      const centerX = (roi.x / 100) * sourceCanvas.width;
      const centerY = (roi.y / 100) * sourceCanvas.height;
      const cropSize = Math.min(sourceCanvas.width, sourceCanvas.height) * 0.35;
      
      ctx.clearRect(0, 0, thumbSize, thumbSize);
      ctx.drawImage(
        sourceCanvas,
        centerX - cropSize / 2,
        centerY - cropSize / 2,
        cropSize,
        cropSize,
        0, 0, thumbSize, thumbSize
      );

      return {
        ...roi,
        thumbnail: cropCanvas.toDataURL('image/jpeg', 0.9)
      };
    });
  }, []);

  const processPulse = async (command: string = "") => {
    if (isProcessing) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || video.readyState < 2) {
      setAiResponse("PRISM // SIGNAL_LAG: Syncing optical sensors...");
      return;
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();

    // Reset current inspection view
    setInspectingRoiIdx(null);
    setRoiList([]);
    setIsProcessing(true);
    setStatus("SCANNING");
    setAiResponse(command ? `DECODING: "${command.toUpperCase()}"` : "CAPTURING SECTOR DATA...");

    const targetWidth = 1280;
    const scale = targetWidth / video.videoWidth;
    canvas.width = targetWidth;
    canvas.height = video.videoHeight * scale;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

    try {
      const { data, audioBase64 } = await analyzeScene(base64Image, command, history, focusMode, voiceGender);
      const roisWithCrops = generateTacticalCrops(canvas, data.roi);

      setRoiList(roisWithCrops);
      setAiResponse(data.verbal);
      setAmbientData({ score: data.ambientScore, mood: data.moodDescriptor });
      
      setHistory(prev => {
        const next: Message[] = [
          ...prev, 
          { role: 'user', parts: [{ text: command || "Execute sector sweep." }] },
          { role: 'model', parts: [{ text: data.verbal }] }
        ];
        return next.slice(-2);
      });

      if (isAudioEnabled && audioBase64 && audioCtxRef.current) {
        await playTacticalAudio(audioBase64, audioCtxRef.current);
      }
    } catch (err) {
      setAiResponse("NEURAL_SYNC_FAULT: Retrying uplink...");
    } finally {
      setIsProcessing(false);
      setStatus("STABLE");
    }
  };

  const focusOptions: { id: InsightFocus, label: string, icon: any, desc: string }[] = [
    { id: 'GENERAL', label: 'Tactical Recon', icon: Eye, desc: 'Holistic environmental scanning' },
    { id: 'WELLNESS', label: 'Biometric Flow', icon: Heart, desc: 'Health and ergonomic analytics' },
    { id: 'WORKSPACE', label: 'Output Matrix', icon: Cpu, desc: 'Productivity and tech optimization' },
    { id: 'HOME_SAFETY', label: 'Secure Perimeter', icon: ShieldAlert, desc: 'Hazard and risk detection' },
    { id: 'HOBBY_HELP', label: 'Tool Mastery', icon: Wrench, desc: 'Creative tool identification' },
  ];

  const getThreatColor = (level: string) => {
    switch (level) {
      case 'HAZARD': return 'text-red-400 border-red-400 bg-red-400/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]';
      case 'CAUTION': return 'text-yellow-400 border-yellow-400 bg-yellow-400/20 shadow-[0_0_15px_rgba(250,204,21,0.3)]';
      default: return 'text-cyan-400 border-cyan-400 bg-cyan-400/20 shadow-[0_0_15px_rgba(34,211,238,0.3)]';
    }
  };

  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-black font-inter text-white select-none overscroll-none touch-none">
      {/* BACKGROUND OPTICAL FEED */}
      <div className="absolute inset-0 z-0 bg-slate-950" onClick={() => !isProcessing && !isSettingsOpen && processPulse()}>
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="h-full w-full object-cover brightness-[0.7] contrast-[1.1] transition-opacity duration-1000"
        />
        <canvas ref={canvasRef} className="hidden" />
        
        {isProcessing && (
          <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
             <div className="absolute inset-0 scan-line" />
             <div className="absolute inset-0 bg-cyan-500/10 animate-pulse" />
          </div>
        )}
      </div>
      
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.95)_100%)] pointer-events-none z-0" />

      {/* AR ROI POINTERS - Adjusted for better touch targets */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {roiList.map((roi, idx) => (
          <div 
            key={idx}
            className="absolute transition-all duration-700 ease-out"
            style={{ left: `${roi.x}%`, top: `${roi.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            <button 
              className="pointer-events-auto flex flex-col items-center group/roi cursor-pointer active:scale-90 p-4"
              onClick={(e) => { e.stopPropagation(); setInspectingRoiIdx(idx); }}
            >
              <div className="relative flex items-center justify-center">
                <div className={`absolute w-12 h-12 lg:w-16 lg:h-16 border border-cyan-400/30 rounded-full animate-ping ${inspectingRoiIdx === idx ? 'opacity-100' : 'opacity-0'}`} />
                <div className={`w-8 h-8 lg:w-12 lg:h-12 glass-orb rounded-full border-white/50 flex items-center justify-center transition-all group-hover/roi:scale-125 ${inspectingRoiIdx === idx ? 'ring-2 ring-cyan-400 bg-cyan-400/50 shadow-[0_0_30px_#22d3ee]' : ''}`}>
                  <Target size={16} className={inspectingRoiIdx === idx ? 'text-cyan-400 animate-spin-slow' : 'text-white'} />
                </div>
              </div>
              <div className="mt-2 glass-morphism px-2 lg:px-3 py-0.5 lg:py-1 rounded-full border-white/20 opacity-90 lg:opacity-0 group-hover/roi:opacity-100 backdrop-blur-md shadow-2xl transition-all scale-90 lg:scale-100">
                <div className="flex items-center gap-1 lg:gap-2">
                  <Crosshair size={8} className="text-cyan-400" />
                  <span className="text-[8px] lg:text-[10px] font-black tracking-widest uppercase truncate max-w-[80px] lg:max-w-none">{roi.label}</span>
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* TOP HUD: STATUS */}
      <div className="absolute top-0 left-0 right-0 z-[1000] flex justify-between p-3 lg:p-4 pt-[env(safe-area-inset-top,1rem)] lg:pt-[env(safe-area-inset-top,1.5rem)] pointer-events-none items-start">
        <div className="glass-morphism px-4 py-2 lg:px-5 lg:py-2.5 rounded-full border-white/20 flex items-center gap-3 lg:gap-5 shadow-2xl pointer-events-auto backdrop-blur-3xl">
          <Sparkles size={14} className="text-cyan-400 animate-pulse" />
          <div className="flex flex-col">
            <h1 className="text-[9px] lg:text-[11px] font-black tracking-[0.3em] lg:tracking-[0.4em] uppercase italic leading-none">PRISM_V12.8</h1>
            <span className="text-[7px] lg:text-[8px] text-cyan-400/80 font-black tracking-widest uppercase mt-0.5">{status}</span>
          </div>
          <div className="hidden sm:flex gap-1 items-end h-3 lg:h-4 px-2 lg:px-3 border-l border-white/10 ml-1 lg:ml-2">
            {barHeights.map((h, i) => (
              <div key={i} className="w-0.5 bg-cyan-400/50 rounded-full" style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-3 pointer-events-auto">
          <div className="glass-morphism px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl border-white/10 flex items-center gap-2 lg:gap-4 shadow-2xl backdrop-blur-3xl">
             <div className="flex flex-col items-end leading-none">
               <span className="text-[6px] lg:text-[7px] font-black text-white/40 uppercase tracking-[0.1em] mb-0.5">ATMOS</span>
               <span className="text-[9px] lg:text-[11px] font-black text-white uppercase tracking-tight">{isProcessing ? "SYNC" : ambientData.mood}</span>
             </div>
             <div className="w-7 h-7 lg:w-9 lg:h-9 glass-orb rounded-lg flex items-center justify-center border-white/10">
               <Gauge size={12} className={isProcessing ? "text-cyan-400 animate-spin" : "text-cyan-400"} />
             </div>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`w-10 h-10 lg:w-12 lg:h-12 glass-morphism rounded-xl lg:rounded-2xl flex items-center justify-center border-white/10 pointer-events-auto transition-all active:scale-90 shadow-2xl
              ${isSettingsOpen ? 'bg-cyan-400 text-black shadow-cyan-400/40' : 'text-white'}
            `}
          >
            {isSettingsOpen ? <X size={18} /> : <Settings size={18} />}
          </button>
        </div>
      </div>

      {/* SETTINGS MENU - Mobile Optimized Grid */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => setIsSettingsOpen(false)} />
          <div className="relative w-full max-w-sm glass-morphism rounded-[2rem] lg:rounded-[3rem] p-6 lg:p-8 border-white/20 shadow-2xl flex flex-col gap-4 lg:gap-6 ring-1 ring-white/10 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 pb-3 lg:pb-4 border-b border-white/10">
              <Terminal size={16} className="text-cyan-400" />
              <span className="text-[10px] lg:text-[12px] font-black uppercase tracking-[0.3em] lg:tracking-[0.4em]">MISSION_MATRIX</span>
            </div>
            
            <div className="space-y-2 lg:space-y-3 overflow-y-auto max-h-[40vh] no-scrollbar">
              {focusOptions.map((opt) => (
                <button 
                  key={opt.id} 
                  onClick={() => { setFocusMode(opt.id); setIsSettingsOpen(false); }}
                  className={`w-full p-4 lg:p-5 rounded-2xl lg:rounded-3xl flex items-center gap-3 lg:gap-5 transition-all active:scale-95
                  ${focusMode === opt.id ? 'bg-cyan-400 text-black shadow-lg shadow-cyan-400/20' : 'text-white/70 hover:bg-white/5 border border-white/5'}`}
                >
                  <opt.icon size={18} />
                  <div className="flex-1 text-left">
                    <span className="block font-black uppercase text-[10px] lg:text-[12px] tracking-widest">{opt.label}</span>
                    <span className="block text-[7px] lg:text-[8px] opacity-60 uppercase mt-0.5 tracking-tighter">{opt.desc}</span>
                  </div>
                  {focusMode === opt.id && <Check size={16} />}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2 lg:gap-3 pt-3 lg:pt-4 border-t border-white/10">
              <button onClick={toggleCamera} className="p-3 lg:p-4 rounded-xl lg:rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center gap-2 active:scale-90 hover:bg-white/10">
                <RefreshCcw size={18} className="text-cyan-400" /><span className="text-[7px] lg:text-[8px] font-black uppercase">FLIP</span>
              </button>
              <button onClick={() => setIsAudioEnabled(!isAudioEnabled)} className={`p-3 lg:p-4 rounded-xl lg:rounded-3xl border flex flex-col items-center gap-2 transition-all ${isAudioEnabled ? 'bg-cyan-400 text-black' : 'bg-white/5 border-white/10'}`}>
                <Volume2 size={18} /><span className="text-[7px] lg:text-[8px] font-black uppercase">AUDIO</span>
              </button>
              <button onClick={() => setVoiceGender(voiceGender === 'MALE' ? 'FEMALE' : 'MALE')} className="p-3 lg:p-4 rounded-xl lg:rounded-3xl bg-white/5 border border-white/10 flex flex-col items-center gap-2 active:scale-90 hover:bg-white/10">
                <User size={18} /><span className="text-[7px] lg:text-[8px] font-black uppercase">{voiceGender.slice(0, 1)}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMMAND HUB - Mobile Response Padding/Sizing */}
      <div className="absolute bottom-4 lg:bottom-8 left-1/2 -translate-x-1/2 w-[96%] lg:max-w-4xl z-[3000] pb-[env(safe-area-inset-bottom,0.5rem)] pointer-events-auto">
        <div className="glass-morphism rounded-[2.5rem] lg:rounded-[3.5rem] p-2 lg:p-4 flex items-center gap-2 lg:gap-4 shadow-[0_50px_120px_rgba(0,0,0,1)] border-white/20 backdrop-blur-[100px]">
          <button 
            onClick={() => processPulse()} 
            disabled={isProcessing} 
            className={`flex items-center gap-3 lg:gap-5 px-6 py-5 lg:px-9 lg:py-7 rounded-[2rem] lg:rounded-[2.5rem] transition-all border-2
              ${isProcessing ? 'animate-pulse bg-cyan-400/30 border-cyan-400 shadow-[0_0_20px_#22d3ee]' : 'bg-white/10 border-white/15 hover:bg-white/20 active:scale-90 shadow-2xl'}
            `}
          >
            {isProcessing ? <Waves size={20} className="animate-bounce lg:size-[28px]" /> : <Scan size={20} className="lg:size-[28px]" />}
            <div className="flex flex-col items-start leading-none">
              <span className="text-[11px] lg:text-[14px] font-black text-cyan-400 tracking-[0.2em] lg:tracking-[0.4em] uppercase">SCAN</span>
              <span className="text-[7px] lg:text-[10px] font-bold text-white/50 mt-1 uppercase tracking-widest">{isProcessing ? "SYNC" : "READY"}</span>
            </div>
          </button>

          <div className="flex-1 overflow-hidden px-2 lg:px-4">
            <p className="text-[12px] lg:text-[16px] font-bold text-white/95 leading-tight italic truncate tracking-tight drop-shadow-xl">
              {aiResponse}
            </p>
            {transcript && (
              <div className="flex items-center gap-1 mt-1 opacity-60">
                <ChevronRight size={10} className="text-cyan-400" />
                <span className="text-[8px] lg:text-[11px] font-mono italic truncate uppercase tracking-tighter text-cyan-200">CMD: {transcript}</span>
              </div>
            )}
          </div>

          <button 
            onClick={toggleListening} 
            disabled={isProcessing} 
            className={`p-5 lg:p-8 rounded-[2rem] lg:rounded-[2.5rem] border-2 transition-all shadow-2xl active:scale-90
              ${isListening ? 'bg-red-500/30 border-red-500 shadow-red-500/50 scale-105 animate-pulse' : 'bg-white/10 border-white/15 hover:bg-white/20'}
              ${isProcessing ? 'opacity-20 grayscale cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <Mic size={24} className={isListening ? "text-red-400 lg:size-[32px]" : "text-white/30 lg:size-[32px]"} />
          </button>
        </div>
      </div>

      {/* TACTICAL INSPECTION MODAL - Mobile Responsive Layout */}
      <div className={`fixed inset-0 z-[10000] transition-opacity duration-500 flex justify-end pointer-events-none ${inspectingRoiIdx !== null ? 'opacity-100' : 'opacity-0'}`}>
        {inspectingRoiIdx !== null && roiList[inspectingRoiIdx] && (
          <>
            <div className="absolute inset-0 bg-black/90 backdrop-blur-2xl pointer-events-auto" onClick={() => setInspectingRoiIdx(null)} />
            <div className={`relative h-full w-full lg:max-w-[500px] glass-morphism border-l border-white/30 p-6 lg:p-12 flex flex-col pointer-events-auto transition-transform duration-600 cubic-bezier(0.16, 1, 0.3, 1) shadow-[-50px_0_150px_rgba(0,0,0,0.9)]
              ${inspectingRoiIdx !== null ? 'translate-x-0' : 'translate-x-full'}
            `}>
               <div className="flex justify-between items-center mb-6 lg:mb-10 pt-[env(safe-area-inset-top,0.5rem)]">
                  <div className="flex items-center gap-4 lg:gap-6">
                    <div className="w-12 h-12 lg:w-20 lg:h-20 glass-orb rounded-2xl lg:rounded-[2.2rem] flex items-center justify-center border-cyan-400/60 shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                       <Target size={20} className="text-cyan-400 lg:size-[30px]" />
                    </div>
                    <div>
                       <h3 className="text-[11px] lg:text-[15px] font-black tracking-[0.3em] lg:tracking-[0.5em] uppercase text-cyan-400 italic leading-none">TACTICAL_NODE</h3>
                       <p className="text-[8px] lg:text-[12px] text-white/40 uppercase font-black mt-1.5 font-mono tracking-widest">NODE_0{inspectingRoiIdx + 1}</p>
                    </div>
                  </div>
                  <button onClick={() => setInspectingRoiIdx(null)} className="p-3 lg:p-5 hover:bg-white/10 rounded-full transition-all active:scale-90">
                    <X size={24} className="text-white/20 lg:size-[36px]" />
                  </button>
               </div>

               <div className="flex-1 space-y-8 lg:space-y-12 overflow-y-auto no-scrollbar pb-32">
                  {/* ROI EXTRACT IMAGE - Sized for mobile viewport */}
                  <div className="aspect-square rounded-[2rem] lg:rounded-[3.5rem] overflow-hidden border-2 border-white/30 shadow-2xl relative bg-slate-900 ring-1 ring-cyan-400/20">
                     <img 
                        src={roiList[inspectingRoiIdx]?.thumbnail} 
                        className="w-full h-full object-cover brightness-[1.1] contrast-[1.15] transition-transform duration-[8s] hover:scale-110" 
                        alt="Target Extract" 
                     />
                     <div className={`absolute bottom-5 left-5 lg:bottom-8 lg:left-8 px-4 py-1.5 lg:px-8 lg:py-3 rounded-full border border-white/30 backdrop-blur-3xl font-black text-[9px] lg:text-[11px] tracking-widest uppercase
                        ${getThreatColor(roiList[inspectingRoiIdx]?.threatLevel)}
                     `}>
                        {roiList[inspectingRoiIdx]?.threatLevel}
                     </div>
                  </div>

                  <div className="px-1">
                     <h2 className="text-3xl lg:text-5xl font-black tracking-tighter mb-4 lg:mb-6 uppercase italic leading-[0.95] text-white drop-shadow-2xl">
                        {roiList[inspectingRoiIdx]?.label}
                     </h2>
                     <div className="flex flex-wrap items-center gap-3 lg:gap-5 mt-2 lg:mt-4">
                       <span className="text-[9px] lg:text-[13px] font-black text-white/40 uppercase tracking-[0.2em] lg:tracking-[0.4em]">
                         {roiList[inspectingRoiIdx]?.category}
                       </span>
                       <div className="flex items-center gap-2 lg:gap-3 text-cyan-400 px-3 py-1 lg:px-5 lg:py-2 bg-cyan-400/15 rounded-full border border-cyan-400/30">
                          <Activity size={12} lg:size={16} />
                          <span className="text-[9px] lg:text-[12px] font-mono font-black">{roiList[inspectingRoiIdx]?.confidence}% SYNC</span>
                       </div>
                     </div>
                     <p className="text-white/80 mt-6 lg:mt-10 text-[14px] lg:text-[18px] leading-relaxed font-medium tracking-tight italic border-l-2 border-cyan-400/30 pl-4 lg:pl-6">
                        {roiList[inspectingRoiIdx]?.description}
                     </p>
                  </div>

                  {/* RECOMMENDATION BLOCK */}
                  <div className="p-6 lg:p-10 glass-morphism rounded-[2.5rem] lg:rounded-[3.5rem] border-cyan-400/40 bg-cyan-400/10 shadow-[inset_0_0_40px_rgba(34,211,238,0.1)] backdrop-blur-[100px] relative overflow-hidden group">
                     <div className="absolute -top-6 -right-6 p-6 opacity-10 lg:-top-10 lg:-right-10 lg:p-10 group-hover:opacity-20 transition-opacity duration-1000">
                        <Zap size={100} className="text-cyan-400 lg:size-[160px]" />
                     </div>
                     <div className="flex items-center gap-3 lg:gap-5 mb-4 lg:mb-8">
                        <Zap size={18} className="text-cyan-400 shadow-sm shadow-cyan-400 lg:size-[26px]" />
                        <span className="text-[10px] lg:text-[14px] font-black uppercase tracking-[0.3em] lg:tracking-[0.5em] text-cyan-400 italic">ACTION_PROTOCOL</span>
                     </div>
                     <p className="text-lg lg:text-3xl font-black text-white leading-tight italic tracking-tight">
                        "{roiList[inspectingRoiIdx]?.recommendation}"
                     </p>
                  </div>

                  {/* TACTICAL RATIONALE */}
                  <div className="space-y-4 px-1 pb-8">
                     <div className="flex items-center gap-2 lg:gap-3 text-white/40 mb-2">
                        <Info size={12} lg:size={16} />
                        <span className="text-[8px] lg:text-[11px] font-black uppercase tracking-[0.2em] lg:tracking-[0.4em]">TACTICAL_RATIONALE</span>
                     </div>
                     <div className="grid gap-2 lg:gap-3">
                        {roiList[inspectingRoiIdx]?.rationale.map((r, i) => (
                          <div key={i} className="flex gap-3 lg:gap-4 items-start text-[11px] lg:text-[14px] text-white/70 italic leading-snug">
                            <div className="w-1 h-1 bg-cyan-400 rounded-full mt-1.5 flex-shrink-0 animate-pulse lg:w-1.5 lg:h-1.5" />
                            {r}
                          </div>
                        ))}
                     </div>
                     <div className="mt-6 p-4 bg-white/5 rounded-xl lg:rounded-2xl border border-white/5">
                        <span className="text-[8px] lg:text-[10px] font-black text-cyan-400/60 uppercase block mb-1.5 tracking-widest">WHY_IT_MATTERS</span>
                        <p className="text-[11px] lg:text-[13px] text-white/60 leading-relaxed italic">{roiList[inspectingRoiIdx]?.whyItMatters}</p>
                     </div>
                  </div>
               </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes scan-glow { 
          0% { transform: translateY(-110%); opacity: 0; } 
          40% { opacity: 1; } 
          60% { opacity: 1; } 
          100% { transform: translateY(110%); opacity: 0; } 
        }
        .scan-line { 
          height: 60vh; 
          background: linear-gradient(to bottom, transparent, rgba(34, 211, 238, 0.95), transparent); 
          animation: scan-glow 2.2s cubic-bezier(0.4, 0, 0.2, 1) infinite; 
          position: absolute; 
          width: 100%; 
          top: 0; 
          pointer-events: none; 
        }
        .animate-spin-slow { animation: spin 4s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
