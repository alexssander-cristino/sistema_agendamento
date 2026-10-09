// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAudiu_ENQbQjElInkvbKkGqAzwTuzekBA",
  authDomain: "orvix-notificacoes.firebaseapp.com",
  projectId: "orvix-notificacoes",
  storageBucket: "orvix-notificacoes.firebasestorage.app",
  messagingSenderId: "454025108283",
  appId: "1:454025108283:web:6755e120e86e4c2b7f751e",
  measurementId: "G-1VBPM1FV52"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);