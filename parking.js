import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";

let fraisParking = JSON.parse(localStorage.getItem("fraisParkingMensuels") || "[]");
let parkingDb = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initParkingDB();
  chargerInfosParking();
  bindParkingEvents();
  renderParking();
});

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

function chargerInfosParking() {
  const assistantNom =
    localStorage.getItem("assistantNomParking") ||
    localStorage.getItem("assistantNom") ||
    "";
  const moisParking = localStorage.getItem("moisParking");

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
    "assistantNomParking",
    document.getElementById("assistantNomParking").value.trim()
  );
}

function saveMoisParking() {
  localStorage.setItem("moisParking", document.getElementById("moisParking").value);
}

function updateNomJustificatifParking() {
  const file = document.getElementById("justificatifParking").files[0];
  document.getElementById("nomJustificatifParking").textContent = file
    ? `Fichier sélectionné : ${file.name}`
    : "";
}

async function ajouterFraisParking() {
  const date = document.getElementById("dateParking").value;
  const enfant = document.getElementById("enfantParking").value.trim();
  const type = document.getElementById("typeParking").value;
  const lieu = document.getElementById("lieuParking").value.trim();
  const objet = document.getElementById("objetParking").value.trim();
  const montant = parseFloat(document.getElementById("montantParking").value);
  const justificatifFile = document.getElementById("justificatifParking").files[0] || null;

  if (!date || !enfant || !type || !lieu || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatifId = null;
  let justificatifNom = "";
  let justificatifType = "";

  if (justificatifFile) {
    justificatifId = `justif-parking-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    justificatifNom = justificatifFile.name;
    justificatifType = justificatifFile.type || "";

    await saveFileToParkingDB({
      id: justificatifId,
      name: justificatifNom,
      type: justificatifType,
      file: justificatifFile,
      createdAt: new Date().toISOString(),
    });
  }

  fraisParking.push({
    id: Date.now(),
    date,
    enfant,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatifId,
    justificatifNom,
    justificatifType,
  });

  saveFraisParking();
  renderParking();
  resetFormParking();
  showToastParking("Dépense ajoutée");
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

    const justificatifHtml = item.justificatifId
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span>${escapeHtml(item.justificatifNom || "Justificatif")}</span>
          <button class="table-action-btn btn-view-parking" data-justif-id="${item.justificatifId}" style="background:#2563eb;">Voir</button>
          <button class="table-action-btn btn-download-parking" data-justif-id="${item.justificatifId}" style="background:#16a34a;">Télécharger</button>
        </div>
      `
      : `<span style="color:#6b7280;">Aucun</span>`;

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${justificatifHtml}</td>
      <td><button class="table-action-btn btn-delete-parking" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-parking").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisParking(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btn-view-parking").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await voirJustificatifParking(btn.dataset.justifId);
    });
  });

  document.querySelectorAll(".btn-download-parking").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await telechargerJustificatifParking(btn.dataset.justifId);
    });
  });

  updateTotalsParking();
}

async function supprimerFraisParking(id) {
  const item = fraisParking.find((row) => row.id === id);
  if (item?.justificatifId) {
    await deleteFileFromParkingDB(item.justificatifId);
  }

  fraisParking = fraisParking.filter((row) => row.id !== id);
  saveFraisParking();
  renderParking();
  showToastParking("Dépense supprimée");
}

async function viderListeParking() {
  if (fraisParking.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  for (const item of fraisParking) {
    if (item.justificatifId) {
      await deleteFileFromParkingDB(item.justificatifId);
    }
  }

  fraisParking = [];
  saveFraisParking();
  renderParking();
  showToastParking("Liste vidée");
}

function updateTotalsParking() {
  const totalMontant = fraisParking.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalLignesParking").textContent = String(fraisParking.length);
  document.getElementById("totalMontantParking").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function saveFraisParking() {
  localStorage.setItem("fraisParkingMensuels", JSON.stringify(fraisParking));
}

function resetFormParking() {
  document.getElementById("dateParking").value = "";
  document.getElementById("enfantParking").value = "";
  document.getElementById("typeParking").value = "";
  document.getElementById("lieuParking").value = "";
  document.getElementById("objetParking").value = "";
  document.getElementById("montantParking").value = "";
  document.getElementById("justificatifParking").value = "";
  document.getElementById("nomJustificatifParking").textContent = "";
}

async function genererPDFParking() {
  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (fraisParking.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const mois = document.getElementById("moisParking").value;
  const assistantNom = document.getElementById("assistantNomParking").value.trim() || "-";
  const totalMontant = fraisParking.reduce((sum, item) => sum + item.montant, 0);

  const margin = 10;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`ETAT DE FRAIS DE PARKING DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { title: "Date", width: 20, align: "center" },
    { title: "Enfant", width: 28, align: "left" },
    { title: "Type", width: 28, align: "left" },
    { title: "Lieu", width: 42, align: "left" },
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

  fraisParking.forEach((item) => {
    const rowValues = [
      formatDateFr(item.date),
      safeText(item.enfant),
      safeText(item.type),
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
      doc.text(`ETAT DE FRAIS DE PARKING DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

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

  const fileName = `etat-frais-parking-${mois || "sans-mois"}.pdf`;

  savePdfToHistory(doc, {
    type: "Frais de parking",
    nom: fileName,
    mois: formatMonthLabel(mois),
  });

  doc.save(fileName);
  showToastParking("PDF généré et enregistré");
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

function showToastParking(message) {
  const toast = document.getElementById("toastParking");
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

function initParkingDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestionFraisDB", 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("justificatifs")) {
        db.createObjectStore("justificatifs", { keyPath: "id" });
      }
    };

    request.onsuccess = function () {
      parkingDb = request.result;
      resolve(parkingDb);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function saveFileToParkingDB(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = parkingDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.put(fileRecord);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function getFileFromParkingDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = parkingDb.transaction(["justificatifs"], "readonly");
    const store = transaction.objectStore("justificatifs");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteFileFromParkingDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = parkingDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function voirJustificatifParking(justificatifId) {
  const record = await getFileFromParkingDB(justificatifId);

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

async function telechargerJustificatifParking(justificatifId) {
  const record = await getFileFromParkingDB(justificatifId);

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