// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC8r3Brgl8EN2qNWDOhva0esci0GKqs6bU",
  authDomain: "pari-raj.firebaseapp.com",
  projectId: "pari-raj",
  storageBucket: "pari-raj.firebasestorage.app",
  messagingSenderId: "666012127732",
  appId: "1:666012127732:web:355ffc44a21dfd41c6e9a1",
  measurementId: "G-ME550794ME"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
