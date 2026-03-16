import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisNoel = [];
let noelDb = null;
let uid = null;

function getStorageKey() {
  return `fraisNoelMensuels_${uid}`;
}

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

document.addEventListener("DOMContentLoaded", async () => {
  await initNoelDB();
});

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

  if (moisNoel) {
    document.getElementById("moisNoel").value = moisNoel;
  } else {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    document.getElementById("moisNoel").value = `${year}-${month}`;
  }
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

function bindNoelEvents() {

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
        <td colspan="7" class="empty-cell">Aucune dépense enregistrée</td>
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

  const totalMontant = fraisNoel.reduce((sum, item) => sum + item.montant, 0);

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