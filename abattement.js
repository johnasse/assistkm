import { auth } from "./premium.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { requirePremium } from "./premium.js";

let uid = null;
let lignesAbattement = [];
let listeEnfantsAbattementMemo = [];
let moduleReady = false;

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

function getLignesKey() {
  return `lignesAbattement_${uid}`;
}

function getEnfantsKey() {
  return `listeEnfantsAbattementMemo_${uid}`;
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

function loadData() {
  lignesAbattement = JSON.parse(localStorage.getItem(getLignesKey()) || "[]");
  listeEnfantsAbattementMemo = JSON.parse(localStorage.getItem(getEnfantsKey()) || "[]");
}

function updateSmicFields() {
  const annee = el("anneeAbattement").value;
  const data = SMIC_DATA[annee] || SMIC_DATA[2025];

  el("smicAvantNov").value = data.avant;
  el("smicApresNov").value = data.apres;
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
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #e5edf8;">
      <span>${escapeHtml(nom)}</span>
      <button class="btn btn-light" data-remove-enfant="${index}" style="padding:8px 12px;">Supprimer</button>
    </div>
  `).join("");

  select.innerHTML = listeEnfantsAbattementMemo.map(nom => `
    <option value="${escapeHtmlAttr(nom)}">${escapeHtml(nom)}</option>
  `).join("");
}

function renderLignesAbattement() {
  const tbody = el("tbodyLignesAbattement");
  if (!tbody) return;

  if (!lignesAbattement.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="muted">Aucune ligne enregistrée.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lignesAbattement.map((ligne, index) => `
    <tr>
      <td>${escapeHtml(ligne.enfant)}</td>
      <td>${MOIS_LABELS[ligne.mois] || ligne.mois}</td>
      <td>${ligne.jours}</td>
      <td>${formatNumber(ligne.heuresParJour)}</td>
      <td>${formatCurrency(ligne.revenu)}</td>
      <td>${formatCurrency(ligne.abattement)}</td>
      <td>
        <button class="btn btn-light" data-remove-ligne="${index}" style="padding:8px 12px;">Supprimer</button>
      </td>
    </tr>
  `).join("");
}

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function formatCurrency(value) {
  return `${Number(value || 0).toFixed(2)} €`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(str) {
  return escapeHtml(str);
}

function getAbattementMultiplier() {
  const type = el("typeAccueil").value;
  return type === "handicap" ? 5 : 4;
}

function getSmicForMonth(mois) {
  const smicAvant = Number(el("smicAvantNov").value || 0);
  const smicApres = Number(el("smicApresNov").value || 0);
  return Number(mois) >= 11 ? smicApres : smicAvant;
}

function calculerAbattementLigne({ mois, jours, heuresParJour }) {
  const smic = getSmicForMonth(mois);
  const coefficient = getAbattementMultiplier();

  return Number(jours || 0) * Number(heuresParJour || 0) * smic * coefficient;
}

function calculerAbattement() {
  let totalRevenus = 0;
  let totalAbattement = 0;

  lignesAbattement = lignesAbattement.map((ligne) => {
    const abattement = calculerAbattementLigne(ligne);

    totalRevenus += Number(ligne.revenu || 0);
    totalAbattement += abattement;

    return {
      ...ligne,
      abattement
    };
  });

  saveLignes();
  renderLignesAbattement();

  const imposable = Math.max(0, totalRevenus - totalAbattement);

  el("resultTotalRevenus").textContent = formatCurrency(totalRevenus);
  el("resultTotalAbattement").textContent = formatCurrency(totalAbattement);
  el("resultMontantImposable").textContent = formatCurrency(imposable);
}

function resetSaisieLigne() {
  el("moisLigne").value = "1";
  el("joursAccueil").value = "0";
  el("heuresParJour").value = "0";
  el("revenuLigne").value = "0";
}

function ajouterEnfant() {
  const input = el("nomEnfant");
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

  el("enfantLigne").value = nom;
  input.value = "";
}

function supprimerEnfant(index) {
  const nom = listeEnfantsAbattementMemo[index];
  if (!nom) return;

  listeEnfantsAbattementMemo.splice(index, 1);
  lignesAbattement = lignesAbattement.filter(l => l.enfant !== nom);

  saveEnfants();
  saveLignes();

  renderListeEnfantsAbattement();
  calculerAbattement();
}

function ajouterLigneAbattement() {
  const enfant = el("enfantLigne").value;
  const mois = Number(el("moisLigne").value);
  const jours = Number(el("joursAccueil").value);
  const heuresParJour = Number(el("heuresParJour").value);
  const revenu = Number(el("revenuLigne").value);

  if (!enfant) {
    alert("Ajoute d'abord un enfant.");
    return;
  }

  if (jours <= 0) {
    alert("Le nombre de jours doit être supérieur à 0.");
    return;
  }

  if (heuresParJour <= 0) {
    alert("Le nombre d'heures par jour doit être supérieur à 0.");
    return;
  }

  if (revenu < 0) {
    alert("Le revenu ne peut pas être négatif.");
    return;
  }

  const ligne = {
    enfant,
    mois,
    jours,
    heuresParJour,
    revenu,
    abattement: calculerAbattementLigne({ mois, jours, heuresParJour })
  };

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

  const annee = el("anneeAbattement").value;
  const typeAccueil = el("typeAccueil").value === "handicap" ? "Handicap / majoré" : "Classique";

  let y = 15;

  pdf.setFontSize(18);
  pdf.text("Abattement fiscal", 14, y);
  y += 10;

  pdf.setFontSize(11);
  pdf.text(`Année : ${annee}`, 14, y); y += 7;
  pdf.text(`Type d'accueil : ${typeAccueil}`, 14, y); y += 7;
  pdf.text(`SMIC avant nov. : ${el("smicAvantNov").value}`, 14, y); y += 7;
  pdf.text(`SMIC après nov. : ${el("smicApresNov").value}`, 14, y); y += 10;

  pdf.setFontSize(12);
  pdf.text("Lignes :", 14, y);
  y += 8;

  if (!lignesAbattement.length) {
    pdf.setFontSize(10);
    pdf.text("Aucune ligne enregistrée.", 14, y);
    y += 8;
  } else {
    lignesAbattement.forEach((ligne, index) => {
      const text = `${index + 1}. ${ligne.enfant} - ${MOIS_LABELS[ligne.mois]} - ${ligne.jours} jour(s) - ${ligne.heuresParJour} h/j - revenu ${Number(ligne.revenu).toFixed(2)} € - abattement ${Number(ligne.abattement).toFixed(2)} €`;

      const lines = pdf.splitTextToSize(text, 180);
      pdf.setFontSize(10);
      pdf.text(lines, 14, y);
      y += (lines.length * 6) + 2;

      if (y > 270) {
        pdf.addPage();
        y = 15;
      }
    });
  }

  y += 6;

  const totalRevenus = lignesAbattement.reduce((sum, l) => sum + Number(l.revenu || 0), 0);
  const totalAbattement = lignesAbattement.reduce((sum, l) => sum + Number(l.abattement || 0), 0);
  const imposable = Math.max(0, totalRevenus - totalAbattement);

  pdf.setFontSize(12);
  pdf.text(`Total revenus : ${totalRevenus.toFixed(2)} €`, 14, y); y += 8;
  pdf.text(`Total abattement : ${totalAbattement.toFixed(2)} €`, 14, y); y += 8;
  pdf.text(`Montant imposable : ${imposable.toFixed(2)} €`, 14, y);

  pdf.save(`abattement_${annee}.pdf`);
}

function bindEvents() {
  if (moduleReady) return;
  moduleReady = true;

  el("anneeAbattement").addEventListener("change", () => {
    updateSmicFields();
    calculerAbattement();
  });

  el("typeAccueil").addEventListener("change", calculerAbattement);
  el("smicAvantNov").addEventListener("input", calculerAbattement);
  el("smicApresNov").addEventListener("input", calculerAbattement);

  el("btnAjouterEnfant").addEventListener("click", ajouterEnfant);
  el("btnAjouterLigneAbattement").addEventListener("click", ajouterLigneAbattement);
  el("btnResetLigneAbattement").addEventListener("click", resetSaisieLigne);
  el("btnViderLignesAbattement").addEventListener("click", viderToutesLesLignes);
  el("btnCalculerAbattement").addEventListener("click", calculerAbattement);
  el("btnPdfAbattement").addEventListener("click", exportPdfAbattement);

  el("listeEnfantsAbattement").addEventListener("click", (e) => {
    const index = e.target.getAttribute("data-remove-enfant");
    if (index !== null) {
      supprimerEnfant(Number(index));
    }
  });

  el("tbodyLignesAbattement").addEventListener("click", (e) => {
    const index = e.target.getAttribute("data-remove-ligne");
    if (index !== null) {
      supprimerLigne(Number(index));
    }
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