import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			fallback: '200.html'
		}),
		// Skip SvelteKit's automatic service-worker registration in dev — Vite's
		// self-signed HTTPS cert makes the browser refuse to register the SW
		// (SecurityError: An SSL certificate error occurred when fetching the script).
		// In production the real cert lets the SW register normally.
		serviceWorker: {
			register: process.env.NODE_ENV === 'production'
		}
	}
};

export default config;
