import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), basicSsl(), sveltekit()],
	server: {
		headers: {
			'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
		}
	}
});
