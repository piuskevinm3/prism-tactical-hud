import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { NextResponse } from "next/server";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function POST(req: Request) {
  try {
    const { image, prompt, history, focusMode } = await req.json();

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        ...history,
        {
          role: "user",
          parts: [
            { text: `SYSTEM: You are PRISM v12.6. Mode: ${focusMode}.
                     TASK: Identify 3-5 key objects. 
                     MANDATORY JSON OUTPUT:
                     {
                       "verbal": "Witty JARVIS-style response",
                       "roi": [{
                         "label": "Name",
                         "x": 0-100, "y": 0-100,
                         "category": "Type",
                         "confidence": 0-100,
                         "safetyRating": "SECURE | CAUTION | HAZARD",
                         "description": "2-sentence technical analysis",
                         "recommendation": "1-sentence tactical advice"
                       }]
                     }` 
            },
            { inlineData: { mimeType: "image/jpeg", data: image.split(',')[1] }, mediaResolution: { level: "media_resolution_high" } }
          ]
        }
      ],
      config: {
        thinkingConfig: { includeThoughts: true, thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: "application/json"
      }
    });

    const candidate = response.candidates?.[0] as any;
    let text = "";
    let thoughts = "";

    candidate.content.parts.forEach((p: any) => {
      if (p.thought) thoughts += p.text;
      if (p.text) text += p.text;
    });

    const json = JSON.parse(text);

    return NextResponse.json({
      data: json,
      thoughts: thoughts,
      thoughtSignature: candidate.thoughtSignature
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}