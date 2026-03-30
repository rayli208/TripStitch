<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import profileState from '$lib/state/profile.svelte';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { startCheckout, openBillingPortal } from '$lib/services/subscriptionService';
	import toast from '$lib/state/toast.svelte';
	import { Check, X, Crown, PaintBrush, MapPin, Article } from 'phosphor-svelte';

	let loading = $state(false);
	let billingInterval = $state<'monthly' | 'yearly'>('monthly');

	async function handleUpgrade() {
		if (!authState.isSignedIn) {
			goto('/signin');
			return;
		}
		loading = true;
		try {
			await startCheckout(billingInterval);
		} catch (err) {
			console.error('[Pricing] Checkout failed:', err);
			toast.error('Failed to start checkout. Please try again.');
			loading = false;
		}
	}

	async function handleManage() {
		loading = true;
		try {
			await openBillingPortal();
		} catch (err) {
			console.error('[Pricing] Portal failed:', err);
			toast.error('Failed to open billing portal.');
			loading = false;
		}
	}
</script>

<svelte:head><title>Pricing | TripStitch</title></svelte:head>

<AppShell title="Pricing" showBack onback={() => history.back()}>
	<div class="max-w-lg mx-auto space-y-6 pb-8">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-text-primary">Upgrade to Pro</h1>
			<p class="text-sm text-text-muted mt-1">Unlock the full TripStitch experience.</p>
		</div>

		<!-- Billing Toggle -->
		<div class="flex justify-center">
			<div class="inline-flex rounded-xl border-2 border-border bg-card p-1 shadow-[2px_2px_0_var(--color-border)]">
				<button
					class="px-4 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer {billingInterval === 'monthly' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}"
					onclick={() => billingInterval = 'monthly'}
				>
					Monthly
				</button>
				<button
					class="px-4 py-1.5 rounded-lg text-sm font-bold transition-all cursor-pointer {billingInterval === 'yearly' ? 'bg-accent text-white shadow-sm' : 'text-text-muted hover:text-text-secondary'}"
					onclick={() => billingInterval = 'yearly'}
				>
					Yearly <span class="text-[10px] opacity-80">Save 17%</span>
				</button>
			</div>
		</div>

		<!-- Pro Card -->
		<div class="bg-card border-3 border-accent rounded-2xl p-6 shadow-[4px_4px_0_var(--color-accent)]">
			<div class="flex items-center gap-2 mb-1">
				<Crown size={20} weight="fill" class="text-accent" />
				<h2 class="text-xl font-bold text-text-primary">TripStitch Pro</h2>
			</div>
			<div class="mb-4">
				{#if billingInterval === 'monthly'}
					<p class="text-3xl font-extrabold text-accent">$5.99<span class="text-base font-normal text-text-muted">/month</span></p>
				{:else}
					<p class="text-3xl font-extrabold text-accent">$59.99<span class="text-base font-normal text-text-muted">/year</span></p>
					<p class="text-xs text-accent/70 mt-0.5">~$5.00/month, billed annually</p>
				{/if}
			</div>

			<ul class="space-y-2.5 mb-6">
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Article size={16} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
					<span><strong>Travel blogs</strong> with embedded locations and routes</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<MapPin size={16} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
					<span><strong>Location spotlights</strong> for video overlays</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<PaintBrush size={16} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
					<span><strong>Custom colors & fonts</strong> for your videos</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Check size={16} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
					<span><strong>Logo watermark</strong> on your videos</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Check size={16} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
					<span><strong>Social links</strong> in your video outro</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Check size={16} weight="bold" class="text-accent flex-shrink-0 mt-0.5" />
					<span>Everything in Free</span>
				</li>
			</ul>

			<div class="[&>button]:w-full">
				{#if profileState.isPro}
					<Button variant="secondary" onclick={handleManage} disabled={loading}>
						{loading ? 'Loading...' : 'Manage Subscription'}
					</Button>
				{:else}
					<Button variant="primary" onclick={handleUpgrade} disabled={loading}>
						{loading ? 'Loading...' : 'Upgrade to Pro'}
					</Button>
				{/if}
			</div>
		</div>

		<!-- Free comparison -->
		<div class="bg-card border-2 border-border rounded-2xl p-6 shadow-[3px_3px_0_var(--color-border)]">
			<h3 class="font-bold text-text-primary mb-1">Free</h3>
			<p class="text-2xl font-extrabold text-text-primary mb-4">$0<span class="text-sm font-normal text-text-muted">/forever</span></p>
			<ul class="space-y-2">
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Check size={16} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
					<span>Trip videos with map transitions</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Check size={16} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
					<span>Up to 8 locations, 5 clips each</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-secondary">
					<Check size={16} weight="bold" class="text-success flex-shrink-0 mt-0.5" />
					<span>All 6 map styles + music library</span>
				</li>
				<li class="flex items-start gap-2.5 text-sm text-text-muted">
					<X size={16} weight="bold" class="text-text-muted flex-shrink-0 mt-0.5" />
					<span>No blogs, spotlights, or custom branding</span>
				</li>
			</ul>
		</div>
	</div>
</AppShell>
