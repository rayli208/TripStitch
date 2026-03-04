import type { User } from '$lib/types';
import { auth } from '$lib/firebase';
import {
	GoogleAuthProvider,
	signInWithPopup,
	signOut as firebaseSignOut,
	onAuthStateChanged,
	createUserWithEmailAndPassword,
	signInWithEmailAndPassword,
	sendPasswordResetEmail,
	updateProfile
} from 'firebase/auth';

function createAuthState() {
	let user = $state<User | null>(null);
	let loading = $state(true);
	let isSignedIn = $derived(user !== null);

	onAuthStateChanged(auth, (firebaseUser) => {
		if (firebaseUser) {
			user = {
				id: firebaseUser.uid,
				name: firebaseUser.displayName ?? 'User',
				email: firebaseUser.email ?? '',
				avatarUrl: firebaseUser.photoURL ?? ''
			};
		} else {
			user = null;
		}
		loading = false;
	});

	return {
		get user() {
			return user;
		},
		get isSignedIn() {
			return isSignedIn;
		},
		get loading() {
			return loading;
		},
		async signInWithGoogle() {
			const provider = new GoogleAuthProvider();
			await signInWithPopup(auth, provider);
		},
		async signUpWithEmail(email: string, password: string, displayName: string) {
			const credential = await createUserWithEmailAndPassword(auth, email, password);
			await updateProfile(credential.user, { displayName });
			user = {
				id: credential.user.uid,
				name: displayName,
				email: credential.user.email ?? '',
				avatarUrl: ''
			};
		},
		async signInWithEmail(email: string, password: string) {
			await signInWithEmailAndPassword(auth, email, password);
		},
		async resetPassword(email: string) {
			await sendPasswordResetEmail(auth, email);
		},
		async signOut() {
			await firebaseSignOut(auth);
		}
	};
}

const authState = createAuthState();
export default authState;
