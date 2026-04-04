import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getStorage, ref, deleteObject } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

const storage = getStorage();

let currentUser = null;
let historique = [];

const $ = (id) => document.getElementById(id);

function loadHistorique() {
  const storageKey = `historiquePDF_${currentUser.uid}`;
  historique = JSON.parse(localStorage.getItem(storageKey) || "[]");
}

function saveHistorique() {
  const storageKey = `historiquePDF_${currentUser.uid}`;
  localStorage.setItem(storageKey, JSON.stringify(historique));
}

function renderHistorique() {
  const body = $("historiqueBody");
  body.innerHTML = "";

  if (!historique.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucun PDF</td></tr>`;
    $("nbResultatsHistorique").textContent = "0";
    return;
  }

  historique.forEach((pdf) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="checkbox-cell">
        <input type="checkbox" class="pdfCheck" data-id="${pdf.id}">
      </td>
      <td>${pdf.mois}</td>
      <td>${pdf.type}</td>
      <td>${pdf.nom}</td>
      <td>${pdf.dateGeneration}</td>
      <td>
        <button class="btn btn-primary btn-download" data-url="${pdf.downloadURL}">
          Télécharger
        </button>
        <button class="table-action-btn btn-delete" data-id="${pdf.id}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-download").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.open(btn.dataset.url, "_blank");
    });
  });

  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => supprimerPdf(btn.dataset.id));
  });

  $("nbResultatsHistorique").textContent = historique.length;
}

async function supprimerPdf(id) {
  const pdf = historique.find((p) => p.id == id);
  if (!pdf) return;

  if (!confirm("Supprimer ce PDF ?")) return;

  try {
    const storageRef = ref(storage, pdf.storagePath);
    await deleteObject(storageRef);
  } catch (e) {
    console.log("Erreur suppression Storage", e);
  }

  historique = historique.filter((p) => p.id != id);
  saveHistorique();
  renderHistorique();
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUser = user;
  loadHistorique();
  renderHistorique();
});