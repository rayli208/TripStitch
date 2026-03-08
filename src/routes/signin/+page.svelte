<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import { MapTrifold, Camera, Sparkle, Lock, Timer, CurrencyDollar } from 'phosphor-svelte';

	type Mode = 'signin' | 'signup' | 'forgot';

	let mode = $state<Mode>('signin');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let submitting = $state(false);
	let resetSent = $state(false);

	let ready = $state(false);
	$effect(() => {
		const t = setTimeout(() => { ready = true; }, 100);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (authState.isSignedIn) goto('/create');
	});

	function switchMode(newMode: Mode) {
		mode = newMode;
		error = '';
		password = '';
		confirmPassword = '';
		resetSent = false;
	}

	function mapFirebaseError(code: string): string {
		switch (code) {
			case 'auth/email-already-in-use':
				return 'An account with this email already exists.';
			case 'auth/invalid-credential':
				return 'Invalid email or password.';
			case 'auth/weak-password':
				return 'Password must be at least 6 characters.';
			case 'auth/too-many-requests':
				return 'Too many attempts. Please try again later.';
			case 'auth/invalid-email':
				return 'Please enter a valid email address.';
			default:
				return 'Something went wrong. Please try again.';
		}
	}

	function validate(): string | null {
		if (mode === 'signup' && !name.trim()) return 'Name is required.';
		if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
		if (mode === 'forgot') return null;
		if (password.length < 6) return 'Password must be at least 6 characters.';
		if (mode === 'signup' && password !== confirmPassword) return 'Passwords do not match.';
		return null;
	}

	async function handleSubmit() {
		const validationError = validate();
		if (validationError) {
			error = validationError;
			return;
		}

		try {
			error = '';
			submitting = true;

			if (mode === 'signin') {
				await authState.signInWithEmail(email, password);
				goto('/create');
			} else if (mode === 'signup') {
				await authState.signUpWithEmail(email, password, name.trim());
				goto('/create');
			} else {
				await authState.resetPassword(email).catch(() => {});
				resetSent = true;
			}
		} catch (e: unknown) {
			const code = (e as { code?: string }).code ?? '';
			error = mapFirebaseError(code);
		} finally {
			submitting = false;
		}
	}

	async function handleGoogleSignIn() {
		try {
			error = '';
			submitting = true;
			await authState.signInWithGoogle();
			goto('/create');
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Sign-in failed';
			if (!msg.includes('popup-closed-by-user')) {
				error = msg;
			}
		} finally {
			submitting = false;
		}
	}
</script>

<style>
	@keyframes fade-up {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}
	.animate-fade-up { animation: fade-up 0.6s ease-out forwards; }
	.delay-100 { animation-delay: 0.1s; }
	.delay-200 { animation-delay: 0.2s; }
	.fill-both { animation-fill-mode: both; }

	/* Grain overlay for left panel */
	.grain-panel::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		opacity: 0.06;
		filter: url(#grain-filter-signin);
	}

	/* Floating sticker cards */
	.sticker {
		transition: transform 0.3s ease;
	}
	.sticker:hover {
		transform: scale(1.05) !important;
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-fade-up { animation: none; opacity: 1; transform: none; }
	}
</style>

<div class="min-h-screen flex bg-page text-text-primary">
	<!-- SVG filter for grain -->
	<svg class="hidden">
		<filter id="grain-filter-signin">
			<feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
		</filter>
	</svg>

	<!-- Left decorative panel (lg+ only) -->
	<div class="hidden lg:flex lg:w-[45%] relative bg-accent grain-panel overflow-hidden flex-col justify-between p-10">
		<!-- Large dashed route line -->
		<svg class="absolute inset-0 w-full h-full" viewBox="0 0 500 800" preserveAspectRatio="none" aria-hidden="true">
			<path
				d="M50,750 C100,500 400,600 300,400 S100,300 250,150 S400,50 450,100"
				fill="none"
				stroke="white"
				stroke-width="2.5"
				stroke-dasharray="10 6"
				stroke-linecap="round"
				opacity="0.3"
			/>
			<circle cx="50" cy="750" r="5" fill="white" opacity="0.4" />
			<circle cx="300" cy="400" r="5" fill="white" opacity="0.4" />
			<circle cx="250" cy="150" r="5" fill="white" opacity="0.4" />
		</svg>


		<!-- Floating sticker cards -->
		<div class="relative z-10 flex-1 flex items-center justify-center">
			<div class="relative w-full max-w-xs h-64">
				<div class="sticker absolute top-0 left-4 bg-white text-black border-3 border-border rounded-xl px-4 py-3 shadow-brutal-lg" style="transform: rotate(-6deg);">
					<div class="flex items-center gap-2">
						<MapTrifold size={20} weight="bold" class="text-accent" />
						<span class="font-bold text-sm">6 Map Styles</span>
					</div>
				</div>
				<div class="sticker absolute top-20 right-2 bg-white text-black border-3 border-border rounded-xl px-4 py-3 shadow-brutal-lg" style="transform: rotate(4deg);">
					<div class="flex items-center gap-2">
						<Camera size={20} weight="bold" class="text-accent" />
						<span class="font-bold text-sm">Photos & Video</span>
					</div>
				</div>
				<div class="sticker absolute bottom-4 left-8 bg-white text-black border-3 border-border rounded-xl px-4 py-3 shadow-brutal-lg" style="transform: rotate(-3deg);">
					<div class="flex items-center gap-2">
						<Sparkle size={20} weight="bold" class="text-accent" />
						<span class="font-bold text-sm">AI Captions</span>
					</div>
				</div>
			</div>
		</div>

		<!-- Bottom tagline -->
		<div class="relative z-10">
			<p class="text-white font-bold text-xl leading-snug">
				Turn your trips into<br />cinematic videos
			</p>
		</div>
	</div>

	<!-- Right panel (form) -->
	<div class="flex-1 flex flex-col items-center justify-center px-4 py-12 lg:border-l-3 lg:border-border">
		<div class="w-full max-w-sm [&_button]:w-full {ready ? 'animate-fade-up fill-both' : 'opacity-0'}">
			<!-- Logo + tagline -->
			<div class="flex items-center justify-center gap-2 mb-2">
				<img src="/favicon-192.png" alt="" class="h-11" />
				<span class="text-4xl font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
			</div>
			<p class="text-text-muted mb-8 text-lg text-center">Your trips deserve more than a camera roll</p>

			<!-- Form card -->
			<div class="bg-card border-3 border-border rounded-2xl shadow-brutal-lg p-8 {ready ? 'animate-fade-up fill-both delay-100' : 'opacity-0'}">
				{#if mode === 'forgot'}
					<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
						<Input label="Email" type="email" placeholder="you@example.com" bind:value={email} />

						{#if resetSent}
							<p class="text-sm text-green-400">If an account exists with that email, a reset link has been sent.</p>
						{/if}

						<Button variant="primary" size="lg" onclick={handleSubmit} disabled={submitting}>
							{submitting ? 'Sending...' : 'Send Reset Link'}
						</Button>

						{#if error}
							<p class="text-error text-sm">{error}</p>
						{/if}

						<p class="text-center text-sm text-text-muted">
							<button type="button" class="text-accent hover:underline cursor-pointer" onclick={() => switchMode('signin')}>Back to sign in</button>
						</p>
					</form>
				{:else}
					<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
						{#if mode === 'signup'}
							<Input label="Name" placeholder="Your name" bind:value={name} />
						{/if}

						<Input label="Email" type="email" placeholder="you@example.com" bind:value={email} />
						<Input label="Password" type="password" placeholder="At least 6 characters" bind:value={password} />

						{#if mode === 'signup'}
							<Input label="Confirm Password" type="password" placeholder="Re-enter password" bind:value={confirmPassword} />
						{/if}

						{#if mode === 'signin'}
							<div class="text-right">
								<button type="button" class="text-sm text-accent hover:underline cursor-pointer" onclick={() => switchMode('forgot')}>Forgot password?</button>
							</div>
						{/if}

						<Button variant="primary" size="lg" onclick={handleSubmit} disabled={submitting}>
							{#if submitting}
								<div class="w-5 h-5 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
							{/if}
							{mode === 'signin' ? (submitting ? 'Signing in...' : 'Sign In') : (submitting ? 'Creating account...' : 'Create Account')}
						</Button>

						{#if error}
							<p class="text-error text-sm">{error}</p>
						{/if}
					</form>

					<div class="flex items-center gap-3 my-6">
						<div class="flex-1 h-px bg-border"></div>
						<span class="text-text-muted text-sm">OR</span>
						<div class="flex-1 h-px bg-border"></div>
					</div>

					<button
						type="button"
						class="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-card border-2 border-border shadow-[4px_4px_0_var(--color-border)] hover:shadow-[2px_2px_0_var(--color-border)] hover:translate-x-[2px] hover:translate-y-[2px] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all cursor-pointer disabled:opacity-50"
						onclick={handleGoogleSignIn}
						disabled={submitting}
					>
						<svg class="w-5 h-5" viewBox="0 0 24 24">
							<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
							<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
							<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
							<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
						</svg>
						Sign in with Google
					</button>

					<p class="text-center text-sm text-text-muted mt-6">
						{#if mode === 'signin'}
							Don't have an account? <button type="button" class="text-accent hover:underline cursor-pointer" onclick={() => switchMode('signup')}>Sign up</button>
						{:else}
							Already have an account? <button type="button" class="text-accent hover:underline cursor-pointer" onclick={() => switchMode('signin')}>Sign in</button>
						{/if}
					</p>
				{/if}
			</div>

			<!-- Value reinforcement -->
			<div class="flex items-center justify-center gap-6 mt-6 text-text-muted text-xs {ready ? 'animate-fade-up fill-both delay-200' : 'opacity-0'}">
				<div class="flex items-center gap-1.5">
					<Lock size={14} weight="bold" />
					<span>No uploads</span>
				</div>
				<div class="flex items-center gap-1.5">
					<Timer size={14} weight="bold" />
					<span>Ready in minutes</span>
				</div>
				<div class="flex items-center gap-1.5">
					<CurrencyDollar size={14} weight="bold" />
					<span>100% free</span>
				</div>
			</div>
		</div>
	</div>
</div>
