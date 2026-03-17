// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCc9uGltdHfmKmnVOcqIYAY7nD6qHnykeo",
  authDomain: "assistkm-24d0a.firebaseapp.com",
  databaseURL: "https://assistkm-24d0a-default-rtdb.firebaseio.com",
  projectId: "assistkm-24d0a",
  storageBucket: "assistkm-24d0a.firebasestorage.app",
  messagingSenderId: "172856206943",
  appId: "1:172856206943:web:ebdaa4a9a97130b7721dea",
  measurementId: "G-PJ582TYYFG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
