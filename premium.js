import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, getIdToken } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/*
  IMPORTANT
  Remplace si besoin par ton vrai projet Firebase Functions.
*/
const FUNCTIONS_BASE_URL = "https://us-central1-assistkm.cloudfunctions.net";

const els = {
  loginAlert: document.getElementById("loginAlert"),
  subscriptionStatus: document.getElementById("subscriptionStatus"),
  subscriptionNote: document.getElementById("subscriptionNote"),
  remainingPdfs: document.getElementById("remainingPdfs"),
  remainingNote: document.getElementById("remainingNote"),
  periodLabel: document.getElementById("periodLabel"),
  periodNote: document.getElementById("periodNote"),
  activeAlert: document.getElementById("activeAlert"),
  quotaAlert: document.getElementById("quotaAlert"),
  subscribeBtn: document.getElementById("subscribeBtn"),
  manageBtn: document.getElementById("manageBtn"),
  refreshBtn: document.getElementById("refreshBtn")
};

let currentUser = null;
let currentProfile = null;

function monthKeyFromDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(new Date(date));
}

function formatDateFR(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleDateString("fr-FR");
}

function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  return new Date(value);
}

function getCurrentMonthKey() {
  return monthKeyFromDate(new Date());
}

function getAllowanceForMonth(accountCreatedAt, targetMonthKey) {
  const firstMonthKey = monthKeyFromDate(accountCreatedAt);
  return firstMonthKey === targetMonthKey ? 3 : 1;
}

function setLoadingState(isLoading, btn, loadingText, normalText) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? `<span class="loader"></span>${loadingText}`
    : normalText;
}

async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const now = new Date();
    const data = {
      uid: user.uid,
      email: user.email || "",
      createdAt: Timestamp.fromDate(now),
      subscriptionStatus: "inactive",
      plan: "free",
      stripeCustomerId: "",
      currentPeriodEnd: null,
      pdfUsage: {},
      updatedAt: serverTimestamp()
    };

    await setDoc(userRef, data);
    return data;
  }

  return snap.data();
}

function renderProfile(profile) {
  const now = new Date();
  const currentMonthKey = getCurrentMonthKey();
  const accountCreatedAt = toDate(profile.createdAt);
  const pdfUsage = profile.pdfUsage || {};
  const usedThisMonth = Number(pdfUsage[currentMonthKey] || 0);
  const allowance = getAllowanceForMonth(accountCreatedAt, currentMonthKey);

  const isPremium = profile.subscriptionStatus === "active";
  const remaining = isPremium ? "Illimité" : Math.max(allowance - usedThisMonth, 0);

  els.periodLabel.textContent = formatMonthLabel(now);
  els.periodNote.textContent = `Compte créé le ${formatDateFR(accountCreatedAt)}.`;

  if (isPremium) {
    els.subscriptionStatus.textContent = "Premium actif";
    els.subscriptionStatus.className = "big status-active";
    els.subscriptionNote.textContent = profile.currentPeriodEnd
      ? `Renouvellement jusqu'au ${formatDateFR(toDate(profile.currentPeriodEnd))}.`
      : "Votre abonnement Premium est bien actif.";
    els.remainingPdfs.textContent = "∞";
    els.remainingPdfs.className = "big status-active";
    els.remainingNote.textContent = "Aucune limite de PDF pendant l'abonnement.";
    els.activeAlert.classList.remove("hidden");
    els.quotaAlert.classList.add("hidden");
    els.subscribeBtn.disabled = true;
    els.subscribeBtn.textContent = "✅ Abonnement actif";
    els.manageBtn.disabled = false;
  } else {
    els.subscriptionStatus.textContent = "Compte gratuit";
    els.subscriptionStatus.className = "big status-free";
    els.subscriptionNote.textContent = "3 PDF le premier mois, puis 1 PDF par mois.";
    els.remainingPdfs.textContent = String(remaining);
    els.remainingPdfs.className = remaining > 0 ? "big status-free" : "big status-blocked";
    els.remainingNote.textContent = `Utilisés ce mois-ci : ${usedThisMonth} / ${allowance}`;
    els.activeAlert.classList.add("hidden");
    els.subscribeBtn.disabled = false;
    els.subscribeBtn.textContent = "💳 S'abonner maintenant";
    els.manageBtn.disabled = !profile.stripeCustomerId;

    if (remaining <= 0) {
      els.quotaAlert.classList.remove("hidden");
    } else {
      els.quotaAlert.classList.add("hidden");
    }
  }
}

async function loadProfileAndRender() {
  if (!currentUser) {
    els.loginAlert.classList.remove("hidden");
    els.subscriptionStatus.textContent = "Connexion requise";
    els.subscriptionStatus.className = "big status-blocked";
    els.subscriptionNote.textContent = "Connectez-vous pour voir votre quota.";
    els.remainingPdfs.textContent = "--";
    els.remainingNote.textContent = "Aucune donnée sans connexion.";
    els.periodLabel.textContent = "--";
    els.periodNote.textContent = "Connectez-vous pour continuer.";
    els.subscribeBtn.disabled = true;
    els.manageBtn.disabled = true;
    return;
  }

  els.loginAlert.classList.add("hidden");
  currentProfile = await ensureUserProfile(currentUser);
  renderProfile(currentProfile);
}

async function callProtectedFunction(endpoint, body = {}) {
  if (!currentUser) {
    alert("Vous devez être connecté.");
    window.location.href = "auth.html";
    return null;
  }

  const token = await getIdToken(currentUser, true);

  const response = await fetch(`${FUNCTIONS_BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Erreur ${response.status}`);
  }

  return data;
}

els.subscribeBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("Connectez-vous d'abord.");
    window.location.href = "auth.html";
    return;
  }

  try {
    setLoadingState(true, els.subscribeBtn, "Création du paiement...", "💳 S'abonner maintenant");

    const data = await callProtectedFunction("createCheckoutSession", {
      successUrl: `${window.location.origin}/success.html`,
      cancelUrl: `${window.location.origin}/premium.html`
    });

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    alert("Impossible de lancer Stripe.");
  } catch (error) {
    console.error(error);
    alert(error.message || "Erreur lors de la création du paiement.");
  } finally {
    if (currentProfile?.subscriptionStatus !== "active") {
      setLoadingState(false, els.subscribeBtn, "", "💳 S'abonner maintenant");
    }
  }
});

els.manageBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("Connectez-vous d'abord.");
    window.location.href = "auth.html";
    return;
  }

  try {
    setLoadingState(true, els.manageBtn, "Ouverture...", "⚙️ Gérer mon abonnement");

    const data = await callProtectedFunction("createPortalSession", {
      returnUrl: `${window.location.origin}/premium.html`
    });

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    alert("Impossible d'ouvrir le portail d'abonnement.");
  } catch (error) {
    console.error(error);
    alert(error.message || "Erreur portail Stripe.");
  } finally {
    setLoadingState(false, els.manageBtn, "", "⚙️ Gérer mon abonnement");
  }
});

els.refreshBtn.addEventListener("click", async () => {
  try {
    setLoadingState(true, els.refreshBtn, "Actualisation...", "🔄 Actualiser le statut");
    await loadProfileAndRender();
  } catch (error) {
    console.error(error);
    alert("Erreur de rafraîchissement.");
  } finally {
    setLoadingState(false, els.refreshBtn, "", "🔄 Actualiser le statut");
  }
});

/*
  ==========================
  AIDE GLOBALE POUR LES PDF
  ==========================
  Tu pourras appeler ça depuis les autres modules.

  Exemple dans un autre fichier :
  const check = await window.EasyFraisPremium.canGeneratePdf();
  if (!check.allowed) {
    alert(check.message);
    window.location.href = "premium.html";
    return;
  }

  // puis juste après la vraie génération :
  await window.EasyFraisPremium.registerPdfGeneration({ module: "autres" });
*/

window.EasyFraisPremium = {
  async canGeneratePdf() {
    if (!auth.currentUser) {
      return {
        allowed: false,
        reason: "not_authenticated",
        message: "Vous devez être connecté."
      };
    }

    const profile = await ensureUserProfile(auth.currentUser);
    const currentMonthKey = getCurrentMonthKey();
    const accountCreatedAt = toDate(profile.createdAt);
    const allowance = getAllowanceForMonth(accountCreatedAt, currentMonthKey);
    const usedThisMonth = Number((profile.pdfUsage || {})[currentMonthKey] || 0);

    if (profile.subscriptionStatus === "active") {
      return {
        allowed: true,
        premium: true,
        remaining: Infinity,
        used: usedThisMonth,
        allowance: Infinity
      };
    }

    const remaining = Math.max(allowance - usedThisMonth, 0);

    if (remaining <= 0) {
      return {
        allowed: false,
        premium: false,
        remaining,
        used: usedThisMonth,
        allowance,
        message: "Votre quota gratuit est épuisé. Passez en Premium pour continuer."
      };
    }

    return {
      allowed: true,
      premium: false,
      remaining,
      used: usedThisMonth,
      allowance
    };
  },

  async registerPdfGeneration({ module = "inconnu" } = {}) {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Utilisateur non connecté.");
    }

    const userRef = doc(db, "users", user.uid);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(userRef);

      if (!snap.exists()) {
        throw new Error("Profil utilisateur introuvable.");
      }

      const data = snap.data();
      const currentMonthKey = getCurrentMonthKey();
      const profileCreatedAt = toDate(data.createdAt);
      const allowance = getAllowanceForMonth(profileCreatedAt, currentMonthKey);

      const pdfUsage = data.pdfUsage || {};
      const usedThisMonth = Number(pdfUsage[currentMonthKey] || 0);

      if (data.subscriptionStatus !== "active" && usedThisMonth >= allowance) {
        throw new Error("Quota gratuit atteint.");
      }

      const nextUsage = {
        ...pdfUsage,
        [currentMonthKey]: usedThisMonth + 1
      };

      transaction.update(userRef, {
        pdfUsage: nextUsage,
        updatedAt: serverTimestamp(),
        lastPdfModule: module,
        lastPdfAt: serverTimestamp()
      });
    });

    currentProfile = await ensureUserProfile(user);
    renderProfile(currentProfile);
    return true;
  }
};

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  try {
    await loadProfileAndRender();
  } catch (error) {
    console.error(error);
    els.subscriptionStatus.textContent = "Erreur";
    els.subscriptionStatus.className = "big status-blocked";
    els.subscriptionNote.textContent = "Impossible de charger le statut Premium.";
  }
});
