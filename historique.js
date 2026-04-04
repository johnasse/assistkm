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

function canDownload(pdf) {
  return !!pdf?.downloadURL || !!pdf?.data;
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
    const downloadable = canDownload(pdf);

    tr.innerHTML = `
      <td class="checkbox-cell">
        ${downloadable ? `<input type="checkbox" class="pdfCheck" data-id="${pdf.id}">` : ""}
      </td>
      <td>${escapeHtml(pdf.mois || "-")}</td>
      <td>${escapeHtml(pdf.type || "-")}</td>
      <td>${escapeHtml(pdf.nom || "-")}</td>
      <td>${escapeHtml(pdf.dateGeneration || "-")}</td>
      <td>
        ${
          downloadable
            ? `<button class="btn btn-primary btn-download" data-id="${pdf.id}">Télécharger</button>`
            : `<button class="btn btn-secondary" type="button" disabled>Indisponible</button>`
        }
        <button class="table-action-btn btn-delete" data-id="${pdf.id}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-download").forEach((btn) => {
    btn.addEventListener("click", () => telechargerPdf(btn.dataset.id));
  });

  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => supprimerPdf(btn.dataset.id));
  });

  $("nbResultatsHistorique").textContent = String(historique.length);
}

function telechargerPdf(id) {
  const pdf = historique.find((p) => String(p.id) === String(id));
  if (!pdf) return;

  if (pdf.downloadURL) {
    window.open(pdf.downloadURL, "_blank");
    return;
  }

  if (pdf.data) {
    const link = document.createElement("a");
    link.href = pdf.data;
    link.download = pdf.nom || "document.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return;
  }

  alert("Ce PDF n'est pas disponible en téléchargement.");
}

async function supprimerPdf(id) {
  const pdf = historique.find((p) => String(p.id) === String(id));
  if (!pdf) return;

  if (!confirm(`Supprimer "${pdf.nom || "ce PDF"}" ?`)) return;

  try {
    if (pdf.storagePath) {
      const storageRef = ref(storage, pdf.storagePath);
      await deleteObject(storageRef);
    }
  } catch (e) {
    console.log("Erreur suppression Storage", e);
  }

  historique = historique.filter((p) => String(p.id) !== String(id));
  saveHistorique();
  renderHistorique();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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