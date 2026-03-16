import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisParking = [];
let parkingDb = null;
let uid = null;

function getStorageKey() {
  return `fraisParkingMensuels_${uid}`;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  fraisParking = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosParking();
  bindParkingEvents();
  renderParking();
});

document.addEventListener("DOMContentLoaded", async () => {
  await initParkingDB();
});

function saveFraisParking() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisParking));
}

function chargerInfosParking() {
  const assistantNom =
    localStorage.getItem(`assistantNomParking_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const moisParking = localStorage.getItem(`moisParking_${uid}`);

  document.getElementById("assistantNomParking").value = assistantNom;

  if (moisParking) {
    document.getElementById("moisParking").value = moisParking;
  } else {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    document.getElementById("moisParking").value = `${year}-${month}`;
  }
}

function saveAssistantNomParking() {
  localStorage.setItem(
    `assistantNomParking_${uid}`,
    document.getElementById("assistantNomParking").value.trim()
  );
}

function saveMoisParking() {
  localStorage.setItem(
    `moisParking_${uid}`,
    document.getElementById("moisParking").value
  );
}

function bindParkingEvents() {
  document.getElementById("btnAjouterParking").addEventListener("click", ajouterFraisParking);
  document.getElementById("btnResetParking").addEventListener("click", resetFormParking);
  document.getElementById("btnPdfParking").addEventListener("click", genererPDFParking);
  document.getElementById("btnViderParking").addEventListener("click", viderListeParking);
  document.getElementById("assistantNomParking").addEventListener("input", saveAssistantNomParking);
  document.getElementById("moisParking").addEventListener("change", saveMoisParking);

  document.getElementById("btnPhotoParking").addEventListener("click", () => {
    document.getElementById("justificatifParking").click();
  });

  document.getElementById("justificatifParking").addEventListener("change", updateNomJustificatifParking);
}

function updateNomJustificatifParking() {
  const file = document.getElementById("justificatifParking").files[0];

  document.getElementById("nomJustificatifParking").textContent =
    file ? `Fichier sélectionné : ${file.name}` : "";
}

async function ajouterFraisParking() {

  const date = document.getElementById("dateParking").value;
  const enfant = document.getElementById("enfantParking").value.trim();
  const type = document.getElementById("typeParking").value;
  const lieu = document.getElementById("lieuParking").value.trim();
  const objet = document.getElementById("objetParking").value.trim();
  const montant = parseFloat(document.getElementById("montantParking").value);

  if (!date || !enfant || !type || !lieu || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  fraisParking.push({
    id: Date.now(),
    date,
    enfant,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2))
  });

  saveFraisParking();
  renderParking();
  resetFormParking();
}

function renderParking() {

  const body = document.getElementById("parkingBody");
  body.innerHTML = "";

  if (fraisParking.length === 0) {

    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;

    updateTotalsParking();
    return;
  }

  fraisParking.forEach((item) => {

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td><button class="table-action-btn btn-delete-parking" data-id="${item.id}">Supprimer</button></td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-parking").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisParking(Number(btn.dataset.id)));
  });

  updateTotalsParking();
}

function supprimerFraisParking(id) {

  fraisParking = fraisParking.filter((row) => row.id !== id);
  saveFraisParking();
  renderParking();
}

function viderListeParking() {

  if (fraisParking.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisParking = [];
  saveFraisParking();
  renderParking();
}

function updateTotalsParking() {

  const totalMontant = fraisParking.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalLignesParking").textContent = String(fraisParking.length);

  document.getElementById("totalMontantParking").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function resetFormParking() {

  document.getElementById("dateParking").value = "";
  document.getElementById("enfantParking").value = "";
  document.getElementById("typeParking").value = "";
  document.getElementById("lieuParking").value = "";
  document.getElementById("objetParking").value = "";
  document.getElementById("montantParking").value = "";
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}