import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';
dotenv.config();

const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function classifyArticles(articles) {
    if (articles.length === 0) return [];

    const articlesText = articles.map((a, i) => `
ID: ${i}
Title: ${a.title}
Summary: ${a.summary}
Source: ${a.publisher}
`).join("\n---\n");

    const prompt = `
You are an intelligence analyst.
Be conservative and avoid false alarms.

Determine whether EACH of the following texts CONFIRMS that
military attacks between the United States and Iran have begun.

Rules:
- Speculation or preparation = NOT confirmed
- Uncertainty = NOT confirmed
- Official confirmation = confirmed

Return ONLY a JSON Array of objects:
[
  {
    "id": 0,
    "confirmed": true|false,
    "confidence": 0-100,
    "reason": "short explanation"
  },
  ...
]

ARTICLES:
${articlesText}
`;

    // Models to try in order of preference
    const MODELS = [
        // "gemini-3-flash-preview",
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-3-pro-preview"
    ];

    for (const modelName of MODELS) {
        // return [] // Uncomment to skip AI for testing
        try {
            console.log(`Trying model: ${modelName}...`);
            const response = await client.models.generateContent({
                model: modelName,
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            // Validate response structure
            if (!response.candidates || response.candidates.length === 0) {
                throw new Error("No candidates returned");
            }

            const text = response.candidates[0].content.parts[0].text;
            if (!text) throw new Error("Empty text response");

            // Clean markdown code blocks if present
            const cleanText = text.replace(/```json\n|\n```/g, "").trim();
            return JSON.parse(cleanText);

        } catch (error) {
            console.warn(`Model ${modelName} failed: ${error.message}`);
            // Continue to next model
        }
    }

    throw new Error("All Gemini models failed.");
}
