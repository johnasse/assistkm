import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

/* CONFIG FIREBASE */
const firebaseConfig = {
  apiKey: "AIzaSyCc9uGltdHfmKmnVOcqIYAY7nD6qHnykeo",
  authDomain: "assistkm-24d0a.firebaseapp.com",
  projectId: "assistkm-24d0a",
  storageBucket: "assistkm-24d0a.firebasestorage.app",
  messagingSenderId: "172856206943",
  appId: "1:172856206943:web:b3db987c7f353679721dea",
  measurementId: "G-PF0T2NEVZM"
};

/* INITIALISATION FIREBASE SANS DOUBLE INIT */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

/* CREER COMPTE */
export function registerUser(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

/* CONNEXION */
export function loginUser(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

/* DECONNEXION */
export function logoutUser() {
  return signOut(auth);
}

/* RESET MOT DE PASSE */
export function sendResetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

/* RECUPERER L'UTILISATEUR CONNECTE */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/* VERIFIER UTILISATEUR CONNECTE */
export async function requireAuth() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = "login.html";
    return null;
  }

  return user;
}

/* REDIRECTION SI CONNECTE */
export async function redirectIfLoggedIn() {
  const user = await getCurrentUser();

  if (user) {
    window.location.href = "index.html";
    return user;
  }

  return null;
}

/* BOUTON DECONNEXION */
export function initLogoutButton(id = "btnLogout") {
  const btn = document.getElementById(id);
  if (!btn) return;

  btn.addEventListener("click", async () => {
    try {
      await logoutUser();
      window.location.href = "login.html";
    } catch (error) {
      console.error("Erreur lors de la déconnexion :", error);
      alert("Impossible de se déconnecter pour le moment.");
    }
  });
}

export { auth, app };