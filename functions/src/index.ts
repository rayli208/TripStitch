import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const firestore = getFirestore();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const DAILY_CAPTION_LIMIT = 5;

interface LocationData {
  name: string;
  label?: string | null;
  description?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  transportMode?: string | null;
  rating?: number | null;
  priceTier?: string | null;
}

interface CaptionRequest {
  title: string;
  titleDescription?: string;
  locations: LocationData[];
  tags?: string[];
  tripDate?: string;
  stats?: { stops: number; miles: number; minutes: number };
}

export const generateCaption = onCall(
  { secrets: [geminiApiKey], maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    // Per-user daily rate limit
    const uid = request.auth.uid;
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const rateLimitRef = firestore.doc(`captionUsage/${uid}_${today}`);
    const rateLimitSnap = await rateLimitRef.get();
    const currentCount = rateLimitSnap.exists ? (rateLimitSnap.data()?.count ?? 0) : 0;

    if (currentCount >= DAILY_CAPTION_LIMIT) {
      throw new HttpsError(
        "resource-exhausted",
        `Daily limit reached (${DAILY_CAPTION_LIMIT}/day). Try again tomorrow.`
      );
    }

    const data = request.data as CaptionRequest;
    if (!data.title || !data.locations?.length) {
      throw new HttpsError("invalid-argument", "Title and locations required.");
    }

    const locationLines = data.locations.map((loc, i) => {
      const parts = [`${i + 1}. ${loc.label || loc.name}`];
      if (loc.city || loc.country) {
        parts.push(`(${[loc.city, loc.state, loc.country].filter(Boolean).join(", ")})`);
      }
      if (loc.description) parts.push(`- "${loc.description}"`);
      if (loc.rating) parts.push(`- ${loc.rating}/5 stars`);
      if (loc.priceTier) parts.push(`- ${loc.priceTier}`);
      if (loc.transportMode && i > 0) parts.push(`- ${loc.transportMode} here`);
      return parts.join(" ");
    });

    const prompt = `You are a travel content writer. Generate a social media caption for a trip video.

TRIP INFO:
- Title: "${data.title}"
${data.titleDescription ? `- Description: "${data.titleDescription}"` : ""}
${data.tripDate ? `- Date: ${data.tripDate}` : ""}
${data.tags?.length ? `- Tags: ${data.tags.join(", ")}` : ""}
${data.stats ? `- Stats: ${data.stats.stops} stops, ${data.stats.miles} miles, ~${data.stats.minutes} min travel` : ""}

LOCATIONS:
${locationLines.join("\n")}

Return a JSON object with exactly these fields:
{
  "caption": "An engaging, authentic 2-4 sentence caption. Use a conversational tone — not overly polished or influencer-cringe. Include a subtle call-to-action like asking a question. Works for Instagram, TikTok, YouTube Shorts, and Facebook.",
  "hashtags": "15-20 hashtags as a single string, space-separated. Mix broad (#travel #wanderlust) with specific ones based on locations and activities. Include location-specific tags.",
  "shortCaption": "A punchy 1-sentence version for TikTok/Reels where captions are short."
}

Return ONLY the JSON object, no markdown fencing.`;

    const genAI = new GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Parse — strip markdown fences if the model adds them anyway
      const cleaned = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned);

      // Increment usage counter
      await rateLimitRef.set(
        { count: FieldValue.increment(1), uid, date: today },
        { merge: true }
      );

      return {
        caption: parsed.caption ?? "",
        hashtags: parsed.hashtags ?? "",
        shortCaption: parsed.shortCaption ?? "",
      };
    } catch (err: unknown) {
      console.error("[generateCaption] Gemini error:", err);
      throw new HttpsError("internal", "Caption generation failed. Try again.");
    }
  }
);
