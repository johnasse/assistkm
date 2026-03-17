import {
  auth,
  hasPremiumAccess,
  getPdfUsageInfo
} from "./premium.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

function setText(selectors, value) {
  const el = findFirst(selectors);
  if (el) {
    el.textContent = value;
  }
}

function findFirst(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function getStatusMainEl() {
  return findFirst([
    "#premiumStatusMain",
    "#statutCompte",
    "#premiumStatusValue",
    "[data-premium-status-main]"
  ]);
}

function getStatusSubEl() {
  return findFirst([
    "#premiumStatusSub",
    "#statutCompteDetail",
    "#premiumStatusHint",
    "[data-premium-status-sub]"
  ]);
}

function getQuotaMainEl() {
  return findFirst([
    "#pdfQuotaMain",
    "#quotaPdf",
    "#pdfQuotaValue",
    "[data-pdf-quota-main]"
  ]);
}

function getQuotaSubEl() {
  return findFirst([
    "#pdfQuotaSub",
    "#quotaPdfDetail",
    "#pdfQuotaHint",
    "[data-pdf-quota-sub]"
  ]);
}

function getPeriodMainEl() {
  return findFirst([
    "#premiumPeriodMain",
    "#periodeActuelle",
    "#periodValue",
    "[data-premium-period-main]"
  ]);
}

function getPeriodSubEl() {
  return findFirst([
    "#premiumPeriodSub",
    "#periodeActuelleDetail",
    "#periodHint",
    "[data-premium-period-sub]"
  ]);
}

function updateCardColors(isPremium) {
  const statusMain = getStatusMainEl();
  const quotaMain = getQuotaMainEl();

  if (statusMain) {
    statusMain.style.color = isPremium ? "#15803d" : "#0f172a";
  }

  if (quotaMain) {
    quotaMain.style.color = isPremium ? "#15803d" : "#0f172a";
  }
}

function formatPeriodLabel(info) {
  if (info?.premium) return "Abonnement actif";
  return info?.isFirstMonth ? "Premier mois" : "Mois en cours";
}

function formatPeriodSub(info) {
  if (info?.premium) return "Accès illimité";
  return info?.isFirstMonth ? "Offre découverte en cours" : "Quota mensuel gratuit";
}

async function refreshPremiumStatusUi() {
  try {
    const premium = await hasPremiumAccess();
    const info = await getPdfUsageInfo();

    const statusMain = getStatusMainEl();
    const statusSub = getStatusSubEl();
    const quotaMain = getQuotaMainEl();
    const quotaSub = getQuotaSubEl();
    const periodMain = getPeriodMainEl();
    const periodSub = getPeriodSubEl();

    if (statusMain) {
      statusMain.textContent = premium ? "Premium actif" : "Compte gratuit";
    }

    if (statusSub) {
      statusSub.textContent = premium
        ? "Abonnement confirmé."
        : "Version gratuite active.";
    }

    if (quotaMain) {
      quotaMain.textContent = premium
        ? "Illimité"
        : `${info.remaining} / ${info.limit}`;
    }

    if (quotaSub) {
      if (premium) {
        quotaSub.textContent = "Aucune limite de génération.";
      } else if (info.isFirstMonth) {
        quotaSub.textContent = `Offre découverte : ${info.limit} PDF le premier mois.`;
      } else {
        quotaSub.textContent = "1 PDF gratuit par mois.";
      }
    }

    if (periodMain) {
      periodMain.textContent = formatPeriodLabel(info);
    }

    if (periodSub) {
      periodSub.textContent = formatPeriodSub(info);
    }

    updateCardColors(premium);
  } catch (error) {
    console.error("Erreur affichage premium :", error);

    setText(
      ["#premiumStatusMain", "#statutCompte", "#premiumStatusValue", "[data-premium-status-main]"],
      "Erreur"
    );
    setText(
      ["#premiumStatusSub", "#statutCompteDetail", "#premiumStatusHint", "[data-premium-status-sub]"],
      "Impossible de charger le statut."
    );
    setText(
      ["#pdfQuotaMain", "#quotaPdf", "#pdfQuotaValue", "[data-pdf-quota-main]"],
      "--"
    );
    setText(
      ["#pdfQuotaSub", "#quotaPdfDetail", "#pdfQuotaHint", "[data-pdf-quota-sub]"],
      "Impossible de charger le quota."
    );
    setText(
      ["#premiumPeriodMain", "#periodeActuelle", "#periodValue", "[data-premium-period-main]"],
      "--"
    );
    setText(
      ["#premiumPeriodSub", "#periodeActuelleDetail", "#periodHint", "[data-premium-period-sub]"],
      "Erreur de chargement."
    );
  }
}

document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      return;
    }

    await refreshPremiumStatusUi();
  });

  const refreshBtn = document.querySelector(
    "#btnRefreshPremiumStatus, #btnActualiserPremium, #btnActualiserStatut"
  );

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      await refreshPremiumStatusUi();
    });
  }
});