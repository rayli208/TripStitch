import { functions } from '$lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { PUBLIC_STRIPE_MONTHLY_PRICE_ID, PUBLIC_STRIPE_YEARLY_PRICE_ID } from '$env/static/public';

const MONTHLY_PRICE_ID = PUBLIC_STRIPE_MONTHLY_PRICE_ID;
const YEARLY_PRICE_ID = PUBLIC_STRIPE_YEARLY_PRICE_ID;

export type BillingInterval = 'monthly' | 'yearly';

function getPriceId(interval: BillingInterval): string {
	return interval === 'yearly' ? YEARLY_PRICE_ID : MONTHLY_PRICE_ID;
}

export async function startCheckout(interval: BillingInterval): Promise<void> {
	const createCheckoutSession = httpsCallable<
		{ priceId: string; successUrl: string; cancelUrl: string },
		{ url: string }
	>(functions, 'createCheckoutSession');

	const { data } = await createCheckoutSession({
		priceId: getPriceId(interval),
		successUrl: `${window.location.origin}/trips`,
		cancelUrl: `${window.location.origin}/pricing`,
	});

	if (data.url) {
		window.location.href = data.url;
	}
}

export async function cancelMembership(): Promise<void> {
	const cancel = httpsCallable<Record<string, never>, { success: boolean }>(functions, 'cancelSubscription');
	await cancel({});
}

export async function openBillingPortal(): Promise<void> {
	const createPortalSession = httpsCallable<
		{ returnUrl: string },
		{ url: string }
	>(functions, 'createPortalSession');

	const { data } = await createPortalSession({
		returnUrl: window.location.href,
	});

	if (data.url) {
		window.location.href = data.url;
	}
}
