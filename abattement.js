import { auth, requirePremium } from "./premium.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";


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

function saveLignes() {
  localStorage.setItem(getLignesKey(), JSON.stringify(lignesAbattement));
}

function saveEnfants() {
  localStorage.setItem(getEnfantsKey(), JSON.stringify(listeEnfantsAbattementMemo));
}

function saveRevenuReference() {
  localStorage.setItem(getRevenuReferenceKey(), el("revenuTotalReference")?.value || "0");
}

function loadData() {
  lignesAbattement = JSON.parse(localStorage.getItem(getLignesKey()) || "[]");
  listeEnfantsAbattementMemo = JSON.parse(localStorage.getItem(getEnfantsKey()) || "[]");
  if (el("revenuTotalReference")) {
    el("revenuTotalReference").value = localStorage.getItem(getRevenuReferenceKey()) || "0";
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

  if (mode === "permanent") {
    heuresInput.value = "24";
    heuresInput.disabled = true;
    heuresInput.classList.add("readonly-style");
  } else {
    heuresInput.disabled = false;
    heuresInput.classList.remove("readonly-style");
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

  tbody.innerHTML = lignesAbattement.map((ligne, index) => `
    <tr>
      <td>${escapeHtml(ligne.enfant)}</td>
      <td>${MOIS_LABELS[ligne.mois] || ligne.mois}</td>
      <td>${Number(ligne.jours || 0)}</td>
      <td>${Number(ligne.heuresParJour || 0).toFixed(2)}</td>
      <td>${ligne.modeAccueil === "permanent" ? "Permanent 24h" : "Non permanent"}</td>
      <td>${ligne.majoration ? "Oui" : "Non"}</td>
      <td>${formatCurrency(ligne.revenu)}</td>
      <td>${formatCurrency(ligne.abattement)}</td>
      <td><button class="btn btn-light" type="button" data-remove-ligne="${index}" style="padding:8px 12px;">Supprimer</button></td>
    </tr>
  `).join("");
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
      <span>Total revenus des lignes</span>
      <span class="strong">${formatCurrency(totalRevenusLignes)}</span>
    </div>
    <div class="result-line">
      <span>Revenu total de référence</span>
      <span class="strong">${formatCurrency(revenuReference)}</span>
    </div>
    ${details}
    <div class="result-line">
      <span>Total abattement</span>
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
  if (el("moisLigne")) el("moisLigne").value = "1";
  if (el("joursAccueil")) el("joursAccueil").value = "0";
  if (el("heuresParJour")) el("heuresParJour").value = "8";
  if (el("revenuLigne")) el("revenuLigne").value = "0";
  if (el("modeAccueilLigne")) el("modeAccueilLigne").value = "non_permanent";
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
  const revenu = Number(el("revenuLigne")?.value || 0);

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

  const ligne = {
    enfant,
    mois,
    jours,
    heuresParJour,
    modeAccueil,
    majoration,
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

function exportPdfAbattement() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie PDF est introuvable.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const annee = el("anneeAbattement")?.value || "";
  let y = 15;

  pdf.setFontSize(18);
  pdf.text("Abattement fiscal", 14, y);
  y += 10;

  pdf.setFontSize(11);
  pdf.text(`Année : ${annee}`, 14, y); y += 7;
  pdf.text(`Revenu total de référence : ${Number(el("revenuTotalReference")?.value || 0).toFixed(2)} €`, 14, y); y += 10;

  pdf.setFontSize(12);
  pdf.text("Lignes :", 14, y);
  y += 8;

  if (!lignesAbattement.length) {
    pdf.setFontSize(10);
    pdf.text("Aucune ligne enregistrée.", 14, y);
    y += 8;
  } else {
    lignesAbattement.forEach((ligne, index) => {
      const texte = `${index + 1}. ${ligne.enfant} - ${MOIS_LABELS[ligne.mois]} - ${ligne.jours} jour(s) - mode ${ligne.modeAccueil === "permanent" ? "permanent 24h" : "non permanent"} - ${ligne.majoration ? "majoré" : "non majoré"} - revenu ${Number(ligne.revenu).toFixed(2)} € - abattement ${Number(ligne.abattement).toFixed(2)} €`;
      const lignesTexte = pdf.splitTextToSize(texte, 180);
      pdf.setFontSize(10);
      pdf.text(lignesTexte, 14, y);
      y += lignesTexte.length * 6 + 2;
      if (y > 270) {
        pdf.addPage();
        y = 15;
      }
    });
  }

  y += 6;
  const totalRevenus = lignesAbattement.reduce((sum, ligne) => sum + Number(ligne.revenu || 0), 0);
  const totalAbattement = lignesAbattement.reduce((sum, ligne) => sum + Number(ligne.abattement || 0), 0);
  const revenuReference = Number(el("revenuTotalReference")?.value || 0);
  const imposable = Math.max(0, revenuReference - totalAbattement);

  pdf.setFontSize(12);
  pdf.text(`Total revenus des lignes : ${totalRevenus.toFixed(2)} €`, 14, y); y += 8;
  pdf.text(`Revenu total de référence : ${revenuReference.toFixed(2)} €`, 14, y); y += 8;
  pdf.text(`Total abattement : ${totalAbattement.toFixed(2)} €`, 14, y); y += 8;
  pdf.text(`Montant imposable : ${imposable.toFixed(2)} €`, 14, y);

  pdf.save(`abattement_${annee}.pdf`);
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  el("btnImportPresence")?.addEventListener("click", importerDepuisPresence);

  el("anneeAbattement")?.addEventListener("change", () => {
    updateSmicFields();
    calculerAbattement();
  });

  el("smicAvantNov")?.addEventListener("input", calculerAbattement);
  el("smicApresNov")?.addEventListener("input", calculerAbattement);
  el("revenuTotalReference")?.addEventListener("input", calculerAbattement);

  el("modeAccueilLigne")?.addEventListener("change", () => {
    updateHeuresFieldState();
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

  if (!allowed) {
    showLock();
    return;
  }

  showApp();
  updateSmicFields();
  loadData();
  bindEvents();
  updateHeuresFieldState();
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
      l.enfant === item.enfant && Number(l.mois) === Number(item.mois)
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