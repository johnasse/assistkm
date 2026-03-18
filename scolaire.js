import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisScolaires = [];
let uid = null;
let scolaireEventsBound = false;

function getStorageKey() {
  return `fraisScolairesMensuels_${uid}`;
}

function initScolaireDB() {
  return true;
}

function getMonthDefaultValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${year}-${month}`;
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTotalScolaire() {
  return fraisScolaires.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function saveFraisScolaires() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisScolaires));
}

function chargerInfosScolaire() {
  const assistantNom =
    localStorage.getItem(`assistantNomScolaire_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const moisScolaire = localStorage.getItem(`moisScolaire_${uid}`);

  document.getElementById("assistantNomScolaire").value = assistantNom;
  document.getElementById("moisScolaire").value = moisScolaire || getMonthDefaultValue();
}

function saveAssistantNomScolaire() {
  localStorage.setItem(
    `assistantNomScolaire_${uid}`,
    document.getElementById("assistantNomScolaire").value.trim()
  );
}

function saveMoisScolaire() {
  localStorage.setItem(
    `moisScolaire_${uid}`,
    document.getElementById("moisScolaire").value
  );
}

function updateNomJustificatifScolaire() {
  const file = document.getElementById("justificatifScolaire").files[0];
  document.getElementById("nomJustificatifScolaire").textContent =
    file ? `Fichier sélectionné : ${file.name}` : "";
}

async function ajouterFraisScolaire() {
  const date = document.getElementById("dateScolaire").value;
  const enfant = document.getElementById("enfantScolaire").value.trim();
  const type = document.getElementById("typeScolaire").value;
  const ecole = document.getElementById("ecoleScolaire").value.trim();
  const objet = document.getElementById("objetScolaire").value.trim();
  const montant = parseFloat(document.getElementById("montantScolaire").value);

  if (!date || !enfant || !type || !ecole || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  fraisScolaires.push({
    id: Date.now(),
    date,
    enfant,
    type,
    ecole,
    objet,
    montant: Number(montant.toFixed(2))
  });

  saveFraisScolaires();
  renderScolaire();
  resetFormScolaire();
}

function renderScolaire() {
  const body = document.getElementById("scolaireBody");
  body.innerHTML = "";

  if (fraisScolaires.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    updateTotalsScolaire();
    return;
  }

  fraisScolaires.forEach((item) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.ecole)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>Aucun</td>
      <td>
        <button class="table-action-btn btn-delete-scolaire" data-id="${item.id}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-scolaire").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisScolaire(Number(btn.dataset.id)));
  });

  updateTotalsScolaire();
}

function supprimerFraisScolaire(id) {
  fraisScolaires = fraisScolaires.filter((row) => row.id !== id);
  saveFraisScolaires();
  renderScolaire();
}

function viderListeScolaire() {
  if (fraisScolaires.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisScolaires = [];
  saveFraisScolaires();
  renderScolaire();
}

function updateTotalsScolaire() {
  const totalMontant = getTotalScolaire();

  document.getElementById("totalLignesScolaire").textContent = String(fraisScolaires.length);
  document.getElementById("totalMontantScolaire").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function resetFormScolaire() {
  document.getElementById("dateScolaire").value = "";
  document.getElementById("enfantScolaire").value = "";
  document.getElementById("typeScolaire").value = "";
  document.getElementById("ecoleScolaire").value = "";
  document.getElementById("objetScolaire").value = "";
  document.getElementById("montantScolaire").value = "";
  document.getElementById("justificatifScolaire").value = "";
  document.getElementById("nomJustificatifScolaire").textContent = "";
}

async function genererPDFScolaire() {
  if (!fraisScolaires.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const assistant = document.getElementById("assistantNomScolaire").value.trim() || "-";
  const mois = document.getElementById("moisScolaire").value || "";
  const total = getTotalScolaire();

  let y = 12;

  pdf.setFontSize(14);
  pdf.text("Frais scolaires", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant familial : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  fraisScolaires.forEach((item) => {
    const line = `${formatDateFr(item.date)} | ${item.enfant} | ${item.type} | ${item.ecole} | ${item.objet} | ${item.montant.toFixed(2).replace(".", ",")} €`;
    pdf.text(line.slice(0, 180), 10, y);
    y += 6;

    if (y > 280) {
      pdf.addPage();
      y = 12;
    }
  });

  y += 6;
  pdf.text(`Total : ${total.toFixed(2).replace(".", ",")} €`, 10, y);

  const filename = `scolaire_${new Date().toISOString().slice(0, 10)}.pdf`;

  const saved = savePdfToHistory(pdf, {
    mois: formatMonthLabel(mois),
    nom: filename,
    type: "Frais scolaires"
  });

  console.log("Historique scolaire :", saved);

  pdf.save(filename);
}

function bindScolaireEvents() {
  if (scolaireEventsBound) return;
  scolaireEventsBound = true;

  document.getElementById("btnAjouterScolaire").addEventListener("click", ajouterFraisScolaire);
  document.getElementById("btnResetScolaire").addEventListener("click", resetFormScolaire);
  document.getElementById("btnPdfScolaire").addEventListener("click", genererPDFScolaire);
  document.getElementById("btnViderScolaire").addEventListener("click", viderListeScolaire);
  document.getElementById("assistantNomScolaire").addEventListener("input", saveAssistantNomScolaire);
  document.getElementById("moisScolaire").addEventListener("change", saveMoisScolaire);

  document.getElementById("btnPhotoScolaire").addEventListener("click", () => {
    document.getElementById("justificatifScolaire").click();
  });

  document
    .getElementById("justificatifScolaire")
    .addEventListener("change", updateNomJustificatifScolaire);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initScolaireDB();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  fraisScolaires = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosScolaire();
  bindScolaireEvents();
  renderScolaire();
});