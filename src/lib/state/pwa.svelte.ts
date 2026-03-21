export type InstallPlatform =
	| 'ios-safari'
	| 'ios-chrome'
	| 'ios-other'
	| 'android'
	| 'desktop-chrome'
	| 'desktop-safari'
	| 'desktop-other';

function detectPlatform(): InstallPlatform {
	if (typeof navigator === 'undefined') return 'desktop-other';

	const ua = navigator.userAgent;
	const isIOS = /iPad|iPhone|iPod/.test(ua);
	const isSafari = /^Apple/.test(navigator.vendor) && !/CriOS|FxiOS/.test(ua);
	const isChrome = /Chrome/.test(ua) && !/Edg/.test(ua);
	const isAndroid = /Android/.test(ua);

	if (isIOS) {
		if (isSafari) return 'ios-safari';
		if (/CriOS/.test(ua)) return 'ios-chrome';
		return 'ios-other';
	}
	if (isAndroid) return 'android';
	if (isSafari) return 'desktop-safari';
	if (isChrome) return 'desktop-chrome';
	return 'desktop-other';
}

function createPwaState() {
	let deferredPrompt = $state<any>(null);
	let isStandalone = $state(false);
	let dismissed = $state(false);

	const platform = detectPlatform();

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
			return platform.startsWith('ios');
		},
		get platform() {
			return platform;
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
