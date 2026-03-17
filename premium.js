console.log("PREMIUM VERSION 999");
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, getIdToken } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

/*
  IMPORTANT
  Mets bien ton vrai projet Firebase ici.
*/
const FUNCTIONS_BASE_URL = "https://us-central1-assistkm-24d0a.cloudfunctions.net";

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

function getCurrentMonthKey() {
  return monthKeyFromDate(new Date());
}

function formatDateFR(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d)) return "-";
  return d.toLocaleDateString("fr-FR");
}

function formatMonthLabel(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric"
  }).format(new Date(date));
}

function toDate(value) {
  if (!value) return new Date();
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === "function") return value.toDate();
  return new Date(value);
}

function getAllowanceForMonth(accountCreatedAt, targetMonthKey) {
  const firstMonthKey = monthKeyFromDate(accountCreatedAt);
  return firstMonthKey === targetMonthKey ? 3 : 1;
}

function setButtonLoading(button, isLoading, loadingText, normalText) {
  if (!button) return;
  button.disabled = isLoading;
  button.innerHTML = isLoading
    ? `<span class="loader"></span>${loadingText}`
    : normalText;
}

async function ensureUserProfile(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    const now = new Date();

    const newProfile = {
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

    await setDoc(userRef, newProfile);
    return {
      ...newProfile,
      updatedAt: now
    };
  }

  return snap.data();
}

function renderProfile(profile) {
  const currentMonthKey = getCurrentMonthKey();
  const createdAt = toDate(profile.createdAt);
  const pdfUsage = profile.pdfUsage || {};
  const usedThisMonth = Number(pdfUsage[currentMonthKey] || 0);
  const allowance = getAllowanceForMonth(createdAt, currentMonthKey);
  const isPremium = profile.subscriptionStatus === "active";
  const remaining = isPremium ? "∞" : Math.max(allowance - usedThisMonth, 0);

  els.periodLabel.textContent = formatMonthLabel(new Date());
  els.periodNote.textContent = `Compte créé le ${formatDateFR(createdAt)}.`;

  if (isPremium) {
    els.subscriptionStatus.textContent = "Premium actif";
    els.subscriptionStatus.className = "big-number status-green";
    els.subscriptionNote.textContent = profile.currentPeriodEnd
      ? `Actif jusqu'au ${formatDateFR(toDate(profile.currentPeriodEnd))}.`
      : "Votre abonnement Premium est actif.";

    els.remainingPdfs.textContent = "∞";
    els.remainingPdfs.className = "big-number status-green";
    els.remainingNote.textContent = "Aucune limite de PDF pendant l'abonnement.";

    els.activeAlert.classList.remove("hidden");
    els.quotaAlert.classList.add("hidden");

    els.subscribeBtn.disabled = true;
    els.subscribeBtn.textContent = "✅ Abonnement actif";
    els.manageBtn.disabled = false;
    return;
  }

  els.subscriptionStatus.textContent = "Compte gratuit";
  els.subscriptionStatus.className = "big-number status-blue";
  els.subscriptionNote.textContent = "3 PDF le premier mois, puis 1 PDF par mois.";

  els.remainingPdfs.textContent = String(remaining);
  els.remainingPdfs.className = remaining > 0 ? "big-number status-blue" : "big-number status-red";
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

async function loadAndRenderProfile() {
  if (!currentUser) {
    els.loginAlert.classList.remove("hidden");
    els.subscriptionStatus.textContent = "Connexion requise";
    els.subscriptionStatus.className = "big-number status-red";
    els.subscriptionNote.textContent = "Connectez-vous pour voir votre statut.";
    els.remainingPdfs.textContent = "--";
    els.remainingNote.textContent = "Aucune donnée disponible.";
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
    throw new Error("Vous devez être connecté.");
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
    alert("Vous devez être connecté.");
    return;
  }

  try {
    setButtonLoading(
      els.subscribeBtn,
      true,
      "Création du paiement...",
      "💳 S'abonner maintenant"
    );

    const data = await callProtectedFunction("createCheckoutSession", {
      successUrl: `${window.location.origin}/success.html`,
      cancelUrl: `${window.location.origin}/premium.html`
    });

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error("Aucune URL de paiement reçue.");
  } catch (error) {
    console.error("Erreur createCheckoutSession :", error);
    alert(error.message || "Impossible de lancer le paiement.");
  } finally {
    if (currentProfile?.subscriptionStatus !== "active") {
      setButtonLoading(
        els.subscribeBtn,
        false,
        "",
        "💳 S'abonner maintenant"
      );
    }
  }
});

els.manageBtn.addEventListener("click", async () => {
  if (!currentUser) {
    alert("Vous devez être connecté.");
    return;
  }

  try {
    setButtonLoading(
      els.manageBtn,
      true,
      "Ouverture...",
      "⚙️ Gérer mon abonnement"
    );

    const data = await callProtectedFunction("createPortalSession", {
      returnUrl: `${window.location.origin}/premium.html`
    });

    if (data?.url) {
      window.location.href = data.url;
      return;
    }

    throw new Error("Aucune URL de portail reçue.");
  } catch (error) {
    console.error("Erreur createPortalSession :", error);
    alert(error.message || "Impossible d'ouvrir la gestion d'abonnement.");
  } finally {
    setButtonLoading(
      els.manageBtn,
      false,
      "",
      "⚙️ Gérer mon abonnement"
    );
  }
});

els.refreshBtn.addEventListener("click", async () => {
  try {
    setButtonLoading(
      els.refreshBtn,
      true,
      "Actualisation...",
      "🔄 Actualiser le statut"
    );
    await loadAndRenderProfile();
  } catch (error) {
    console.error(error);
    alert("Erreur pendant l'actualisation.");
  } finally {
    setButtonLoading(
      els.refreshBtn,
      false,
      "",
      "🔄 Actualiser le statut"
    );
  }
});

/*
  OUTILS GLOBAUX À RÉUTILISER DANS LES AUTRES MODULES
*/
window.EasyFraisPremium = {
  async canGeneratePdf() {
    const user = auth.currentUser;

    if (!user) {
      return {
        allowed: false,
        reason: "not_authenticated",
        message: "Vous devez être connecté."
      };
    }

    const profile = await ensureUserProfile(user);
    const currentMonthKey = getCurrentMonthKey();
    const createdAt = toDate(profile.createdAt);
    const allowance = getAllowanceForMonth(createdAt, currentMonthKey);
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
      const createdAt = toDate(data.createdAt);
      const allowance = getAllowanceForMonth(createdAt, currentMonthKey);
      const pdfUsage = data.pdfUsage || {};
      const usedThisMonth = Number(pdfUsage[currentMonthKey] || 0);

      if (data.subscriptionStatus !== "active" && usedThisMonth >= allowance) {
        throw new Error("Quota gratuit atteint.");
      }

      transaction.update(userRef, {
        pdfUsage: {
          ...pdfUsage,
          [currentMonthKey]: usedThisMonth + 1
        },
        lastPdfModule: module,
        lastPdfAt: serverTimestamp(),
        updatedAt: serverTimestamp()
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
    await loadAndRenderProfile();
  } catch (error) {
    console.error(error);
    els.subscriptionStatus.textContent = "Erreur";
    els.subscriptionStatus.className = "big-number status-red";
    els.subscriptionNote.textContent = "Impossible de charger le statut Premium.";
  }
});
