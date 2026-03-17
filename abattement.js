import { requirePremium } from "./premium.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let lignesAbattement = [];
let listeEnfantsAbattementMemo = [];
let uid = null;
let eventsBound = false;

const SMIC_DATA = {
  2024: { avant: 11.65, apres: 11.88 },
  2025: { avant: 11.88, apres: 11.88 },
  2026: { avant: 11.88, apres: 11.88 }
};

function getLignesKey() {
  return `lignesAbattement_${uid}`;
}

function getEnfantsKey() {
  return `listeEnfantsAbattementMemo_${uid}`;
}

function getField(id) {
  return document.getElementById(id);
}

function getYearField() {
  return (
    getField("anneeFiscale") ||
    getField("anneeAbattement") ||
    getField("yearSelectAbattement")
  );
}

document.addEventListener("DOMContentLoaded", async () => {
  const allowed = await requirePremium();
  if (!allowed) return;
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;

  lignesAbattement = JSON.parse(localStorage.getItem(getLignesKey()) || "[]");
  listeEnfantsAbattementMemo = JSON.parse(localStorage.getItem(getEnfantsKey()) || "[]");

  chargerInfosAbattement();

  if (!eventsBound) {
    bindAbattementEvents();
    eventsBound = true;
  }

  renderListeEnfantsAbattement();
  renderLignesAbattement();
  calculerAbattement();
});

function saveLignesAbattement() {
  localStorage.setItem(getLignesKey(), JSON.stringify(lignesAbattement));
}

function saveListeEnfants() {
  localStorage.setItem(getEnfantsKey(), JSON.stringify(listeEnfantsAbattementMemo));
}

function chargerInfosAbattement() {
  const assistantNom =
    localStorage.getItem(`assistantNomAbattement_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const champ = getField("assistantNomAbattement");
  if (champ) champ.value = assistantNom;

  updateSmicParAnnee();
  updateCasesFiscales();
}

function saveAssistantNomAbattement() {
  const el = getField("assistantNomAbattement");
  if (!el) return;

  localStorage.setItem(`assistantNomAbattement_${uid}`, el.value.trim());
}

function ajouterEnfantMemo(nom) {
  const clean = String(nom || "").trim();
  if (!clean) return;

  const exists = listeEnfantsAbattementMemo.some(
    (e) => e.toLowerCase() === clean.toLowerCase()
  );

  if (!exists) {
    listeEnfantsAbattementMemo.push(clean);
    listeEnfantsAbattementMemo.sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
    saveListeEnfants();
  }
}

function renderListeEnfantsAbattement() {
  const datalist = getField("listeEnfantsAbattement");
  if (!datalist) return;

  datalist.innerHTML = "";

  listeEnfantsAbattementMemo.forEach((nom) => {
    const option = document.createElement("option");
    option.value = nom;
    datalist.appendChild(option);
  });
}

function ajouterLigneAbattement() {
  const enfant = getField("nomEnfantLigne")?.value.trim() || "";
  const periode = getField("periodeLigne")?.value || "";
  const typeAccueil = getField("typeAccueilLigne")?.value || "";
  const jours = parseFloat(getField("joursLigne")?.value || "0");

  if (!enfant || !periode || !typeAccueil || jours <= 0) {
    alert("Merci de remplir correctement la ligne enfant.");
    return;
  }

  ajouterEnfantMemo(enfant);
  renderListeEnfantsAbattement();

  lignesAbattement.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    enfant,
    periode,
    typeAccueil,
    jours: Number(jours)
  });

  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
  resetLigneAbattement();
}

function supprimerLigneAbattement(id) {
  lignesAbattement = lignesAbattement.filter((ligne) => String(ligne.id) !== String(id));
  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
}

function viderLignesAbattement() {
  if (lignesAbattement.length === 0) return;

  if (!confirm("Voulez-vous vraiment vider toutes les lignes ?")) return;

  lignesAbattement = [];
  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
}

function resetLigneAbattement() {
  if (getField("nomEnfantLigne")) getField("nomEnfantLigne").value = "";
  if (getField("periodeLigne")) getField("periodeLigne").value = "avant";
  if (getField("typeAccueilLigne")) getField("typeAccueilLigne").value = "non_permanent";
  if (getField("joursLigne")) getField("joursLigne").value = "0";
}

function formatEuro(v) {
  return Number(v || 0).toFixed(2).replace(".", ",") + " €";
}

function lireNombre(id) {
  const el = getField(id);
  if (!el) return 0;

  const parsed = parseFloat(el.value || "0");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getCoefficient(type) {
  switch (type) {
    case "non_permanent":
      return 3;
    case "non_permanent_majore":
      return 4;
    case "permanent":
      return 4;
    case "permanent_majore":
      return 5;
    default:
      return 0;
  }
}

function calculerAbattement() {
  const totalSommesRecues = lireNombre("totalSommesRecues");
  const smicAvant = lireNombre("smicAvantNov");
  const smicApres = lireNombre("smicApresNov");

  let abattement = 0;

  lignesAbattement.forEach((ligne) => {
    const coef = getCoefficient(ligne.typeAccueil);
    const smic = ligne.periode === "avant" ? smicAvant : smicApres;
    abattement += Number(ligne.jours || 0) * coef * smic;
  });

  const retenu = Math.min(abattement, totalSommesRecues);
  const imposable = Math.max(0, totalSommesRecues - retenu);

  const abattementCalcule = getField("abattementCalcule");
  const abattementRetenu = getField("abattementRetenu");
  const montantImposable = getField("montantImposable");

  if (abattementCalcule) abattementCalcule.textContent = formatEuro(abattement);
  if (abattementRetenu) abattementRetenu.textContent = formatEuro(retenu);
  if (montantImposable) montantImposable.textContent = formatEuro(imposable);

  updateCasesFiscales();
}

function updateSmicParAnnee() {
  const yearField = getYearField();
  const yearValue = Number(yearField?.value || new Date().getFullYear());
  const config = SMIC_DATA[yearValue] || SMIC_DATA[2026];

  const smicAvant = getField("smicAvantNov");
  const smicApres = getField("smicApresNov");

  if (smicAvant && !smicAvant.dataset.manualEdited) {
    smicAvant.value = Number(config.avant).toFixed(2);
  }

  if (smicApres && !smicApres.dataset.manualEdited) {
    smicApres.value = Number(config.apres).toFixed(2);
  }
}

function updateCasesFiscales() {
  const retenu = lireTexteMontant("abattementRetenu");
  const imposable = lireTexteMontant("montantImposable");

  const caseAbattement = getField("caseAbattement");
  const caseImposable = getField("caseImposable");

  if (caseAbattement) caseAbattement.value = retenu.toFixed(2);
  if (caseImposable) caseImposable.value = imposable.toFixed(2);
}

function lireTexteMontant(id) {
  const el = getField(id);
  if (!el) return 0;

  const text = String(el.textContent || "0").replace(/[^\d,.-]/g, "").replace(",", ".");
  const parsed = parseFloat(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function renderLignesAbattement() {
  const body =
    getField("lignesAbattementBody") ||
    getField("abattementBody") ||
    getField("tableAbattementBody");

  if (!body) return;

  body.innerHTML = "";

  if (lignesAbattement.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="empty-cell">Aucune ligne enregistrée</td>
      </tr>
    `;
    return;
  }

  lignesAbattement.forEach((ligne) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(ligne.enfant)}</td>
      <td>${escapeHtml(getPeriodeLabel(ligne.periode))}</td>
      <td>${escapeHtml(getTypeAccueilLabel(ligne.typeAccueil))}</td>
      <td>${Number(ligne.jours || 0).toFixed(2).replace(".", ",")}</td>
      <td>
        <button type="button" class="table-action-btn" data-id="${escapeHtml(String(ligne.id))}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  body.querySelectorAll(".table-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => supprimerLigneAbattement(btn.dataset.id));
  });
}

function getPeriodeLabel(value) {
  return value === "apres" ? "Après nov." : "Avant nov.";
}

function getTypeAccueilLabel(value) {
  switch (value) {
    case "non_permanent":
      return "Non permanent";
    case "non_permanent_majore":
      return "Non permanent majoré";
    case "permanent":
      return "Permanent";
    case "permanent_majore":
      return "Permanent majoré";
    default:
      return value || "-";
  }
}

function bindAbattementEvents() {
  const btnAjouter = getField("btnAjouterLigne");
  const btnReset = getField("btnResetLigne");
  const btnVider = getField("btnViderLignes");
  const inputNom = getField("assistantNomAbattement");
  const smicAvant = getField("smicAvantNov");
  const smicApres = getField("smicApresNov");
  const totalSommesRecues = getField("totalSommesRecues");
  const yearField = getYearField();

  if (btnAjouter) {
    btnAjouter.addEventListener("click", (e) => {
      e.preventDefault();
      ajouterLigneAbattement();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      resetLigneAbattement();
    });
  }

  if (btnVider) {
    btnVider.addEventListener("click", (e) => {
      e.preventDefault();
      viderLignesAbattement();
    });
  }

  if (inputNom) {
    inputNom.addEventListener("input", saveAssistantNomAbattement);
  }

  if (smicAvant) {
    smicAvant.addEventListener("input", () => {
      smicAvant.dataset.manualEdited = "1";
      calculerAbattement();
    });
  }

  if (smicApres) {
    smicApres.addEventListener("input", () => {
      smicApres.dataset.manualEdited = "1";
      calculerAbattement();
    });
  }

  if (totalSommesRecues) {
    totalSommesRecues.addEventListener("input", calculerAbattement);
  }

  if (yearField) {
    yearField.addEventListener("change", () => {
      updateSmicParAnnee();
      calculerAbattement();
    });
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
