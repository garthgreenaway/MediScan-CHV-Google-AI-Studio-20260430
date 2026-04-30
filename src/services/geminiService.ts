import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function performTriage(age: number, temp: number, duration: number, symptoms: string, location: string) {
  const prompt = `
    You are a pediatric triage assistant for Community Health Volunteers (CHVs) in rural districts. 
    Your goal is to quickly assess child symptoms and recommend immediate actions.

    Rules:
    1. Analyze symptoms: Age, Temperature, Duration, Key Symptoms (cough, vomiting, rash, etc.), Location.
    2. Output MUST be in this exact JSON format:
    {
      "risk_level": "Low | Medium | High",
      "likely_condition": "Malaria | Pneumonia | Malnutrition | Other",
      "immediate_action": "Refer to clinic | Home care | Monitor closely",
      "alert_district": true | false
    }
    3. Keep responses under 50 words. If symptoms suggest malaria/pneumonia + high fever, set alert_district to true.
    4. If age < 5 and fever > 38.5°C for > 2 days, automatically set risk_level to High.

    Input:
    Child: ${age}
    Temperature: ${temp}°C
    Duration: ${duration} days
    Symptoms: ${symptoms}
    Location: ${location}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  return JSON.parse(response.text || "{}");
}

export async function performMalnutritionScan(base64Image: string) {
  const prompt = `
    Analyze this image for malnutrition indicators. Return exactly this JSON:
    {
      "muac_estimate_cm": "number",
      "wasting_signs": "Yes | No",
      "confidence": "High | Medium | Low"
    }
  `;

  // Remove data URL prefix if present
  const data = base64Image.includes(",") ? base64Image.split(",")[1] : base64Image;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: prompt },
        { inlineData: { data, mimeType: "image/jpeg" } }
      ]
    },
    config: {
      responseMimeType: "application/json",
    }
  });

  return JSON.parse(response.text || "{}");
}
