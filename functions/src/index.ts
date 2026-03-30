import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";

initializeApp();
const firestore = getFirestore();

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
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

// ── Stripe: Create Checkout Session ──

export const createCheckoutSession = onCall(
  { secrets: [stripeSecretKey], maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const { priceId, successUrl, cancelUrl } = request.data as {
      priceId: string;
      successUrl: string;
      cancelUrl: string;
    };

    if (!priceId || !successUrl || !cancelUrl) {
      throw new HttpsError("invalid-argument", "priceId, successUrl, and cancelUrl are required.");
    }

    const uid = request.auth.uid;
    const stripe = new Stripe(stripeSecretKey.value());

    // Get or create Stripe customer
    const profileRef = firestore.doc(`users/${uid}/profile/main`);
    const profileSnap = await profileRef.get();
    let customerId = profileSnap.data()?.stripeCustomerId as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: request.auth.token.email ?? undefined,
        metadata: { firebaseUid: uid },
      });
      customerId = customer.id;

      // Store customer ID on profile and in lookup collection
      await profileRef.set({ stripeCustomerId: customerId }, { merge: true });
      await firestore.doc(`stripeCustomers/${customerId}`).set({ uid });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      allow_promotion_codes: true,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
    });

    return { url: session.url };
  }
);

// ── Stripe: Webhook ──

export const stripeWebhook = onRequest(
  { secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const sig = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        stripeWebhookSecret.value()
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[stripeWebhook] Signature verification failed:", message);
      res.status(400).send(`Webhook signature verification failed.`);
      return;
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          const mappingSnap = await firestore.doc(`stripeCustomers/${customerId}`).get();
          const uid = mappingSnap.data()?.uid as string | undefined;

          if (uid) {
            await firestore.doc(`users/${uid}/profile/main`).set(
              {
                subscriptionStatus: subscription.status,
                subscriptionId: subscription.id,
                subscriptionPriceId: subscription.items.data[0]?.price.id ?? null,
                subscriptionCurrentPeriodEnd: subscription.items.data[0]?.current_period_end ?? null,
              },
              { merge: true }
            );
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          const mappingSnap = await firestore.doc(`stripeCustomers/${customerId}`).get();
          const uid = mappingSnap.data()?.uid as string | undefined;

          if (uid) {
            await firestore.doc(`users/${uid}/profile/main`).set(
              {
                subscriptionStatus: "canceled",
                subscriptionId: null,
                subscriptionPriceId: null,
                subscriptionCurrentPeriodEnd: null,
              },
              { merge: true }
            );
          }
          break;
        }
      }

      res.json({ received: true });
    } catch (err: unknown) {
      console.error("[stripeWebhook] Error processing event:", err);
      res.status(500).send("Webhook handler failed.");
    }
  }
);

// ── Stripe: Cancel Subscription ──

export const cancelSubscription = onCall(
  { secrets: [stripeSecretKey], maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;
    const profileSnap = await firestore.doc(`users/${uid}/profile/main`).get();
    const subscriptionId = profileSnap.data()?.subscriptionId as string | undefined;

    if (!subscriptionId) {
      throw new HttpsError("failed-precondition", "No active subscription found.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    await stripe.subscriptions.cancel(subscriptionId);

    await firestore.doc(`users/${uid}/profile/main`).set(
      {
        subscriptionStatus: "canceled",
        subscriptionId: null,
        subscriptionPriceId: null,
      },
      { merge: true }
    );

    return { success: true };
  }
);

// ── Stripe: Customer Portal Session ──

export const createPortalSession = onCall(
  { secrets: [stripeSecretKey], maxInstances: 10 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const uid = request.auth.uid;
    const profileSnap = await firestore.doc(`users/${uid}/profile/main`).get();
    const customerId = profileSnap.data()?.stripeCustomerId as string | undefined;

    if (!customerId) {
      throw new HttpsError("failed-precondition", "No billing account found.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: (request.data as { returnUrl: string }).returnUrl,
    });

    return { url: session.url };
  }
);
