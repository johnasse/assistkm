import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";

let fraisFormation = JSON.parse(localStorage.getItem("fraisFormationMensuels") || "[]");
let formationDb = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initFormationDB();
  chargerInfosFormation();
  bindFormationEvents();
  renderFormation();
});

function bindFormationEvents() {
  document.getElementById("btnAjouterFormation").addEventListener("click", ajouterFraisFormation);
  document.getElementById("btnResetFormation").addEventListener("click", resetFormFormation);
  document.getElementById("btnPdfFormation").addEventListener("click", genererPDFFormation);
  document.getElementById("btnViderFormation").addEventListener("click", viderListeFormation);
  document.getElementById("assistantNomFormation").addEventListener("input", saveAssistantNomFormation);
  document.getElementById("moisFormation").addEventListener("change", saveMoisFormation);

  document.getElementById("btnPhotoFormation").addEventListener("click", () => {
    document.getElementById("justificatifFormation").click();
  });

  document.getElementById("justificatifFormation").addEventListener("change", updateNomJustificatifFormation);
}

function chargerInfosFormation() {
  const assistantNom =
    localStorage.getItem("assistantNomFormation") ||
    localStorage.getItem("assistantNom") ||
    "";
  const moisFormation = localStorage.getItem("moisFormation");

  document.getElementById("assistantNomFormation").value = assistantNom;

  if (moisFormation) {
    document.getElementById("moisFormation").value = moisFormation;
  } else {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    document.getElementById("moisFormation").value = `${year}-${month}`;
  }
}

function saveAssistantNomFormation() {
  localStorage.setItem(
    "assistantNomFormation",
    document.getElementById("assistantNomFormation").value.trim()
  );
}

function saveMoisFormation() {
  localStorage.setItem("moisFormation", document.getElementById("moisFormation").value);
}

function updateNomJustificatifFormation() {
  const file = document.getElementById("justificatifFormation").files[0];
  document.getElementById("nomJustificatifFormation").textContent = file
    ? `Fichier sélectionné : ${file.name}`
    : "";
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
    justificatifId = `justif-formation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    justificatifNom = justificatifFile.name;
    justificatifType = justificatifFile.type || "";

    await saveFileToFormationDB({
      id: justificatifId,
      name: justificatifNom,
      type: justificatifType,
      file: justificatifFile,
      createdAt: new Date().toISOString(),
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
    justificatifType,
  });

  saveFraisFormation();
  renderFormation();
  resetFormFormation();
  showToastFormation("Dépense ajoutée");
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

    const justificatifHtml = item.justificatifId
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span>${escapeHtml(item.justificatifNom || "Justificatif")}</span>
          <button class="table-action-btn btn-view-formation" data-justif-id="${item.justificatifId}" style="background:#2563eb;">Voir</button>
          <button class="table-action-btn btn-download-formation" data-justif-id="${item.justificatifId}" style="background:#16a34a;">Télécharger</button>
        </div>
      `
      : `<span style="color:#6b7280;">Aucun</span>`;

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.organisme)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${justificatifHtml}</td>
      <td><button class="table-action-btn btn-delete-formation" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-formation").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisFormation(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btn-view-formation").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await voirJustificatifFormation(btn.dataset.justifId);
    });
  });

  document.querySelectorAll(".btn-download-formation").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await telechargerJustificatifFormation(btn.dataset.justifId);
    });
  });

  updateTotalsFormation();
}

async function supprimerFraisFormation(id) {
  const item = fraisFormation.find((row) => row.id === id);
  if (item?.justificatifId) {
    await deleteFileFromFormationDB(item.justificatifId);
  }

  fraisFormation = fraisFormation.filter((row) => row.id !== id);
  saveFraisFormation();
  renderFormation();
  showToastFormation("Dépense supprimée");
}

async function viderListeFormation() {
  if (fraisFormation.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  for (const item of fraisFormation) {
    if (item.justificatifId) {
      await deleteFileFromFormationDB(item.justificatifId);
    }
  }

  fraisFormation = [];
  saveFraisFormation();
  renderFormation();
  showToastFormation("Liste vidée");
}

function updateTotalsFormation() {
  const totalMontant = fraisFormation.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalLignesFormation").textContent = String(fraisFormation.length);
  document.getElementById("totalMontantFormation").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function saveFraisFormation() {
  localStorage.setItem("fraisFormationMensuels", JSON.stringify(fraisFormation));
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
  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (fraisFormation.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const mois = document.getElementById("moisFormation").value;
  const assistantNom = document.getElementById("assistantNomFormation").value.trim() || "-";
  const totalMontant = fraisFormation.reduce((sum, item) => sum + item.montant, 0);

  const margin = 10;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`ETAT DE FRAIS DE FORMATION DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { title: "Date", width: 20, align: "center" },
    { title: "Type", width: 26, align: "left" },
    { title: "Organisme / lieu", width: 42, align: "left" },
    { title: "Lieu", width: 30, align: "left" },
    { title: "Objet", width: 82, align: "left" },
    { title: "Montant", width: 22, align: "right" },
    { title: "Justificatif", width: 45, align: "left" },
  ];

  const headerHeight = 9;
  const lineHeight = 4.5;

  function drawHeader() {
    let x = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);

    cols.forEach((col) => {
      doc.rect(x, y, col.width, headerHeight);
      drawCellText(doc, col.title, x, y, col.width, headerHeight, "center");
      x += col.width;
    });

    y += headerHeight;
  }

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  fraisFormation.forEach((item) => {
    const rowValues = [
      formatDateFr(item.date),
      safeText(item.type),
      safeText(item.organisme),
      safeText(item.lieu),
      safeText(item.objet),
      item.montant.toFixed(2).replace(".", ",") + " €",
      item.justificatifNom ? safeText(item.justificatifNom) : "Aucun",
    ];

    const rowLines = rowValues.map((value, i) => {
      if (i === 0 || i === 5) return [String(value)];
      return doc.splitTextToSize(String(value), cols[i].width - 3);
    });

    const maxLines = Math.max(...rowLines.map((lines) => lines.length));
    const rowHeight = Math.max(8, maxLines * lineHeight + 2);

    if (y + rowHeight > 175) {
      doc.addPage("landscape", "a4");
      y = 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`ETAT DE FRAIS DE FORMATION DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

      y += 8;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    let x = margin;
    rowValues.forEach((value, i) => {
      doc.rect(x, y, cols[i].width, rowHeight);
      drawCellText(doc, rowLines[i], x, y, cols[i].width, rowHeight, cols[i].align);
      x += cols[i].width;
    });

    y += rowHeight;
  });

  y += 10;

  if (y > 178) {
    doc.addPage("landscape", "a4");
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(`Total du mois : ${totalMontant.toFixed(2).replace(".", ",")} €`, margin, y);

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Certifié exact le : ____________________", margin, y);

  y += 10;
  doc.text("Signature assistant familial : ____________________", margin, y);

  const fileName = `etat-frais-formation-${mois || "sans-mois"}.pdf`;

  savePdfToHistory(doc, {
    type: "Frais formation",
    nom: fileName,
    mois: formatMonthLabel(mois),
  });

  doc.save(fileName);
  showToastFormation("PDF généré et enregistré");
}

function drawCellText(doc, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  const fontSize = doc.getFontSize();
  const lineGap = fontSize * 0.35;
  const totalTextHeight = lines.length * lineGap;
  let currentY = y + (height - totalTextHeight) / 2 + 2.2;

  lines.forEach((line) => {
    let textX = x + 1.5;

    if (align === "center") {
      textX = x + width / 2;
      doc.text(line, textX, currentY, { align: "center" });
    } else if (align === "right") {
      textX = x + width - 1.5;
      doc.text(line, textX, currentY, { align: "right" });
    } else {
      doc.text(line, textX, currentY);
    }

    currentY += lineGap;
  });
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatMonthFr(monthStr) {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  return `${months[Number(month) - 1]} ${year}`;
}

function safeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function showToastFormation(message) {
  const toast = document.getElementById("toastFormation");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* INDEXEDDB */

function initFormationDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestionFraisDB", 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("justificatifs")) {
        db.createObjectStore("justificatifs", { keyPath: "id" });
      }
    };

    request.onsuccess = function () {
      formationDb = request.result;
      resolve(formationDb);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function saveFileToFormationDB(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = formationDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.put(fileRecord);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function getFileFromFormationDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = formationDb.transaction(["justificatifs"], "readonly");
    const store = transaction.objectStore("justificatifs");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteFileFromFormationDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = formationDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function voirJustificatifFormation(justificatifId) {
  const record = await getFileFromFormationDB(justificatifId);

  if (!record || !record.file) {
    alert("Justificatif introuvable.");
    return;
  }

  const url = URL.createObjectURL(record.file);
  window.open(url, "_blank");

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}

async function telechargerJustificatifFormation(justificatifId) {
  const record = await getFileFromFormationDB(justificatifId);

  if (!record || !record.file) {
    alert("Justificatif introuvable.");
    return;
  }

  const url = URL.createObjectURL(record.file);
  const link = document.createElement("a");
  link.href = url;
  link.download = record.name || "justificatif";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60000);
}