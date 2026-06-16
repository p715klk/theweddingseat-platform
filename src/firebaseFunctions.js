import { getFunctions } from 'firebase/functions';
import { firebaseApp } from '@/firebase';

export const functions = getFunctions(firebaseApp, 'asia-southeast1');

