"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPortalSession = exports.cancelSubscription = exports.stripeWebhook = exports.createCheckoutSession = exports.generateCaption = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const generative_ai_1 = require("@google/generative-ai");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const stripe_1 = require("stripe");
(0, app_1.initializeApp)();
const firestore = (0, firestore_1.getFirestore)();
const geminiApiKey = (0, params_1.defineSecret)("GEMINI_API_KEY");
const stripeSecretKey = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
const stripeWebhookSecret = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
const DAILY_CAPTION_LIMIT = 5;
exports.generateCaption = (0, https_1.onCall)({ secrets: [geminiApiKey], maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    // Per-user daily rate limit
    const uid = request.auth.uid;
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const rateLimitRef = firestore.doc(`captionUsage/${uid}_${today}`);
    const rateLimitSnap = await rateLimitRef.get();
    const currentCount = rateLimitSnap.exists ? (rateLimitSnap.data()?.count ?? 0) : 0;
    if (currentCount >= DAILY_CAPTION_LIMIT) {
        throw new https_1.HttpsError("resource-exhausted", `Daily limit reached (${DAILY_CAPTION_LIMIT}/day). Try again tomorrow.`);
    }
    const data = request.data;
    if (!data.title || !data.locations?.length) {
        throw new https_1.HttpsError("invalid-argument", "Title and locations required.");
    }
    const locationLines = data.locations.map((loc, i) => {
        const parts = [`${i + 1}. ${loc.label || loc.name}`];
        if (loc.city || loc.country) {
            parts.push(`(${[loc.city, loc.state, loc.country].filter(Boolean).join(", ")})`);
        }
        if (loc.description)
            parts.push(`- "${loc.description}"`);
        if (loc.rating)
            parts.push(`- ${loc.rating}/5 stars`);
        if (loc.priceTier)
            parts.push(`- ${loc.priceTier}`);
        if (loc.transportMode && i > 0)
            parts.push(`- ${loc.transportMode} here`);
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
    const genAI = new generative_ai_1.GoogleGenerativeAI(geminiApiKey.value());
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        // Parse — strip markdown fences if the model adds them anyway
        const cleaned = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "");
        const parsed = JSON.parse(cleaned);
        // Increment usage counter
        await rateLimitRef.set({ count: firestore_1.FieldValue.increment(1), uid, date: today }, { merge: true });
        return {
            caption: parsed.caption ?? "",
            hashtags: parsed.hashtags ?? "",
            shortCaption: parsed.shortCaption ?? "",
        };
    }
    catch (err) {
        console.error("[generateCaption] Gemini error:", err);
        throw new https_1.HttpsError("internal", "Caption generation failed. Try again.");
    }
});
// ── Stripe: Create Checkout Session ──
exports.createCheckoutSession = (0, https_1.onCall)({ secrets: [stripeSecretKey], maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    const { priceId, successUrl, cancelUrl } = request.data;
    if (!priceId || !successUrl || !cancelUrl) {
        throw new https_1.HttpsError("invalid-argument", "priceId, successUrl, and cancelUrl are required.");
    }
    const uid = request.auth.uid;
    const stripe = new stripe_1.default(stripeSecretKey.value());
    // Get or create Stripe customer
    const profileRef = firestore.doc(`users/${uid}/profile/main`);
    const profileSnap = await profileRef.get();
    let customerId = profileSnap.data()?.stripeCustomerId;
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
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
    });
    return { url: session.url };
});
// ── Stripe: Webhook ──
exports.stripeWebhook = (0, https_1.onRequest)({ secrets: [stripeSecretKey, stripeWebhookSecret] }, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
    }
    const stripe = new stripe_1.default(stripeSecretKey.value());
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret.value());
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[stripeWebhook] Signature verification failed:", message);
        res.status(400).send(`Webhook signature verification failed.`);
        return;
    }
    try {
        switch (event.type) {
            case "customer.subscription.created":
            case "customer.subscription.updated": {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const mappingSnap = await firestore.doc(`stripeCustomers/${customerId}`).get();
                const uid = mappingSnap.data()?.uid;
                if (uid) {
                    await firestore.doc(`users/${uid}/profile/main`).set({
                        subscriptionStatus: subscription.status,
                        subscriptionId: subscription.id,
                        subscriptionPriceId: subscription.items.data[0]?.price.id ?? null,
                        subscriptionCurrentPeriodEnd: subscription.items.data[0]?.current_period_end ?? null,
                    }, { merge: true });
                }
                break;
            }
            case "customer.subscription.deleted": {
                const subscription = event.data.object;
                const customerId = subscription.customer;
                const mappingSnap = await firestore.doc(`stripeCustomers/${customerId}`).get();
                const uid = mappingSnap.data()?.uid;
                if (uid) {
                    await firestore.doc(`users/${uid}/profile/main`).set({
                        subscriptionStatus: "canceled",
                        subscriptionId: null,
                        subscriptionPriceId: null,
                        subscriptionCurrentPeriodEnd: null,
                    }, { merge: true });
                }
                break;
            }
        }
        res.json({ received: true });
    }
    catch (err) {
        console.error("[stripeWebhook] Error processing event:", err);
        res.status(500).send("Webhook handler failed.");
    }
});
// ── Stripe: Cancel Subscription ──
exports.cancelSubscription = (0, https_1.onCall)({ secrets: [stripeSecretKey], maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    const uid = request.auth.uid;
    const profileSnap = await firestore.doc(`users/${uid}/profile/main`).get();
    const subscriptionId = profileSnap.data()?.subscriptionId;
    if (!subscriptionId) {
        throw new https_1.HttpsError("failed-precondition", "No active subscription found.");
    }
    const stripe = new stripe_1.default(stripeSecretKey.value());
    await stripe.subscriptions.cancel(subscriptionId);
    await firestore.doc(`users/${uid}/profile/main`).set({
        subscriptionStatus: "canceled",
        subscriptionId: null,
        subscriptionPriceId: null,
    }, { merge: true });
    return { success: true };
});
// ── Stripe: Customer Portal Session ──
exports.createPortalSession = (0, https_1.onCall)({ secrets: [stripeSecretKey], maxInstances: 10 }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    }
    const uid = request.auth.uid;
    const profileSnap = await firestore.doc(`users/${uid}/profile/main`).get();
    const customerId = profileSnap.data()?.stripeCustomerId;
    if (!customerId) {
        throw new https_1.HttpsError("failed-precondition", "No billing account found.");
    }
    const stripe = new stripe_1.default(stripeSecretKey.value());
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: request.data.returnUrl,
    });
    return { url: session.url };
});
//# sourceMappingURL=index.js.map