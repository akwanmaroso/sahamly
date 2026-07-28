import "server-only";
import { GoogleGenAI } from "@google/genai";

export function createGeminiClient() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
}
