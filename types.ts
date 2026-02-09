export type InsightFocus = 'GENERAL' | 'HOME_SAFETY' | 'WELLNESS' | 'HOBBY_HELP' | 'WORKSPACE';
export type VoiceGender = 'MALE' | 'FEMALE';
export type MissionMode = 'NEUTRAL' | 'CIVILIAN_SAFETY' | 'FIELD_REPAIR' | 'EMERGENCY_RESPONSE' | 'TACTICAL_SURVEILLANCE';

export interface ROI {
  label: string;
  x: number;
  y: number;
  thumbnail?: string;
  description: string;
  threatLevel: 'MINIMAL' | 'CAUTION' | 'HAZARD';
  category: 'ELECTRONIC' | 'ORGANIC' | 'STRUCTURAL' | 'TOOL' | 'UNKNOWN';
  confidence: number;
  rationale: string[];
  uncertaintyFactors?: string[];
  whyItMatters: string;
  recommendation: string; 
}

export interface GeminiResponse {
  verbal: string;
  roi: ROI[];
  summaryRationale: string;
  ambientScore: number;
  moodDescriptor: string;
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}