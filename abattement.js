import { auth } from "./firebase-config.js";
import { requirePremium, requirePdfAccess } from "./premium.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { saveModuleData, loadModuleData } from "./cloud-sync.js";

let uid = null;
let lignesAbattement = [];
let listeEnfantsAbattementMemo = [];
let eventsBound = false;

const SMIC_DATA = {
  2024: { avant: 11.65, apres: 11.88 },
  2025: { avant: 11.88, apres: 11.88 },
  2026: { avant: 11.88, apres: 11.88 }
};

const MOIS_LABELS = {
  1: "Janvier",
  2: "Février",
  3: "Mars",
  4: "Avril",
  5: "Mai",
  6: "Juin",
  7: "Juillet",
  8: "Août",
  9: "Septembre",
  10: "Octobre",
  11: "Novembre",
  12: "Décembre"
};
function getJoursDansMois(mois, annee) {
  return new Date(Number(annee), Number(mois), 0).getDate();
}

function remplirJoursSelonMois() {
  const mois = Number(el("moisLigne")?.value || 1);
  const annee = Number(el("anneeAbattement")?.value || new Date().getFullYear());
  const joursInput = el("joursAccueil");

  if (!joursInput) return;

  joursInput.value = getJoursDansMois(mois, annee);
  const entretienInput = el("entretienLigne");
if (entretienInput) {
  entretienInput.value = (Number(joursInput.value) * 17).toFixed(2);
}
}

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function getLignesKey() {
  return `lignesAbattement_${uid}`;
}

function getEnfantsKey() {
  return `listeEnfantsAbattementMemo_${uid}`;
}

function getRevenuReferenceKey() {
  return `revenuReferenceAbattement_${uid}`;
}

function showLock() {
  const lock = el("abattementLock");
  const app = el("abattementApp");
  if (lock) lock.style.display = "flex";
  if (app) app.style.display = "none";
}

function showApp() {
  const lock = el("abattementLock");
  const app = el("abattementApp");
  if (lock) lock.style.display = "none";
  if (app) app.style.display = "block";
}

async function saveLignes() {
  localStorage.setItem(getLignesKey(), JSON.stringify(lignesAbattement));

  await saveModuleData(uid, "abattement", {
    lignesAbattement,
    listeEnfantsAbattementMemo,
    revenuTotalReference: el("revenuTotalReference")?.value || "0"
  });
}

async function saveEnfants() {
  localStorage.setItem(getEnfantsKey(), JSON.stringify(listeEnfantsAbattementMemo));

  await saveModuleData(uid, "abattement", {
    lignesAbattement,
    listeEnfantsAbattementMemo,
    revenuTotalReference: el("revenuTotalReference")?.value || "0"
  });
}

async function saveRevenuReference() {
  localStorage.setItem(
    getRevenuReferenceKey(),
    el("revenuTotalReference")?.value || "0"
  );

  await saveModuleData(uid, "abattement", {
    lignesAbattement,
    listeEnfantsAbattementMemo,
    revenuTotalReference: el("revenuTotalReference")?.value || "0"
  });
}

async function loadData() {
  const cloudData = await loadModuleData(uid, "abattement");

  if (cloudData) {
    lignesAbattement = cloudData.lignesAbattement || [];
    listeEnfantsAbattementMemo =
      cloudData.listeEnfantsAbattementMemo || [];

    if (el("revenuTotalReference")) {
      el("revenuTotalReference").value =
        cloudData.revenuTotalReference || "0";
    }

    return;
  }

  lignesAbattement =
    JSON.parse(localStorage.getItem(getLignesKey()) || "[]");

  listeEnfantsAbattementMemo =
    JSON.parse(localStorage.getItem(getEnfantsKey()) || "[]");

  if (el("revenuTotalReference")) {
    el("revenuTotalReference").value =
      localStorage.getItem(getRevenuReferenceKey()) || "0";
  }
}

function updateSmicFields() {
  const annee = el("anneeAbattement")?.value || "2025";
  const data = SMIC_DATA[annee] || SMIC_DATA["2025"];
  if (el("smicAvantNov")) el("smicAvantNov").value = data.avant;
  if (el("smicApresNov")) el("smicApresNov").value = data.apres;
}

function getSmicForMonth(mois) {
  const smicAvant = Number(el("smicAvantNov")?.value || 0);
  const smicApres = Number(el("smicApresNov")?.value || 0);
  return Number(mois) >= 11 ? smicApres : smicAvant;
}

function getCoefficient(mode, majoration) {
  if (mode === "permanent") {
    return majoration ? 5 : 4;
  }
  return majoration ? 4 : 3;
}

function updateHeuresFieldState() {
  const mode = el("modeAccueilLigne")?.value || "non_permanent";
  const heuresInput = el("heuresParJour");
  if (!heuresInput) return;

  const container = heuresInput.parentElement;

  if (mode === "permanent") {
    heuresInput.value = "24";
    heuresInput.disabled = true;
    heuresInput.classList.add("readonly-style");

    if (container) container.style.display = "none"; // 👈 cache propre
  } else {
    heuresInput.disabled = false;
    heuresInput.classList.remove("readonly-style");

    if (container) container.style.display = "block"; // 👈 affiche

    if (!heuresInput.value || Number(heuresInput.value) <= 0) {
      heuresInput.value = "8";
    }
  }
}

function calculerAbattementLigne(ligne) {
  const smic = getSmicForMonth(ligne.mois);
  const coefficient = getCoefficient(ligne.modeAccueil, ligne.majoration);

  if (ligne.modeAccueil === "permanent") {
    return Number(ligne.jours || 0) * smic * coefficient;
  }

  const heures = Number(ligne.heuresParJour || 0);

  if (heures >= 8) {
    return Number(ligne.jours || 0) * smic * coefficient;
  }

  return Number(ligne.jours || 0) * (heures / 8) * smic * coefficient;
}

function renderListeEnfantsAbattement() {
  const container = el("listeEnfantsAbattement");
  const select = el("enfantLigne");
  if (!container || !select) return;

  if (!listeEnfantsAbattementMemo.length) {
    container.innerHTML = `<span class="muted">Aucun enfant enregistré.</span>`;
    select.innerHTML = `<option value="">Aucun enfant</option>`;
    return;
  }

  container.innerHTML = listeEnfantsAbattementMemo.map((nom, index) => `
    <div class="child-item">
      <span>${escapeHtml(nom)}</span>
      <button class="btn btn-light" type="button" data-remove-enfant="${index}" style="padding:8px 12px;">Supprimer</button>
    </div>
  `).join("");

  select.innerHTML = `
    <option value="">Choisir un enfant</option>
    ${listeEnfantsAbattementMemo.map(nom => `
      <option value="${escapeHtml(nom)}">${escapeHtml(nom)}</option>
    `).join("")}
  `;
}

function renderLignesAbattement() {
  const tbody = el("tbodyLignesAbattement");
  if (!tbody) return;

  if (!lignesAbattement.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="muted">Aucune ligne enregistrée.</td></tr>`;
    return;
  }
  lignesAbattement.sort((a, b) => {
  const enfantA = (a.enfant || "").toLowerCase();
  const enfantB = (b.enfant || "").toLowerCase();

  if (enfantA !== enfantB) {
    return enfantA.localeCompare(enfantB, "fr");
  }

  return Number(a.mois || 0) - Number(b.mois || 0);
});

let enfantActuel = "";
let totalJours = 0;
let totalAbattement = 0;

let html = "";

lignesAbattement.forEach((ligne, index) => {
  const changementEnfant = ligne.enfant !== enfantActuel;

  // 👉 Si on change d'enfant → afficher le total du précédent
  if (changementEnfant && enfantActuel !== "") {
    html += `
      <tr>
        <td colspan="9" style="background:#f1f5f9;font-weight:700;padding:8px;">
          Total ${escapeHtml(enfantActuel)} : ${totalJours} jours / ${formatCurrency(totalAbattement)}
        </td>
      </tr>
    `;
    totalJours = 0;
    totalAbattement = 0;
  }

  // 👉 Nouveau titre enfant
  if (changementEnfant) {
    html += `
      <tr>
        <td colspan="9" style="background:#eff6ff;font-weight:800;text-align:left;padding:10px;">
          ${escapeHtml(ligne.enfant)}
        </td>
      </tr>
    `;
    enfantActuel = ligne.enfant;
  }

  totalJours += Number(ligne.jours || 0);
  totalAbattement += Number(ligne.abattement || 0);

  html += `
    <tr>
      <td></td>
      <td>${MOIS_LABELS[ligne.mois] || ligne.mois}</td>
      <td>${Number(ligne.jours || 0)}</td>
      <td>${Number(ligne.heuresParJour || 0).toFixed(2)}</td>
      <td>${ligne.modeAccueil === "permanent" ? "Permanent 24h" : "Non permanent"}</td>
      <td>${ligne.majoration ? "Oui" : "Non"}</td>
      <td>${formatCurrency(ligne.revenu)}</td>
      <td>${formatCurrency(ligne.abattement)}</td>
      <td><button class="btn btn-light" type="button" data-remove-ligne="${index}" style="padding:8px 12px;">Supprimer</button></td>
    </tr>
  `;
});

// 👉 Ajouter le dernier total
if (enfantActuel !== "") {
  html += `
    <tr>
      <td colspan="9" style="background:#f1f5f9;font-weight:700;padding:8px;">
        Total ${escapeHtml(enfantActuel)} : ${totalJours} jours / ${formatCurrency(totalAbattement)}
      </td>
    </tr>
  `;
}

tbody.innerHTML = html;
}
function renderDetailCalcul() {
  const container = el("detailCalculAbattement");
  if (!container) return;

  const revenuReference = Number(el("revenuTotalReference")?.value || 0);

  if (!lignesAbattement.length) {
    container.innerHTML = `<div class="muted">Aucune ligne enregistrée pour détailler le calcul.</div>`;
    return;
  }

  let totalAbattement = 0;
  let totalRevenusLignes = 0;

  const details = lignesAbattement.map((ligne, index) => {
    const smic = getSmicForMonth(ligne.mois);
    const coefficient = getCoefficient(ligne.modeAccueil, ligne.majoration);
    const abattement = Number(ligne.abattement || 0);

    totalAbattement += abattement;
    totalRevenusLignes += Number(ligne.revenu || 0);

    let formule = "";
    if (ligne.modeAccueil === "permanent") {
      formule = `${ligne.jours} jour(s) × ${smic.toFixed(2)} € × coefficient ${coefficient}`;
    } else if (Number(ligne.heuresParJour || 0) >= 8) {
      formule = `${ligne.jours} jour(s) × ${smic.toFixed(2)} € × coefficient ${coefficient}`;
    } else {
      formule = `${ligne.jours} jour(s) × (${Number(ligne.heuresParJour).toFixed(2)} / 8) × ${smic.toFixed(2)} € × coefficient ${coefficient}`;
    }

    return `
      <div class="detail-block">
        <div><strong>Ligne ${index + 1}</strong> — ${escapeHtml(ligne.enfant)} (${MOIS_LABELS[ligne.mois] || ligne.mois})</div>
        <div style="margin-top:6px; color:#475569;">
          ${formule} = <strong>${abattement.toFixed(2)} €</strong><br>
          <em>Mode : ${ligne.modeAccueil === "permanent" ? "permanent 24h" : "non permanent"}${ligne.majoration ? " • majoré" : ""}</em>
        </div>
      </div>
    `;
  }).join("");

  const imposable = Math.max(0, revenuReference - totalAbattement);

  container.innerHTML = `
    <div class="result-line">
      <span>Total indemnités perçues</span>
      <span class="strong">${formatCurrency(totalRevenusLignes)}</span>
    </div>
    <div class="result-line">
      <span>Revenu total de référence</span>
      <span class="strong">${formatCurrency(revenuReference)}</span>
    </div>
    ${details}
    <div class="result-line">
      <span>Abattement fiscal</span>
      <span class="strong">${formatCurrency(totalAbattement)}</span>
    </div>
    <div class="result-line">
      <span>Montant imposable</span>
      <span class="strong">${formatCurrency(imposable)}</span>
    </div>
  `;
}

function calculerAbattement() {
  let totalRevenusLignes = 0;
  let totalAbattement = 0;

  lignesAbattement = lignesAbattement.map((ligne) => {
    const abattement = calculerAbattementLigne(ligne);
    totalRevenusLignes += Number(ligne.revenu || 0);
    totalAbattement += abattement;
    return { ...ligne, abattement };
  });
  lignesAbattement.sort((a, b) => {
  const enfantA = (a.enfant || "").toLowerCase();
  const enfantB = (b.enfant || "").toLowerCase();

  if (enfantA !== enfantB) {
    return enfantA.localeCompare(enfantB, "fr");
  }

  return Number(a.mois || 0) - Number(b.mois || 0);
});

  saveLignes();
  renderLignesAbattement();

  const revenuReference = Number(el("revenuTotalReference")?.value || 0);
  saveRevenuReference();

  const imposable = Math.max(0, revenuReference - totalAbattement);

  if (el("resultTotalRevenus")) el("resultTotalRevenus").textContent = formatCurrency(totalRevenusLignes);
  if (el("resultRevenuReference")) el("resultRevenuReference").textContent = formatCurrency(revenuReference);
  if (el("resultTotalAbattement")) el("resultTotalAbattement").textContent = formatCurrency(totalAbattement);
  if (el("resultMontantImposable")) el("resultMontantImposable").textContent = formatCurrency(imposable);

  renderDetailCalcul();
}

function resetSaisieLigne() {
  const moisInput = el("moisLigne");

if (moisInput) {
  const moisActuel = Number(moisInput.value || 1);
  const moisSuivant = moisActuel >= 12 ? 12 : moisActuel + 1;
  moisInput.value = String(moisSuivant);
}

remplirJoursSelonMois();
  if (el("heuresParJour")) el("heuresParJour").value = "8";

  // 👇 valeurs par défaut
  if (el("entretienLigne")) {
  const jours = Number(el("joursAccueil")?.value || 0);
  el("entretienLigne").value = (jours * 17).toFixed(2);
}
  if (el("habillementLigne")) el("habillementLigne").value = "47.33";
  if (el("rentreeLigne")) el("rentreeLigne").value = "0";
  if (el("noelLigne")) el("noelLigne").value = "0";

  if (el("modeAccueilLigne")) el("modeAccueilLigne").value = "permanent";
  if (el("majorationLigne")) el("majorationLigne").value = "non";

  updateHeuresFieldState();
}

function ajouterEnfant() {
  const input = el("nomEnfant");
  if (!input) return;

  const nom = (input.value || "").trim();
  if (!nom) {
    alert("Entre un prénom d'enfant.");
    return;
  }

  if (listeEnfantsAbattementMemo.includes(nom)) {
    alert("Cet enfant est déjà enregistré.");
    return;
  }

  listeEnfantsAbattementMemo.push(nom);
  saveEnfants();
  renderListeEnfantsAbattement();
  if (el("enfantLigne")) el("enfantLigne").value = nom;
  input.value = "";
}

function supprimerEnfant(index) {
  const nom = listeEnfantsAbattementMemo[index];
  if (!nom) return;

  listeEnfantsAbattementMemo.splice(index, 1);
  lignesAbattement = lignesAbattement.filter((ligne) => ligne.enfant !== nom);

  saveEnfants();
  saveLignes();
  renderListeEnfantsAbattement();
  calculerAbattement();
}

function ajouterLigneAbattement() {
  const enfant = el("enfantLigne")?.value || "";
  const mois = Number(el("moisLigne")?.value || 1);
  const jours = Number(el("joursAccueil")?.value || 0);
  const modeAccueil = el("modeAccueilLigne")?.value || "non_permanent";
  const majoration = (el("majorationLigne")?.value || "non") === "oui";
  const heuresParJour = modeAccueil === "permanent" ? 24 : Number(el("heuresParJour")?.value || 0);
 const entretienParJour = 17;
const entretien = jours * entretienParJour;
 const habillement = Number(el("habillementLigne")?.value || 0);
const rentree = Number(el("rentreeLigne")?.value || 0);
const noel = Number(el("noelLigne")?.value || 0);
const revenu = entretien + habillement + rentree + noel;

  if (!enfant) {
    alert("Choisis un enfant.");
    return;
  }

  if (jours <= 0) {
    alert("Le nombre de jours doit être supérieur à 0.");
    return;
  }

  if (modeAccueil === "non_permanent" && heuresParJour <= 0) {
    alert("Le nombre d'heures doit être supérieur à 0.");
    return;
  }
const doublon = lignesAbattement.some(ligne =>
  (ligne.enfant || "").trim().toLowerCase() === (enfant || "").trim().toLowerCase() &&
  Number(ligne.mois) === Number(mois)
);

if (doublon) {
  alert(`Une ligne existe déjà pour ${enfant} en ${MOIS_LABELS[mois]}.`);
  return;
}
const ligne = {
  enfant,
  mois,
  jours,
  heuresParJour,
  modeAccueil,
  majoration,
  entretien,
  revenu,
  abattement: 0
};

  ligne.abattement = calculerAbattementLigne(ligne);
  lignesAbattement.push(ligne);

  saveLignes();
  renderLignesAbattement();
  calculerAbattement();
  resetSaisieLigne();
}

function supprimerLigne(index) {
  lignesAbattement.splice(index, 1);
  saveLignes();
  calculerAbattement();
}

function viderToutesLesLignes() {
  if (!confirm("Voulez-vous vraiment vider toutes les lignes ?")) return;
  lignesAbattement = [];
  saveLignes();
  calculerAbattement();
}
function viderLignesEnfantSelectionne() {
  const enfant = el("enfantLigne")?.value || "";

  if (!enfant) {
    alert("Choisis d'abord un enfant.");
    return;
  }

  const lignesEnfant = lignesAbattement.filter(ligne =>
    (ligne.enfant || "").trim().toLowerCase() === enfant.trim().toLowerCase()
  );

  if (!lignesEnfant.length) {
    alert(`Aucune ligne trouvée pour ${enfant}.`);
    return;
  }

  if (!confirm(`Supprimer toutes les lignes de ${enfant} ?`)) return;

  lignesAbattement = lignesAbattement.filter(ligne =>
    (ligne.enfant || "").trim().toLowerCase() !== enfant.trim().toLowerCase()
  );

  saveLignes();
  calculerAbattement();
}
async function exportPdfAbattement() {
  const allowed = await requirePdfAccess();
if (!allowed) return;
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie PDF est introuvable.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("portrait", "mm", "a4");

  const annee = el("anneeAbattement")?.value || "";
  const revenuReference = Number(el("revenuTotalReference")?.value || 0);

  lignesAbattement.sort((a, b) => {
    const enfantA = (a.enfant || "").toLowerCase();
    const enfantB = (b.enfant || "").toLowerCase();
    if (enfantA !== enfantB) return enfantA.localeCompare(enfantB, "fr");
    return Number(a.mois || 0) - Number(b.mois || 0);
  });

  let y = 15;
  const left = 10;
  const pageWidth = 210;
  const usableWidth = 190;

  const totalIndemnites = lignesAbattement.reduce((s, l) => s + Number(l.revenu || 0), 0);
  const totalAbattement = lignesAbattement.reduce((s, l) => s + Number(l.abattement || 0), 0);
  const montantImposable = Math.max(0, revenuReference - totalAbattement);

  function checkPage(extra = 20) {
    if (y + extra > 280) {
      pdf.addPage();
      y = 15;
      addFooter();
    }
  }

  function addFooter() {
    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`PDF généré le ${new Date().toLocaleDateString("fr-FR")}`, left, 290);
    pdf.text("Document généré automatiquement par easyfrais.fr", pageWidth - 10, 290, { align: "right" });
    pdf.setTextColor(0, 0, 0);
  }

  function text(label, x, yy, options = {}) {
    pdf.setFont("helvetica", options.bold ? "bold" : "normal");
    pdf.setFontSize(options.size || 9);
    pdf.text(String(label ?? ""), x, yy, options.align ? { align: options.align } : undefined);
  }

  function money(value) {
    return formatCurrency(value);
  }

  function drawSummaryBox(title, rows) {
    checkPage(12 + rows.length * 8);
    pdf.setDrawColor(180);
    pdf.setFillColor(245, 248, 252);
    pdf.rect(left, y, usableWidth, 10 + rows.length * 8, "FD");

    text(title, left + 4, y + 7, { bold: true, size: 11 });
    y += 12;

    rows.forEach(([label, value, strong]) => {
      text(label, left + 5, y + 5, { bold: strong });
      text(value, left + usableWidth - 5, y + 5, { bold: strong, align: "right" });
      y += 8;
    });

    y += 6;
  }

  function drawTableHeader() {
    pdf.setFillColor(230, 238, 250);
    pdf.setDrawColor(180);
    pdf.rect(left, y, usableWidth, 8, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);

    pdf.text("Mois", left + 3, y + 5.5);
    pdf.text("Jours", left + 31, y + 5.5);
    pdf.text("Mode", left + 49, y + 5.5);
    pdf.text("Entretien", left + 82, y + 5.5);
    pdf.text("Habil.", left + 108, y + 5.5);
    pdf.text("Rentrée", left + 130, y + 5.5);
    pdf.text("Noël", left + 154, y + 5.5);
    pdf.text("Abattement", left + 177, y + 5.5, { align: "right" });

    y += 8;
  }

  function drawLine(ligne) {
    checkPage(10);

    pdf.setDrawColor(220);
    pdf.line(left, y + 8, left + usableWidth, y + 8);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);

    const modeLabel = ligne.modeAccueil === "permanent" ? "Permanent 24h" : "Non permanent";

    pdf.text(MOIS_LABELS[ligne.mois] || String(ligne.mois), left + 3, y + 5);
    pdf.text(String(Number(ligne.jours || 0)), left + 33, y + 5);
    pdf.text(modeLabel, left + 49, y + 5);
    pdf.text(money(ligne.entretien || 0), left + 100, y + 5, { align: "right" });
    pdf.text(money(ligne.habillement || 0), left + 123, y + 5, { align: "right" });
    pdf.text(money(ligne.rentree || 0), left + 147, y + 5, { align: "right" });
    pdf.text(money(ligne.noel || 0), left + 168, y + 5, { align: "right" });
    pdf.text(money(ligne.abattement || 0), left + 186, y + 5, { align: "right" });

    y += 8;
  }

  // TITRE
  pdf.setFillColor(30, 64, 175);
  pdf.rect(0, 0, 210, 28, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(`ABATTEMENT FISCAL ${annee}`, left, 18);

  pdf.setFontSize(9);
  pdf.text("Assistant familial - Récapitulatif fiscal", pageWidth - 10, 18, { align: "right" });

  pdf.setTextColor(0, 0, 0);
  y = 38;

  drawSummaryBox("Synthèse générale", [
    ["Total indemnités perçues", money(totalIndemnites), true],
    ["Revenu total de référence", money(revenuReference), false],
    ["Abattement fiscal", money(totalAbattement), true],
    ["Montant imposable estimé", money(montantImposable), true]
  ]);

  let enfantActuel = "";
  let totalJoursEnfant = 0;
  let totalIndemnitesEnfant = 0;
  let totalAbattementEnfant = 0;

  lignesAbattement.forEach((ligne, index) => {
    const changementEnfant = ligne.enfant !== enfantActuel;

    if (changementEnfant) {
      if (enfantActuel !== "") {
        drawSummaryBox(`Total ${enfantActuel}`, [
          ["Jours d'accueil", `${totalJoursEnfant} jours`, false],
          ["Indemnités perçues", money(totalIndemnitesEnfant), true],
          ["Abattement fiscal", money(totalAbattementEnfant), true]
        ]);
      }

      enfantActuel = ligne.enfant;
      totalJoursEnfant = 0;
      totalIndemnitesEnfant = 0;
      totalAbattementEnfant = 0;

      checkPage(20);
      pdf.setFillColor(219, 234, 254);
      pdf.rect(left, y, usableWidth, 9, "F");

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.setTextColor(30, 64, 175);
      pdf.text(String(enfantActuel).toUpperCase(), left + 4, y + 6);
      pdf.setTextColor(0, 0, 0);

      y += 11;
      drawTableHeader();
    }

    drawLine(ligne);

    totalJoursEnfant += Number(ligne.jours || 0);
    totalIndemnitesEnfant += Number(ligne.revenu || 0);
    totalAbattementEnfant += Number(ligne.abattement || 0);
  });

  if (enfantActuel !== "") {
    drawSummaryBox(`Total ${enfantActuel}`, [
      ["Jours d'accueil", `${totalJoursEnfant} jours`, false],
      ["Indemnités perçues", money(totalIndemnitesEnfant), true],
      ["Abattement fiscal", money(totalAbattementEnfant), true]
    ]);
  }

  drawSummaryBox("Résultat final", [
    ["Total indemnités perçues", money(totalIndemnites), true],
    ["Abattement fiscal", money(totalAbattement), true],
    ["Montant imposable estimé", money(montantImposable), true]
  ]);

  addFooter();
  pdf.save(`abattement_fiscal_${annee}.pdf`);
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  el("btnImportPresence")?.addEventListener("click", importerDepuisPresence);

  el("anneeAbattement")?.addEventListener("change", () => {
  updateSmicFields();
  remplirJoursSelonMois();
  calculerAbattement();
});
el("joursAccueil")?.addEventListener("input", () => {
  const jours = Number(el("joursAccueil")?.value || 0);

  if (el("entretienLigne")) {
    el("entretienLigne").value = (jours * 17).toFixed(2);
  }
});

el("moisLigne")?.addEventListener("change", remplirJoursSelonMois);

  el("smicAvantNov")?.addEventListener("input", calculerAbattement);
  el("smicApresNov")?.addEventListener("input", calculerAbattement);
  el("revenuTotalReference")?.addEventListener("input", calculerAbattement);

  el("modeAccueilLigne")?.addEventListener("change", () => {
    updateHeuresFieldState();
    remplirJoursSelonMois();
    calculerAbattement();
  });

  el("heuresParJour")?.addEventListener("input", calculerAbattement);
  el("majorationLigne")?.addEventListener("change", calculerAbattement);

  el("btnAjouterEnfant")?.addEventListener("click", ajouterEnfant);
  el("btnAjouterLigneAbattement")?.addEventListener("click", ajouterLigneAbattement);
  el("btnResetLigneAbattement")?.addEventListener("click", resetSaisieLigne);
  el("btnViderLignesAbattement")?.addEventListener("click", viderToutesLesLignes);
  el("btnCalculerAbattement")?.addEventListener("click", calculerAbattement);
  el("btnPdfAbattement")?.addEventListener("click", exportPdfAbattement);
  el("btnViderLignesEnfant")?.addEventListener("click", viderLignesEnfantSelectionne);

  el("listeEnfantsAbattement")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const index = target.getAttribute("data-remove-enfant");
    if (index !== null) supprimerEnfant(Number(index));
  });

  el("tbodyLignesAbattement")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const index = target.getAttribute("data-remove-ligne");
    if (index !== null) supprimerLigne(Number(index));
  });
}

async function initModule() {
  const allowed = await requirePremium();
if (el("modeAccueilLigne")) {
  el("modeAccueilLigne").value = "permanent";
}
updateHeuresFieldState();
  if (!allowed) {
    showLock();
    return;
  }

showApp();
updateSmicFields();
await loadData();
bindEvents();
updateHeuresFieldState();
remplirJoursSelonMois();
renderListeEnfantsAbattement();
renderLignesAbattement();
calculerAbattement();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  await initModule();
});
function importerDepuisPresence() {
  const uidSafe = uid || "guest";
  const anneeSelectionnee = Number(el("anneeAbattement").value);
  const key = `presenceAbattement_${uidSafe}_${anneeSelectionnee}`;
  const archive = JSON.parse(localStorage.getItem(key) || "[]");

  if (!archive.length) {
    alert("Aucune présence enregistrée pour cette année.");
    return;
  }

  let importCount = 0;

  archive.forEach((item) => {
    if (!item.enfant || !item.mois || !item.jours) return;

    const existe = lignesAbattement.some(l =>
  (l.enfant || "").trim().toLowerCase() === (item.enfant || "").trim().toLowerCase() &&
  Number(l.mois) === Number(item.mois)
);

    if (existe) return;

    const modeAccueil = item.modeAccueil || "non_permanent";
const isPermanent = modeAccueil === "permanent";

const ligne = {
  enfant: item.enfant,
  mois: Number(item.mois),
  jours: Number(item.jours),
  heuresParJour: isPermanent ? 24 : 8,
  modeAccueil: isPermanent ? "permanent" : "non_permanent",
  majoration: false,
  revenu: 0,
  abattement: 0
};

    ligne.abattement = calculerAbattementLigne(ligne);
    lignesAbattement.push(ligne);

    if (!listeEnfantsAbattementMemo.includes(item.enfant)) {
      listeEnfantsAbattementMemo.push(item.enfant);
    }

    importCount++;
  });

  saveLignes();
  saveEnfants();
  renderListeEnfantsAbattement();
  calculerAbattement();

  alert(`${importCount} ligne(s) importée(s) depuis les fiches de présence.`);
}