import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* STRIPE */
const STRIPE_PRICE_ID = "price_1TBX8WCA2m5OcqFbTHBH4bHa";

/* LIMITES PDF */
const FIRST_MONTH_FREE_PDF_LIMIT = 3;
const NORMAL_MONTH_FREE_PDF_LIMIT = 1;

/* URLS */
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

/* UTILISATEUR ACTUEL */
function getCurrentUserPromise() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

/* CLE DU MOIS */
function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/* SAVOIR SI C'EST LE PREMIER MOIS DU COMPTE */
function isSameYearMonth(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth()
  );
}

function getAccountCreationDate(user) {
  const creationTime = user?.metadata?.creationTime;
  if (!creationTime) return null;

  const date = new Date(creationTime);
  if (isNaN(date.getTime())) return null;

  return date;
}

function getFreePdfLimitForUser(user) {
  const createdAt = getAccountCreationDate(user);
  const now = new Date();

  if (createdAt && isSameYearMonth(createdAt, now)) {
    return FIRST_MONTH_FREE_PDF_LIMIT;
  }

  return NORMAL_MONTH_FREE_PDF_LIMIT;
}

/* STRIPE CHECKOUT */
export async function startStripeSubscriptionCheckout() {
  const user = await getCurrentUserPromise();

  if (!user) {
    alert("Aucun utilisateur connecté.");
    window.location.href = getAppUrl("login.html");
    return;
  }

  try {
    const checkoutSessionsRef = collection(
      db,
      "customers",
      user.uid,
      "checkout_sessions"
    );

    const docRef = await addDoc(checkoutSessionsRef, {
      price: STRIPE_PRICE_ID,
      trial_period_days: 7,
      success_url: getAppUrl("premium.html?checkout=success"),
      cancel_url: getAppUrl("premium.html?checkout=cancel")
    });

    onSnapshot(docRef, (snap) => {
      const data = snap.data();
      if (!data) return;

      if (data.error) {
        console.error("Erreur Stripe :", data.error);
        alert("Erreur Stripe : " + (data.error.message || "Paiement impossible"));
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
      }
    });
  } catch (error) {
    console.error("Erreur Firestore checkout :", error);
    alert("Erreur Firestore : " + (error.message || error));
  }
}

/* PREMIUM */
export async function hasPremiumAccess() {
  const user = await getCurrentUserPromise();
  if (!user) return false;

  try {
    const subsRef = collection(db, "customers", user.uid, "subscriptions");
    const q = query(subsRef, where("status", "in", ["active", "trialing"]));
    const snap = await getDocs(q);

    return !snap.empty;
  } catch (error) {
    console.error("Erreur vérification premium :", error);
    return false;
  }
}

export async function requirePremium() {
  const user = await getCurrentUserPromise();

  if (!user) {
    window.location.href = getAppUrl("login.html");
    return false;
  }

  const premium = await hasPremiumAccess();

  if (!premium) {
    alert("Cette fonctionnalité est réservée aux comptes premium.");
    window.location.href = getAppUrl("premium.html");
    return false;
  }

  return true;
}

export async function updatePremiumBadge(elementId = "premiumStatus") {
  const el = document.getElementById(elementId);
  if (!el) return;

  const premium = await hasPremiumAccess();

  if (premium) {
    el.textContent = "Compte Premium actif";
    el.style.color = "#15803d";
  } else {
    el.textContent = "Compte gratuit";
    el.style.color = "#b91c1c";
  }
}

/* INFOS QUOTA PDF */
export async function getPdfUsageInfo() {
  const user = await getCurrentUserPromise();

  if (!user) {
    return {
      premium: false,
      used: 0,
      remaining: 0,
      limit: NORMAL_MONTH_FREE_PDF_LIMIT,
      isFirstMonth: false
    };
  }

  const premium = await hasPremiumAccess();

  if (premium) {
    return {
      premium: true,
      used: 0,
      remaining: Infinity,
      limit: Infinity,
      isFirstMonth: false
    };
  }

  const monthKey = getCurrentMonthKey();
  const usageRef = doc(db, "customers", user.uid, "usage", `pdf_${monthKey}`);
  const usageSnap = await getDoc(usageRef);

  let used = 0;

  if (usageSnap.exists()) {
    const data = usageSnap.data();
    used = Number(data.count || 0);
  }

  const limit = getFreePdfLimitForUser(user);
  const createdAt = getAccountCreationDate(user);
  const isFirstMonth = createdAt ? isSameYearMonth(createdAt, new Date()) : false;

  return {
    premium: false,
    used,
    remaining: Math.max(0, limit - used),
    limit,
    isFirstMonth
  };
}

export async function canDownloadPdf() {
  const info = await getPdfUsageInfo();
  return info.premium || info.used < info.limit;
}

/* ENREGISTRER TELECHARGEMENT PDF */
export async function registerPdfDownload() {
  const user = await getCurrentUserPromise();
  if (!user) return false;

  const premium = await hasPremiumAccess();
  if (premium) return true;

  const monthKey = getCurrentMonthKey();
  const usageRef = doc(db, "customers", user.uid, "usage", `pdf_${monthKey}`);
  const usageSnap = await getDoc(usageRef);

  const limit = getFreePdfLimitForUser(user);

  if (!usageSnap.exists()) {
    await setDoc(usageRef, {
      type: "pdf_download",
      month: monthKey,
      count: 1,
      limit,
      updatedAt: new Date().toISOString()
    });
    return true;
  }

  const data = usageSnap.data();
  const count = Number(data.count || 0);

  if (count >= limit) {
    return false;
  }

  await updateDoc(usageRef, {
    count: increment(1),
    limit,
    updatedAt: new Date().toISOString()
  });

  return true;
}

/* VERIFIER ACCES PDF */
export async function requirePdfAccess() {
  const user = await getCurrentUserPromise();

  if (!user) {
    alert("Vous devez être connecté.");
    window.location.href = getAppUrl("login.html");
    return false;
  }

  const premium = await hasPremiumAccess();
  if (premium) return true;

  const info = await getPdfUsageInfo();

  if (info.used >= info.limit) {
    if (info.isFirstMonth) {
      alert("Vous avez utilisé vos 3 PDF gratuits du premier mois. Passez en premium pour un accès illimité.");
    } else {
      alert("Vous avez utilisé votre PDF gratuit du mois. Passez en premium pour un accès illimité.");
    }
    window.location.href = getAppUrl("premium.html");
    return false;
  }

  const recorded = await registerPdfDownload();

  if (!recorded) {
    if (info.isFirstMonth) {
      alert("Vous avez utilisé vos 3 PDF gratuits du premier mois. Passez en premium pour un accès illimité.");
    } else {
      alert("Vous avez utilisé votre PDF gratuit du mois. Passez en premium pour un accès illimité.");
    }
    window.location.href = getAppUrl("premium.html");
    return false;
  }

  return true;
}

/* AFFICHER QUOTA PDF */
export async function updatePdfQuotaBadge(elementId = "pdfQuotaStatus") {
  const el = document.getElementById(elementId);
  if (!el) return;

  const info = await getPdfUsageInfo();

  if (info.premium) {
    el.textContent = "PDF illimités avec votre compte premium";
    el.style.color = "#15803d";
    return;
  }

  if (info.isFirstMonth) {
    el.textContent = `Offre découverte : ${info.remaining} / ${info.limit} PDF gratuits restants ce mois-ci`;
  } else {
    el.textContent = `Version gratuite : ${info.remaining} / ${info.limit} PDF gratuit restant ce mois-ci`;
  }

  el.style.color = info.remaining > 0 ? "#b45309" : "#b91c1c";
}

/* PORTAIL CLIENT STRIPE */
export async function openCustomerPortal() {
  const user = await getCurrentUserPromise();

  if (!user) {
    alert("Vous devez être connecté.");
    window.location.href = getAppUrl("login.html");
    return;
  }

  try {
    const portalSessionsRef = collection(
      db,
      "customers",
      user.uid,
      "portal_sessions"
    );

    const docRef = await addDoc(portalSessionsRef, {
      return_url: getAppUrl("premium.html")
    });

    onSnapshot(docRef, (snap) => {
      const data = snap.data();
      if (!data) return;

      if (data.error) {
        console.error("Erreur portail Stripe :", data.error);
        alert("Erreur Stripe : " + (data.error.message || "Impossible d'ouvrir le portail client"));
        return;
      }

      if (data.url) {
        window.location.assign(data.url);
      }
    });
  } catch (error) {
    console.error("Erreur Firestore portail :", error);
    alert("Erreur : " + (error.message || error));
  }
}
