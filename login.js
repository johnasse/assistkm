import { auth, db } from "./firebase-config.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  signOut
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const messageEl = document.getElementById("message");

let authChecked = false;

function showMessage(message, type = "error") {
  messageEl.textContent = message;
  messageEl.className = `message ${type}`;
}

function clearMessage() {
  messageEl.textContent = "";
  messageEl.className = "message";
}

function setLoading(isLoading) {
  document.body.classList.toggle("loading", isLoading);
  loginBtn.disabled = isLoading;
  registerBtn.disabled = isLoading;
}

function getEmail() {
  return emailInput.value.trim();
}

function getPassword() {
  return passwordInput.value.trim();
}

// 🔥 Gestion propre des erreurs Firebase
function getErrorMessage(error) {
  console.error("🔥 Firebase error :", error);
  console.error("🔥 Code :", error.code);
  console.error("🔥 Message :", error.message);

  switch (error.code) {
    case "auth/invalid-email":
      return "Adresse mail invalide.";
    case "auth/user-not-found":
      return "Aucun compte trouvé.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Email ou mot de passe incorrect.";
    case "auth/email-already-in-use":
      return "Cette adresse mail est déjà utilisée.";
    case "auth/weak-password":
      return "Mot de passe trop faible (min 6 caractères).";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessaie plus tard.";
    case "auth/network-request-failed":
      return "Erreur réseau ou configuration Firebase incorrecte.";
    case "auth/operation-not-allowed":
      return "Email / mot de passe non activé dans Firebase.";
    default:
      return error.message || "Erreur inconnue.";
  }
}

// 🔵 LOGIN
async function login() {
  clearMessage();

  const email = getEmail();
  const password = getPassword();

  if (!email || !password) {
    showMessage("Merci de remplir tous les champs.");
    return;
  }

  try {
    setLoading(true);

    const credential = await signInWithEmailAndPassword(auth, email, password);
    await credential.user.reload();
    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);
      showMessage("Ton adresse mail n'est pas encore confirmée. Un nouveau mail vient d'être envoyé.");
      return;
    }

    showMessage("Connexion réussie...", "success");

    setTimeout(() => {
      window.location.href = "index.html";
    }, 500);

  } catch (error) {
    showMessage(getErrorMessage(error));
  } finally {
    setLoading(false);
  }
}

// 🟢 REGISTER
async function register() {
  clearMessage();

  const email = getEmail();
  const password = getPassword();

  if (!email || !password) {
    showMessage("Merci de remplir tous les champs.");
    return;
  }

  if (password.length < 6) {
    showMessage("Le mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  try {
    setLoading(true);

    const userCredential = await createUserWithEmailAndPassword(
  auth,
  email,
  password
);

const user = userCredential.user;

await sendEmailVerification(user);

await setDoc(doc(db, "customers", user.uid), {
  uid: user.uid,
  email: user.email,
  createdAt: serverTimestamp()
}, { merge: true });

    showMessage("Compte créé. Consulte ta boîte mail et confirme ton adresse avant de te connecter.", "success");
    await signOut(auth);

    setTimeout(() => {
      window.location.href = "login.html";
    }, 1200);

  } catch (error) {
    showMessage(getErrorMessage(error));
  } finally {
    setLoading(false);
  }
}

// Events
loginBtn.addEventListener("click", login);
registerBtn.addEventListener("click", register);

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

// 🔥 auto redirect si déjà connecté
onAuthStateChanged(auth, (user) => {
  if (!authChecked) {
    authChecked = true;

    if (user && user.emailVerified) {
      window.location.href = "index.html";
    } else if (user && !user.emailVerified) {
      signOut(auth);
    }
  }
});
