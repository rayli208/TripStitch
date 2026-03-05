export type ThemeMode = 'system' | 'light' | 'dark';

function createThemeState() {
	let mode = $state<ThemeMode>('system');
	let systemPrefersDark = $state(false);

	const isDark = $derived(
		mode === 'dark' || (mode === 'system' && systemPrefersDark)
	);

	function apply() {
		const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark);
		document.documentElement.classList.toggle('dark', dark);
	}

	function init() {
		const saved = localStorage.getItem('theme-mode') as ThemeMode | null;
		if (saved === 'light' || saved === 'dark') {
			mode = saved;
		}

		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		systemPrefersDark = mq.matches;
		mq.addEventListener('change', (e) => {
			systemPrefersDark = e.matches;
			apply();
		});

		apply();
	}

	function setMode(newMode: ThemeMode) {
		mode = newMode;
		if (newMode === 'system') {
			localStorage.removeItem('theme-mode');
		} else {
			localStorage.setItem('theme-mode', newMode);
		}
		apply();
	}

	return {
		get mode() { return mode; },
		get isDark() { return isDark; },
		init,
		setMode
	};
}

const themeState = createThemeState();
export default themeState;
