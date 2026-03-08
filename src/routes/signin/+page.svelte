<script lang="ts">
	import { goto } from '$app/navigation';
	import authState from '$lib/state/auth.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';

	type Mode = 'signin' | 'signup' | 'forgot';

	let mode = $state<Mode>('signin');
	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let submitting = $state(false);
	let resetSent = $state(false);

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

<div class="min-h-screen flex flex-col items-center justify-center bg-page text-text-primary px-4">
	<div class="w-full max-w-sm [&_button]:w-full">
		<div class="flex items-center justify-center gap-2 mb-6">
			<img src="/favicon-192.png" alt="" class="h-11" />
			<span class="text-4xl font-extrabold tracking-tight"><span class="text-text-primary">Trip</span><span class="text-accent">Stitch</span></span>
		</div>
		<p class="text-text-muted mb-8 text-lg text-center">Your trips deserve more than a camera roll</p>

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

			<Button variant="secondary" size="lg" onclick={handleGoogleSignIn} disabled={submitting}>
				<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
					<path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
					<path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
					<path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
					<path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
				</svg>
				Sign in with Google
			</Button>

			<p class="text-center text-sm text-text-muted mt-6">
				{#if mode === 'signin'}
					Don't have an account? <button type="button" class="text-accent hover:underline cursor-pointer" onclick={() => switchMode('signup')}>Sign up</button>
				{:else}
					Already have an account? <button type="button" class="text-accent hover:underline cursor-pointer" onclick={() => switchMode('signin')}>Sign in</button>
				{/if}
			</p>
		{/if}
	</div>
</div>
