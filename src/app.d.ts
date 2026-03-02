// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	interface HTMLVideoElement {
		requestVideoFrameCallback?(
			callback: (now: DOMHighResTimeStamp, metadata: { mediaTime: number }) => void
		): number;
		cancelVideoFrameCallback?(handle: number): void;
	}
}

export {};
