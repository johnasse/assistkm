import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";

let fraisNoel = JSON.parse(localStorage.getItem("fraisNoelMensuels") || "[]");
let noelDb = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initNoelDB();
  chargerInfosNoel();
  bindNoelEvents();
  renderNoel();
});

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

function chargerInfosNoel() {
  const assistantNom =
    localStorage.getItem("assistantNomNoel") ||
    localStorage.getItem("assistantNom") ||
    "";
  const moisNoel = localStorage.getItem("moisNoel");

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
    "assistantNomNoel",
    document.getElementById("assistantNomNoel").value.trim()
  );
}

function saveMoisNoel() {
  localStorage.setItem("moisNoel", document.getElementById("moisNoel").value);
}

function updateNomJustificatifNoel() {
  const file = document.getElementById("justificatifNoel").files[0];
  document.getElementById("nomJustificatifNoel").textContent = file
    ? `Fichier sélectionné : ${file.name}`
    : "";
}

async function ajouterFraisNoel() {
  const date = document.getElementById("dateNoel").value;
  const enfant = document.getElementById("enfantNoel").value.trim();
  const type = document.getElementById("typeNoel").value;
  const magasin = document.getElementById("magasinNoel").value.trim();
  const objet = document.getElementById("objetNoel").value.trim();
  const montant = parseFloat(document.getElementById("montantNoel").value);
  const justificatifFile = document.getElementById("justificatifNoel").files[0] || null;

  if (!date || !enfant || !type || !magasin || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatifId = null;
  let justificatifNom = "";
  let justificatifType = "";

  if (justificatifFile) {
    justificatifId = `justif-noel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    justificatifNom = justificatifFile.name;
    justificatifType = justificatifFile.type || "";

    await saveFileToNoelDB({
      id: justificatifId,
      name: justificatifNom,
      type: justificatifType,
      file: justificatifFile,
      createdAt: new Date().toISOString(),
    });
  }

  fraisNoel.push({
    id: Date.now(),
    date,
    enfant,
    type,
    magasin,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatifId,
    justificatifNom,
    justificatifType,
  });

  saveFraisNoel();
  renderNoel();
  resetFormNoel();
  showToastNoel("Dépense ajoutée");
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

    const justificatifHtml = item.justificatifId
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span>${escapeHtml(item.justificatifNom || "Justificatif")}</span>
          <button class="table-action-btn btn-view-noel" data-justif-id="${item.justificatifId}" style="background:#2563eb;">Voir</button>
          <button class="table-action-btn btn-download-noel" data-justif-id="${item.justificatifId}" style="background:#16a34a;">Télécharger</button>
        </div>
      `
      : `<span style="color:#6b7280;">Aucun</span>`;

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.magasin)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${justificatifHtml}</td>
      <td><button class="table-action-btn btn-delete-noel" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-noel").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisNoel(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btn-view-noel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await voirJustificatifNoel(btn.dataset.justifId);
    });
  });

  document.querySelectorAll(".btn-download-noel").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await telechargerJustificatifNoel(btn.dataset.justifId);
    });
  });

  updateTotalsNoel();
}

async function supprimerFraisNoel(id) {
  const item = fraisNoel.find((row) => row.id === id);
  if (item?.justificatifId) {
    await deleteFileFromNoelDB(item.justificatifId);
  }

  fraisNoel = fraisNoel.filter((row) => row.id !== id);
  saveFraisNoel();
  renderNoel();
  showToastNoel("Dépense supprimée");
}

async function viderListeNoel() {
  if (fraisNoel.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  for (const item of fraisNoel) {
    if (item.justificatifId) {
      await deleteFileFromNoelDB(item.justificatifId);
    }
  }

  fraisNoel = [];
  saveFraisNoel();
  renderNoel();
  showToastNoel("Liste vidée");
}

function updateTotalsNoel() {
  const totalMontant = fraisNoel.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalLignesNoel").textContent = String(fraisNoel.length);
  document.getElementById("totalMontantNoel").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function saveFraisNoel() {
  localStorage.setItem("fraisNoelMensuels", JSON.stringify(fraisNoel));
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
  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (fraisNoel.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const mois = document.getElementById("moisNoel").value;
  const assistantNom = document.getElementById("assistantNomNoel").value.trim() || "-";
  const totalMontant = fraisNoel.reduce((sum, item) => sum + item.montant, 0);

  const margin = 10;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`ETAT DE FRAIS DE NOEL DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { title: "Date", width: 20, align: "center" },
    { title: "Enfant", width: 28, align: "left" },
    { title: "Type", width: 28, align: "left" },
    { title: "Magasin / lieu", width: 42, align: "left" },
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

  fraisNoel.forEach((item) => {
    const rowValues = [
      formatDateFr(item.date),
      safeText(item.enfant),
      safeText(item.type),
      safeText(item.magasin),
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
      doc.text(`ETAT DE FRAIS DE NOEL DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

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

  const fileName = `etat-frais-noel-${mois || "sans-mois"}.pdf`;

  savePdfToHistory(doc, {
    type: "Frais de Noël",
    nom: fileName,
    mois: formatMonthLabel(mois),
  });

  doc.save(fileName);
  showToastNoel("PDF généré et enregistré");
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

function showToastNoel(message) {
  const toast = document.getElementById("toastNoel");
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

/* =========================
   INDEXED DB JUSTIFICATIFS
========================= */

function initNoelDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestionFraisDB", 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("justificatifs")) {
        db.createObjectStore("justificatifs", { keyPath: "id" });
      }
    };

    request.onsuccess = function () {
      noelDb = request.result;
      resolve(noelDb);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function saveFileToNoelDB(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = noelDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.put(fileRecord);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function getFileFromNoelDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = noelDb.transaction(["justificatifs"], "readonly");
    const store = transaction.objectStore("justificatifs");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteFileFromNoelDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = noelDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function voirJustificatifNoel(justificatifId) {
  const record = await getFileFromNoelDB(justificatifId);

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

async function telechargerJustificatifNoel(justificatifId) {
  const record = await getFileFromNoelDB(justificatifId);

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