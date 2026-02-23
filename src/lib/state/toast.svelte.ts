export interface Toast {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
}

function createToastState() {
	let toasts = $state<Toast[]>([]);

	return {
		get toasts() {
			return toasts;
		},

		show(message: string, type: Toast['type'] = 'info', duration = 3000) {
			const id = crypto.randomUUID();
			toasts = [...toasts, { id, message, type }];
			setTimeout(() => {
				toasts = toasts.filter((t) => t.id !== id);
			}, duration);
		},

		success(message: string) {
			this.show(message, 'success');
		},

		error(message: string) {
			this.show(message, 'error', 5000);
		},

		dismiss(id: string) {
			toasts = toasts.filter((t) => t.id !== id);
		}
	};
}

const toast = createToastState();
export default toast;
