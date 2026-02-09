import { GeminiResponse, Message, MissionMode } from "../types";

export async function analyzeScene(
  base64Image: string,
  userPrompt: string,
  history: Message[],
  missionMode: MissionMode = "NEUTRAL"
): Promise<{ data: GeminiResponse; audioBase64?: string }> {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: base64Image,
      prompt: userPrompt,
      history,
      missionMode,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }

  return res.json();
}

/**
 * Decodes and plays raw PCM audio from Gemini TTS.
 * Gemini returns raw 16-bit PCM at 24kHz.
 * Native decodeAudioData is not compatible with raw PCM streams and causes ArrayBuffer type errors.
 */
export async function playTacticalAudio(base64Audio: string, audioCtx: AudioContext) {
  try {
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Manual decoding of raw PCM 16-bit data as per Gemini API requirements
    const dataInt16 = new Int16Array(bytes.buffer);
    const numChannels = 1;
    const sampleRate = 24000;
    const frameCount = dataInt16.length / numChannels;
    const buffer = audioCtx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0);
  } catch (err) {
    console.error("Audio playback failed:", err);
  }
}