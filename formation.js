import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisFormation = [];
let uid = null;
let formationEventsBound = false;

function getStorageKey() {
  return `fraisFormationMensuels_${uid}`;
}

function getFilesKey() {
  return `fraisFormationFiles_${uid}`;
}

function initFormationDB() {
  return true;
}

function getStoredFormationFiles() {
  try {
    return JSON.parse(localStorage.getItem(getFilesKey()) || "{}");
  } catch (error) {
    console.error("Erreur chargement fichiers formation :", error);
    return {};
  }
}

function saveStoredFormationFiles(filesMap) {
  localStorage.setItem(getFilesKey(), JSON.stringify(filesMap));
}

async function saveFileToFormationDB(fileData) {
  if (!fileData?.id || !fileData?.file) return;

  const filesMap = getStoredFormationFiles();

  const encoded = await fileToBase64(fileData.file);

  filesMap[fileData.id] = {
    id: fileData.id,
    name: fileData.name || fileData.file.name || "justificatif",
    type: fileData.type || fileData.file.type || "",
    data: encoded,
    createdAt: fileData.createdAt || new Date().toISOString()
  };

  saveStoredFormationFiles(filesMap);
}

function getFileFromFormationDB(fileId) {
  if (!fileId) return null;
  const filesMap = getStoredFormationFiles();
  return filesMap[fileId] || null;
}

function deleteFileFromFormationDB(fileId) {
  if (!fileId) return;
  const filesMap = getStoredFormationFiles();
  delete filesMap[fileId];
  saveStoredFormationFiles(filesMap);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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

function getTotalFormation() {
  return fraisFormation.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function saveFraisFormation() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisFormation));
}

function chargerInfosFormation() {
  const assistantNom =
    localStorage.getItem(`assistantNomFormation_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const moisFormation = localStorage.getItem(`moisFormation_${uid}`);

  document.getElementById("assistantNomFormation").value = assistantNom;
  document.getElementById("moisFormation").value = moisFormation || getMonthDefaultValue();
}

function saveAssistantNomFormation() {
  localStorage.setItem(
    `assistantNomFormation_${uid}`,
    document.getElementById("assistantNomFormation").value.trim()
  );
}

function saveMoisFormation() {
  localStorage.setItem(
    `moisFormation_${uid}`,
    document.getElementById("moisFormation").value
  );
}

function updateNomJustificatifFormation() {
  const file = document.getElementById("justificatifFormation").files[0];
  document.getElementById("nomJustificatifFormation").textContent =
    file ? `Fichier sélectionné : ${file.name}` : "";
}

async function ajouterFraisFormation() {
  const date = document.getElementById("dateFormation").value;
  const organisme = document.getElementById("organismeFormation").value.trim();
  const type = document.getElementById("typeFormation").value;
  const lieu = document.getElementById("lieuFormation").value.trim();
  const objet = document.getElementById("objetFormation").value.trim();
  const montant = parseFloat(document.getElementById("montantFormation").value);
  const justificatifFile = document.getElementById("justificatifFormation").files[0] || null;

  if (!date || !organisme || !type || !lieu || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatifId = null;
  let justificatifNom = "";
  let justificatifType = "";

  if (justificatifFile) {
    justificatifId = `justif-formation-${uid}-${Date.now()}`;
    justificatifNom = justificatifFile.name;
    justificatifType = justificatifFile.type || "";

    await saveFileToFormationDB({
      id: justificatifId,
      name: justificatifNom,
      type: justificatifType,
      file: justificatifFile,
      createdAt: new Date().toISOString()
    });
  }

  fraisFormation.push({
    id: Date.now(),
    date,
    organisme,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatifId,
    justificatifNom,
    justificatifType
  });

  saveFraisFormation();
  renderFormation();
  resetFormFormation();
}

function telechargerJustificatifFormation(fileId) {
  const file = getFileFromFormationDB(fileId);
  if (!file?.data) {
    alert("Justificatif introuvable.");
    return;
  }

  const link = document.createElement("a");
  link.href = file.data;
  link.download = file.name || "justificatif";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function renderFormation() {
  const body = document.getElementById("formationBody");
  body.innerHTML = "";

  if (fraisFormation.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    updateTotalsFormation();
    return;
  }

  fraisFormation.forEach((item) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.organisme)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>
        ${
          item.justificatifId
            ? `<button class="table-action-btn btn-file-formation" data-file-id="${item.justificatifId}">Voir</button>`
            : "Aucun"
        }
      </td>
      <td>
        <button class="table-action-btn btn-delete-formation" data-id="${item.id}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-formation").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisFormation(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btn-file-formation").forEach((btn) => {
    btn.addEventListener("click", () => telechargerJustificatifFormation(btn.dataset.fileId));
  });

  updateTotalsFormation();
}

function supprimerFraisFormation(id) {
  const item = fraisFormation.find((row) => row.id === id);
  if (item?.justificatifId) {
    deleteFileFromFormationDB(item.justificatifId);
  }

  fraisFormation = fraisFormation.filter((row) => row.id !== id);
  saveFraisFormation();
  renderFormation();
}

function viderListeFormation() {
  if (fraisFormation.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisFormation.forEach((item) => {
    if (item.justificatifId) deleteFileFromFormationDB(item.justificatifId);
  });

  fraisFormation = [];
  saveFraisFormation();
  renderFormation();
}

function updateTotalsFormation() {
  const totalMontant = getTotalFormation();

  document.getElementById("totalLignesFormation").textContent = String(fraisFormation.length);
  document.getElementById("totalMontantFormation").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function resetFormFormation() {
  document.getElementById("dateFormation").value = "";
  document.getElementById("organismeFormation").value = "";
  document.getElementById("typeFormation").value = "";
  document.getElementById("lieuFormation").value = "";
  document.getElementById("objetFormation").value = "";
  document.getElementById("montantFormation").value = "";
  document.getElementById("justificatifFormation").value = "";
  document.getElementById("nomJustificatifFormation").textContent = "";
}

async function genererPDFFormation() {
  if (!fraisFormation.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const assistant = document.getElementById("assistantNomFormation").value.trim() || "-";
  const mois = document.getElementById("moisFormation").value || "";
  const total = getTotalFormation();

  let y = 12;

  pdf.setFontSize(14);
  pdf.text("Frais de formation", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant familial : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  fraisFormation.forEach((item) => {
    const line = `${formatDateFr(item.date)} | ${item.type} | ${item.organisme} | ${item.lieu} | ${item.objet} | ${item.montant.toFixed(2).replace(".", ",")} €`;
    pdf.text(line.slice(0, 180), 10, y);
    y += 6;

    if (y > 280) {
      pdf.addPage();
      y = 12;
    }
  });

  y += 6;
  pdf.text(`Total : ${total.toFixed(2).replace(".", ",")} €`, 10, y);

  const filename = `formation_${new Date().toISOString().slice(0, 10)}.pdf`;

  const saved = savePdfToHistory(pdf, {
    mois: formatMonthLabel(mois),
    nom: filename,
    type: "Formation"
  });

  console.log("Historique formation :", saved);

  pdf.save(filename);
}

function bindFormationEvents() {
  if (formationEventsBound) return;
  formationEventsBound = true;

  document.getElementById("btnAjouterFormation").addEventListener("click", ajouterFraisFormation);
  document.getElementById("btnResetFormation").addEventListener("click", resetFormFormation);
  document.getElementById("btnPdfFormation").addEventListener("click", genererPDFFormation);
  document.getElementById("btnViderFormation").addEventListener("click", viderListeFormation);
  document.getElementById("assistantNomFormation").addEventListener("input", saveAssistantNomFormation);
  document.getElementById("moisFormation").addEventListener("change", saveMoisFormation);

  document.getElementById("btnPhotoFormation").addEventListener("click", () => {
    document.getElementById("justificatifFormation").click();
  });

  document
    .getElementById("justificatifFormation")
    .addEventListener("change", updateNomJustificatifFormation);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initFormationDB();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  fraisFormation = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosFormation();
  bindFormationEvents();
  renderFormation();
});