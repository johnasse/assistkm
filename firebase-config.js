import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCc9uGltdHfmKmnVOcqIYAY7nD6qHnykeo",
  authDomain: "assistkm-24d0a.firebaseapp.com",
  databaseURL: "https://assistkm-24d0a-default-rtdb.firebaseio.com",
  projectId: "assistkm-24d0a",
  storageBucket: "assistkm-24d0a.firebasestorage.app",
  messagingSenderId: "172856206943",
  appId: "1:172856206943:web:ebdaa4a9a97130b7721dea"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
