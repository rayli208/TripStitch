function createPwaState() {
	let deferredPrompt = $state<any>(null);
	let isStandalone = $state(false);
	let dismissed = $state(false);

	const isIOS =
		typeof navigator !== 'undefined' &&
		/iPad|iPhone|iPod/.test(navigator.userAgent) &&
		!(navigator as any).standalone;

	if (typeof window !== 'undefined') {
		isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(navigator as any).standalone === true;

		dismissed = localStorage.getItem('pwa-install-dismissed') === 'true';

		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
		});

		window.addEventListener('appinstalled', () => {
			deferredPrompt = null;
			isStandalone = true;
		});
	}

	return {
		get canInstall() {
			return deferredPrompt !== null;
		},
		get isStandalone() {
			return isStandalone;
		},
		get dismissed() {
			return dismissed;
		},
		get isIOS() {
			return isIOS;
		},

		async install() {
			if (!deferredPrompt) return;
			deferredPrompt.prompt();
			const { outcome } = await deferredPrompt.userChoice;
			if (outcome === 'accepted') {
				deferredPrompt = null;
			}
		},

		dismiss() {
			dismissed = true;
			localStorage.setItem('pwa-install-dismissed', 'true');
		}
	};
}

const pwaState = createPwaState();
export default pwaState;
