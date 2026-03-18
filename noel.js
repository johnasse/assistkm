import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisNoel = [];
let uid = null;
let noelEventsBound = false;

function getStorageKey() {
  return `fraisNoelMensuels_${uid}`;
}

function initNoelDB() {
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

function getTotalNoel() {
  return fraisNoel.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function saveFraisNoel() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisNoel));
}

function chargerInfosNoel() {
  const assistantNom =
    localStorage.getItem(`assistantNomNoel_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const moisNoel = localStorage.getItem(`moisNoel_${uid}`);

  document.getElementById("assistantNomNoel").value = assistantNom;
  document.getElementById("moisNoel").value = moisNoel || getMonthDefaultValue();
}

function saveAssistantNomNoel() {
  localStorage.setItem(
    `assistantNomNoel_${uid}`,
    document.getElementById("assistantNomNoel").value.trim()
  );
}

function saveMoisNoel() {
  localStorage.setItem(
    `moisNoel_${uid}`,
    document.getElementById("moisNoel").value
  );
}

function updateNomJustificatifNoel() {
  const file = document.getElementById("justificatifNoel").files[0];
  document.getElementById("nomJustificatifNoel").textContent =
    file ? `Fichier sélectionné : ${file.name}` : "";
}

async function ajouterFraisNoel() {
  const date = document.getElementById("dateNoel").value;
  const enfant = document.getElementById("enfantNoel").value.trim();
  const type = document.getElementById("typeNoel").value;
  const magasin = document.getElementById("magasinNoel").value.trim();
  const objet = document.getElementById("objetNoel").value.trim();
  const montant = parseFloat(document.getElementById("montantNoel").value);

  if (!date || !enfant || !type || !magasin || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  fraisNoel.push({
    id: Date.now(),
    date,
    enfant,
    type,
    magasin,
    objet,
    montant: Number(montant.toFixed(2))
  });

  saveFraisNoel();
  renderNoel();
  resetFormNoel();
}

function renderNoel() {
  const body = document.getElementById("noelBody");
  body.innerHTML = "";

  if (fraisNoel.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    updateTotalsNoel();
    return;
  }

  fraisNoel.forEach((item) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.magasin)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>Aucun</td>
      <td>
        <button class="table-action-btn btn-delete-noel" data-id="${item.id}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-noel").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisNoel(Number(btn.dataset.id)));
  });

  updateTotalsNoel();
}

function supprimerFraisNoel(id) {
  fraisNoel = fraisNoel.filter((row) => row.id !== id);
  saveFraisNoel();
  renderNoel();
}

function viderListeNoel() {
  if (fraisNoel.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisNoel = [];
  saveFraisNoel();
  renderNoel();
}

function updateTotalsNoel() {
  const totalMontant = getTotalNoel();

  document.getElementById("totalLignesNoel").textContent = String(fraisNoel.length);
  document.getElementById("totalMontantNoel").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function resetFormNoel() {
  document.getElementById("dateNoel").value = "";
  document.getElementById("enfantNoel").value = "";
  document.getElementById("typeNoel").value = "";
  document.getElementById("magasinNoel").value = "";
  document.getElementById("objetNoel").value = "";
  document.getElementById("montantNoel").value = "";
  document.getElementById("justificatifNoel").value = "";
  document.getElementById("nomJustificatifNoel").textContent = "";
}

async function genererPDFNoel() {
  if (!fraisNoel.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const assistant = document.getElementById("assistantNomNoel").value.trim() || "-";
  const mois = document.getElementById("moisNoel").value || "";
  const total = getTotalNoel();

  let y = 12;

  pdf.setFontSize(14);
  pdf.text("Frais de Noël", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant familial : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  fraisNoel.forEach((item) => {
    const line = `${formatDateFr(item.date)} | ${item.enfant} | ${item.type} | ${item.magasin} | ${item.objet} | ${item.montant.toFixed(2).replace(".", ",")} €`;
    pdf.text(line.slice(0, 180), 10, y);
    y += 6;

    if (y > 280) {
      pdf.addPage();
      y = 12;
    }
  });

  y += 6;
  pdf.text(`Total : ${total.toFixed(2).replace(".", ",")} €`, 10, y);

  const filename = `noel_${new Date().toISOString().slice(0, 10)}.pdf`;

  const saved = savePdfToHistory(pdf, {
    mois: formatMonthLabel(mois),
    nom: filename,
    type: "Frais de Noël"
  });

  console.log("Historique noel :", saved);

  pdf.save(filename);
}

function bindNoelEvents() {
  if (noelEventsBound) return;
  noelEventsBound = true;

  document.getElementById("btnAjouterNoel").addEventListener("click", ajouterFraisNoel);
  document.getElementById("btnResetNoel").addEventListener("click", resetFormNoel);
  document.getElementById("btnPdfNoel").addEventListener("click", genererPDFNoel);
  document.getElementById("btnViderNoel").addEventListener("click", viderListeNoel);

  document.getElementById("assistantNomNoel").addEventListener("input", saveAssistantNomNoel);
  document.getElementById("moisNoel").addEventListener("change", saveMoisNoel);

  document.getElementById("btnPhotoNoel").addEventListener("click", () => {
    document.getElementById("justificatifNoel").click();
  });

  document.getElementById("justificatifNoel").addEventListener("change", updateNomJustificatifNoel);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initNoelDB();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  fraisNoel = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosNoel();
  bindNoelEvents();
  renderNoel();
});