import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
	apiKey: 'AIzaSyBAUow1S4mvoI8oO_qHyR4ND19IE28oCxQ',
	authDomain: 'tripstitch-6b21a.firebaseapp.com',
	projectId: 'tripstitch-6b21a',
	storageBucket: 'tripstitch-6b21a.firebasestorage.app',
	messagingSenderId: '733726045890',
	appId: '1:733726045890:web:b336781467de80b84bed5b',
	measurementId: 'G-HRGZRQCD3B'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
