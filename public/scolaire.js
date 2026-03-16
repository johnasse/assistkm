import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";

let fraisScolaires = JSON.parse(localStorage.getItem("fraisScolairesMensuels") || "[]");
let scolaireDb = null;

document.addEventListener("DOMContentLoaded", async () => {
  await initScolaireDB();
  chargerInfosScolaire();
  bindScolaireEvents();
  renderScolaire();
});

function bindScolaireEvents() {
  document.getElementById("btnAjouterScolaire").addEventListener("click", ajouterFraisScolaire);
  document.getElementById("btnResetScolaire").addEventListener("click", resetFormScolaire);
  document.getElementById("btnPdfScolaire").addEventListener("click", genererPDFScolaire);
  document.getElementById("btnViderScolaire").addEventListener("click", viderListeScolaire);
  document.getElementById("assistantNomScolaire").addEventListener("input", saveAssistantNomScolaire);
  document.getElementById("moisScolaire").addEventListener("change", saveMoisScolaire);

  document.getElementById("btnPhotoScolaire").addEventListener("click", () => {
    document.getElementById("justificatifScolaire").click();
  });

  document.getElementById("justificatifScolaire").addEventListener("change", updateNomJustificatifScolaire);
}

function chargerInfosScolaire() {
  const assistantNom =
    localStorage.getItem("assistantNomScolaire") ||
    localStorage.getItem("assistantNom") ||
    "";
  const moisScolaire = localStorage.getItem("moisScolaire");

  document.getElementById("assistantNomScolaire").value = assistantNom;

  if (moisScolaire) {
    document.getElementById("moisScolaire").value = moisScolaire;
  } else {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    document.getElementById("moisScolaire").value = `${year}-${month}`;
  }
}

function saveAssistantNomScolaire() {
  localStorage.setItem(
    "assistantNomScolaire",
    document.getElementById("assistantNomScolaire").value.trim()
  );
}

function saveMoisScolaire() {
  localStorage.setItem("moisScolaire", document.getElementById("moisScolaire").value);
}

function updateNomJustificatifScolaire() {
  const file = document.getElementById("justificatifScolaire").files[0];
  document.getElementById("nomJustificatifScolaire").textContent = file
    ? `Fichier sélectionné : ${file.name}`
    : "";
}

async function ajouterFraisScolaire() {
  const date = document.getElementById("dateScolaire").value;
  const enfant = document.getElementById("enfantScolaire").value.trim();
  const type = document.getElementById("typeScolaire").value;
  const ecole = document.getElementById("ecoleScolaire").value.trim();
  const objet = document.getElementById("objetScolaire").value.trim();
  const montant = parseFloat(document.getElementById("montantScolaire").value);
  const justificatifFile = document.getElementById("justificatifScolaire").files[0] || null;

  if (!date || !enfant || !type || !ecole || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatifId = null;
  let justificatifNom = "";
  let justificatifType = "";

  if (justificatifFile) {
    justificatifId = `justif-scolaire-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    justificatifNom = justificatifFile.name;
    justificatifType = justificatifFile.type || "";

    await saveFileToScolaireDB({
      id: justificatifId,
      name: justificatifNom,
      type: justificatifType,
      file: justificatifFile,
      createdAt: new Date().toISOString(),
    });
  }

  fraisScolaires.push({
    id: Date.now(),
    date,
    enfant,
    type,
    ecole,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatifId,
    justificatifNom,
    justificatifType,
  });

  saveFraisScolaires();
  renderScolaire();
  resetFormScolaire();
  showToastScolaire("Dépense ajoutée");
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

    const justificatifHtml = item.justificatifId
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span>${escapeHtml(item.justificatifNom || "Justificatif")}</span>
          <button class="table-action-btn btn-view-scolaire" data-justif-id="${item.justificatifId}" style="background:#2563eb;">Voir</button>
          <button class="table-action-btn btn-download-scolaire" data-justif-id="${item.justificatifId}" style="background:#16a34a;">Télécharger</button>
        </div>
      `
      : `<span style="color:#6b7280;">Aucun</span>`;

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.ecole)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${justificatifHtml}</td>
      <td><button class="table-action-btn btn-delete-scolaire" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-scolaire").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisScolaire(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btn-view-scolaire").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await voirJustificatifScolaire(btn.dataset.justifId);
    });
  });

  document.querySelectorAll(".btn-download-scolaire").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await telechargerJustificatifScolaire(btn.dataset.justifId);
    });
  });

  updateTotalsScolaire();
}

async function supprimerFraisScolaire(id) {
  const item = fraisScolaires.find((row) => row.id === id);
  if (item?.justificatifId) {
    await deleteFileFromScolaireDB(item.justificatifId);
  }

  fraisScolaires = fraisScolaires.filter((row) => row.id !== id);
  saveFraisScolaires();
  renderScolaire();
  showToastScolaire("Dépense supprimée");
}

async function viderListeScolaire() {
  if (fraisScolaires.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  for (const item of fraisScolaires) {
    if (item.justificatifId) {
      await deleteFileFromScolaireDB(item.justificatifId);
    }
  }

  fraisScolaires = [];
  saveFraisScolaires();
  renderScolaire();
  showToastScolaire("Liste vidée");
}

function updateTotalsScolaire() {
  const totalMontant = fraisScolaires.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalLignesScolaire").textContent = String(fraisScolaires.length);
  document.getElementById("totalMontantScolaire").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function saveFraisScolaires() {
  localStorage.setItem("fraisScolairesMensuels", JSON.stringify(fraisScolaires));
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
  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (fraisScolaires.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const mois = document.getElementById("moisScolaire").value;
  const assistantNom = document.getElementById("assistantNomScolaire").value.trim() || "-";
  const totalMontant = fraisScolaires.reduce((sum, item) => sum + item.montant, 0);

  const margin = 10;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`ETAT DE FRAIS SCOLAIRES DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { title: "Date", width: 20, align: "center" },
    { title: "Enfant", width: 28, align: "left" },
    { title: "Type", width: 28, align: "left" },
    { title: "École", width: 42, align: "left" },
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

  fraisScolaires.forEach((item) => {
    const rowValues = [
      formatDateFr(item.date),
      safeText(item.enfant),
      safeText(item.type),
      safeText(item.ecole),
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
      doc.text(`ETAT DE FRAIS SCOLAIRES DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

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

  const fileName = `etat-frais-scolaires-${mois || "sans-mois"}.pdf`;

  savePdfToHistory(doc, {
    type: "Frais scolaires",
    nom: fileName,
    mois: formatMonthLabel(mois),
  });

  doc.save(fileName);
  showToastScolaire("PDF généré et enregistré");
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

function showToastScolaire(message) {
  const toast = document.getElementById("toastScolaire");
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

function initScolaireDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestionFraisDB", 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("justificatifs")) {
        db.createObjectStore("justificatifs", { keyPath: "id" });
      }
    };

    request.onsuccess = function () {
      scolaireDb = request.result;
      resolve(scolaireDb);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function saveFileToScolaireDB(fileRecord) {
  return new Promise((resolve, reject) => {
    const transaction = scolaireDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.put(fileRecord);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function getFileFromScolaireDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = scolaireDb.transaction(["justificatifs"], "readonly");
    const store = transaction.objectStore("justificatifs");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteFileFromScolaireDB(id) {
  return new Promise((resolve, reject) => {
    const transaction = scolaireDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function voirJustificatifScolaire(justificatifId) {
  const record = await getFileFromScolaireDB(justificatifId);

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

async function telechargerJustificatifScolaire(justificatifId) {
  const record = await getFileFromScolaireDB(justificatifId);

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