import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  sendEmailVerification
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
auth.languageCode = "fr";

/* URLS ADAPTEES GITHUB PAGES / AUTRE HEBERGEMENT */
function getBaseSiteUrl() {
  const origin = window.location.origin;
  const path = window.location.pathname;

  if (origin.includes("github.io")) {
    const parts = path.split("/").filter(Boolean);
    const repoName = parts.length > 0 ? parts[0] : "assistkm";
    return `${origin}/${repoName}`;
  }

  return origin;
}

function getAppUrl(page = "") {
  const base = getBaseSiteUrl();
  if (!page) return `${base}/`;
  return `${base}/${page}`;
}

/* CREER COMPTE + ENVOI EMAIL DE CONFIRMATION */
export async function registerUser(email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await sendEmailVerification(user, {
    url: getAppUrl("login.html"),
    handleCodeInApp: false
  });

  return userCredential;
}

/* RENVOYER L'EMAIL DE VERIFICATION */
export async function resendVerificationEmail() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  await sendEmailVerification(user, {
    url: getAppUrl("login.html"),
    handleCodeInApp: false
  });

  return true;
}

/* CONNEXION AVEC VERIFICATION EMAIL OBLIGATOIRE */
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  await user.reload();

  if (!user.emailVerified) {
    await signOut(auth);
    throw new Error("EMAIL_NOT_VERIFIED");
  }

  return userCredential;
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
    window.location.href = getAppUrl("login.html");
    return null;
  }

  return user;
}

/* VERIFIER UTILISATEUR CONNECTE + EMAIL VERIFIE */
export async function requireVerifiedAuth() {
  const user = await getCurrentUser();

  if (!user) {
    window.location.href = getAppUrl("login.html");
    return null;
  }

  await user.reload();

  if (!user.emailVerified) {
    alert("Merci de confirmer votre adresse email avant de continuer.");
    await logoutUser();
    window.location.href = getAppUrl("login.html");
    return null;
  }

  return user;
}

/* REDIRECTION SI CONNECTE */
export async function redirectIfLoggedIn() {
  const user = await getCurrentUser();

  if (user) {
    window.location.href = getAppUrl("index.html");
    return user;
  }

  return null;
}

/* REDIRECTION SI CONNECTE ET EMAIL VERIFIE */
export async function redirectIfVerifiedLoggedIn() {
  const user = await getCurrentUser();

  if (user) {
    await user.reload();

    if (user.emailVerified) {
      window.location.href = getAppUrl("index.html");
      return user;
    }
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
      window.location.href = getAppUrl("login.html");
    } catch (error) {
      console.error("Erreur lors de la déconnexion :", error);
      alert("Impossible de se déconnecter pour le moment.");
    }
  });
}

export { auth, app };