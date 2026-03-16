import { auth } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

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

function getFriendlyFirebaseError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-email":
      return "Adresse mail invalide.";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "Identifiants incorrects.";
    case "auth/wrong-password":
      return "Mot de passe incorrect.";
    case "auth/email-already-in-use":
      return "Cette adresse mail est déjà utilisée.";
    case "auth/weak-password":
      return "Le mot de passe est trop faible.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessaie dans quelques minutes.";
    default:
      return error?.message || "Une erreur est survenue.";
  }
}

async function login() {
  clearMessage();

  const email = getEmail();
  const password = getPassword();

  if (!email || !password) {
    showMessage("Merci de renseigner l’adresse mail et le mot de passe.");
    return;
  }

  try {
    setLoading(true);
    await signInWithEmailAndPassword(auth, email, password);
    showMessage("Connexion réussie...", "success");
    window.location.href = "index.html";
  } catch (error) {
    showMessage(getFriendlyFirebaseError(error));
  } finally {
    setLoading(false);
  }
}

async function register() {
  clearMessage();

  const email = getEmail();
  const password = getPassword();

  if (!email || !password) {
    showMessage("Merci de renseigner l’adresse mail et le mot de passe.");
    return;
  }

  if (password.length < 6) {
    showMessage("Le mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  try {
    setLoading(true);
    await createUserWithEmailAndPassword(auth, email, password);
    showMessage("Compte créé avec succès...", "success");
    window.location.href = "index.html";
  } catch (error) {
    showMessage(getFriendlyFirebaseError(error));
  } finally {
    setLoading(false);
  }
}

loginBtn.addEventListener("click", login);
registerBtn.addEventListener("click", register);

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    login();
  }
});

onAuthStateChanged(auth, (user) => {
  if (!authChecked) {
    authChecked = true;

    if (user) {
      window.location.href = "index.html";
    }
  }
});