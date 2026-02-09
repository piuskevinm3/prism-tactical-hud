
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { GeminiResponse, Message, InsightFocus, VoiceGender } from "../types";

// Initialize AI with the provided API Key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeScene = async (
  base64Image: string,
  userPrompt: string,
  history: Message[],
  focusMode: InsightFocus,
  voiceGender: VoiceGender
): Promise<{ data: GeminiResponse; audioBase64?: string }> => {
  
  const focusContexts: Record<InsightFocus, string> = {
    GENERAL: "Analyze the scene holistically. Identify specific objects and their tactical relevance.",
    HOME_SAFETY: "Focus on safety: detect tripping hazards, electrical risks, sharp edges, or unsecured items.",
    WELLNESS: "Focus on mental well-being: analyze lighting quality, plant health, and ergonomic comfort.",
    HOBBY_HELP: "Focus on tools and creativity: identify specific hardware or materials and suggest improvements.",
    WORKSPACE: "Focus on productivity: analyze desk ergonomics, screen placement, and clutter management."
  };

  const systemPrompt = `SYSTEM: You are PRISM, an advanced 'Environmental Intelligence' tactical interface.
PERSONALITY: Elite, cinematic, and data-driven. Your analysis is sharp and decisive.
FOCUS: ${focusContexts[focusMode]}
MODE: ${userPrompt ? 'COMMANDED' : 'AUTONOMOUS'}

CRITICAL INSTRUCTIONS:
1. NO GENERIC LABELS: Do not use labels like "Primary Subject", "Neutral Backdrop", or "Object". You MUST identify the specific noun (e.g., "Herman Miller Chair", "Dell 4K Monitor", "Ceramic Coffee Mug").
2. TACTICAL RECOMMENDATIONS: Every recommendation must be a specific ACTION the user should take based on the ${focusMode} mode.
3. LOGIC TRACE: Provide a technical 2-part rationale for how you identified the object.

OUTPUT PROTOCOL:
Return a JSON object with:
- "verbal": A cinematic tactical report (max 15 words).
- "summaryRationale": A brief tactical overview.
- "ambientScore": 0-100 environmental efficiency.
- "moodDescriptor": One sophisticated word for the atmosphere.
- "roi": An array of exactly 3 tactical points.

Each ROI must include:
- "label": Specific name of the item.
- "x", "y": Normalized coordinates (0-100).
- "description": Tactical summary.
- "safetyRating": SECURE, ADVISORY, or ATTENTION.
- "category": ELECTRONIC, ORGANIC, STRUCTURAL, TOOL, or UNKNOWN.
- "confidence": percentage.
- "rationale": 2 specific logic points.
- "whyItMatters": Contextual significance.
- "recommendation": A specific ACTIONABLE instruction.`;

  try {
    const analysisResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        {
          role: "user",
          parts: [
            { text: userPrompt || "Initialize full spectrum tactical scan." },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verbal: { type: Type.STRING },
            summaryRationale: { type: Type.STRING },
            ambientScore: { type: Type.NUMBER },
            moodDescriptor: { type: Type.STRING },
            roi: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  description: { type: Type.STRING },
                  safetyRating: { type: Type.STRING, enum: ['SECURE', 'ADVISORY', 'ATTENTION'] },
                  category: { type: Type.STRING, enum: ['ELECTRONIC', 'ORGANIC', 'STRUCTURAL', 'TOOL', 'UNKNOWN'] },
                  confidence: { type: Type.NUMBER },
                  rationale: { type: Type.ARRAY, items: { type: Type.STRING } },
                  whyItMatters: { type: Type.STRING },
                  recommendation: { type: Type.STRING }
                },
                required: ["label", "x", "y", "description", "safetyRating", "category", "confidence", "rationale", "whyItMatters", "recommendation"]
              }
            }
          },
          required: ["verbal", "roi", "ambientScore", "moodDescriptor"]
        }
      }
    });

    const data: GeminiResponse = JSON.parse(analysisResponse.text);
    const voiceName = voiceGender === 'MALE' ? 'Puck' : 'Kore';

    let audioBase64: string | undefined;
    try {
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: data.verbal }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
        }
      });
      audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    } catch (e) {
      console.warn("PRISM // TTS Bypass Active.");
    }

    return { data, audioBase64 };
  } catch (err: any) {
    console.error("PRISM // Neural Analysis Failure:", err);
    throw err;
  }
};

export async function playTacticalAudio(base64: string, ctx: AudioContext) {
  try {
    if (ctx.state === 'suspended') await ctx.resume();

    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    const dataInt16 = new Int16Array(bytes.buffer);
    const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < dataInt16.length; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  } catch (err) {
    console.error("PRISM // Audio playback failure:", err);
  }
}
