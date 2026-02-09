
export type MissionMode = 'NEUTRAL' | 'CIVILIAN_SAFETY' | 'FIELD_REPAIR' | 'EMERGENCY_RESPONSE' | 'TACTICAL_SURVEILLANCE';

export interface ROI {
  label: string;
  x: number;
  y: number;
  thumbnail?: string;
  description: string;
  threatLevel: 'MINIMAL' | 'CAUTION' | 'HAZARD';
  category: 'ELECTRONIC' | 'ORGANIC' | 'STRUCTURAL' | 'TOOL' | 'UNKNOWN';
}

export interface GeminiResponse {
  verbal: string;
  roi: ROI[];
  logicPath?: string;
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}