import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisLoisirs = [];
let loisirsDb = null;
let currentUid = null;
let eventsBound = false;
let domReady = false;

function el(id) {
  return document.getElementById(id);
}

function getUid() {
  return currentUid || auth.currentUser?.uid || "guest";
}

function getStorageKey() {
  return `fraisLoisirsMensuels_${getUid()}`;
}

function getAssistantNameKey() {
  return `assistantNomLoisirs_${getUid()}`;
}

function getFallbackAssistantNameKey() {
  return `assistantNom_${getUid()}`;
}

function getMonthKey() {
  return `moisLoisirs_${getUid()}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  domReady = true;

  try {
    await initLoisirsDB();
  } catch (error) {
    console.error("Erreur IndexedDB loisirs :", error);
  }

  if (auth.currentUser) {
    currentUid = auth.currentUser.uid;
    loadLoisirsModule();
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUid = user.uid;

  if (domReady) {
    loadLoisirsModule();
  }
});

function loadLoisirsModule() {
  fraisLoisirs = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosLoisirs();

  if (!eventsBound) {
    bindLoisirsEvents();
    eventsBound = true;
  }

  renderLoisirs();
}

function bindLoisirsEvents() {
  const btnAjouter = el("btnAjouterLoisirs");
  const btnReset = el("btnResetLoisirs");
  const btnPdf = el("btnPdfLoisirs");
  const btnVider = el("btnViderLoisirs");
  const assistantNom = el("assistantNomLoisirs");
  const mois = el("moisLoisirs");
  const btnPhoto = el("btnPhotoLoisirs");
  const justificatifInput = el("justificatifLoisirs");

  if (btnAjouter) {
    btnAjouter.addEventListener("click", async (e) => {
      e.preventDefault();
      await ajouterFraisLoisirs();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      resetFormLoisirs();
    });
  }

  if (btnPdf) {
    btnPdf.addEventListener("click", async (e) => {
      e.preventDefault();
      await genererPDFLoisirs();
    });
  }

  if (btnVider) {
    btnVider.addEventListener("click", async (e) => {
      e.preventDefault();
      await viderListeLoisirs();
    });
  }

  if (assistantNom) {
    assistantNom.addEventListener("input", saveAssistantNomLoisirs);
  }

  if (mois) {
    mois.addEventListener("change", saveMoisLoisirs);
  }

  if (btnPhoto && justificatifInput) {
    btnPhoto.addEventListener("click", (e) => {
      e.preventDefault();
      justificatifInput.click();
    });

    justificatifInput.addEventListener("change", updateNomJustificatifLoisirs);
  }
}

function chargerInfosLoisirs() {
  const assistantNom =
    localStorage.getItem(getAssistantNameKey()) ||
    localStorage.getItem(getFallbackAssistantNameKey()) ||
    "";

  const moisLoisirs = localStorage.getItem(getMonthKey());

  const assistantInput = el("assistantNomLoisirs");
  const moisInput = el("moisLoisirs");

  if (assistantInput) {
    assistantInput.value = assistantNom;
  }

  if (!moisInput) return;

  if (moisLoisirs) {
    moisInput.value = moisLoisirs;
  } else {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    moisInput.value = `${year}-${month}`;
  }
}

function saveAssistantNomLoisirs() {
  const assistantInput = el("assistantNomLoisirs");
  if (!assistantInput) return;

  localStorage.setItem(getAssistantNameKey(), assistantInput.value.trim());
}

function saveMoisLoisirs() {
  const moisInput = el("moisLoisirs");
  if (!moisInput) return;

  localStorage.setItem(getMonthKey(), moisInput.value);
}

function updateNomJustificatifLoisirs() {
  const input = el("justificatifLoisirs");
  const label = el("nomJustificatifLoisirs");
  if (!input || !label) return;

  const file = input.files?.[0];
  label.textContent = file ? `Fichier sélectionné : ${file.name}` : "";
}

async function ajouterFraisLoisirs() {
  const date = el("dateLoisirs")?.value || "";
  const enfant = el("enfantLoisirs")?.value.trim() || "";
  const type = el("typeLoisirs")?.value || "";
  const lieu = el("lieuLoisirs")?.value.trim() || "";
  const objet = el("objetLoisirs")?.value.trim() || "";
  const montant = parseFloat(el("montantLoisirs")?.value || "");
  const justificatifFile = el("justificatifLoisirs")?.files?.[0] || null;

  if (!date || !enfant || !type || !lieu || !objet || Number.isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatifId = null;
  let justificatifNom = "";
  let justificatifType = "";

  if (justificatifFile) {
    if (!loisirsDb) {
      try {
        await initLoisirsDB();
      } catch (error) {
        console.error("Impossible d'initialiser la base justificatifs loisirs :", error);
        alert("Impossible d’enregistrer le justificatif pour le moment.");
        return;
      }
    }

    justificatifId = `justif-loisirs-${getUid()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    justificatifNom = justificatifFile.name;
    justificatifType = justificatifFile.type || "";

    await saveFileToLoisirsDB({
      id: justificatifId,
      ownerUid: getUid(),
      name: justificatifNom,
      type: justificatifType,
      file: justificatifFile,
      createdAt: new Date().toISOString()
    });
  }

  fraisLoisirs.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    date,
    enfant,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatifId,
    justificatifNom,
    justificatifType
  });

  saveFraisLoisirs();
  renderLoisirs();
  resetFormLoisirs();
  showToastLoisirs("Dépense ajoutée");
}

function renderLoisirs() {
  const body = el("loisirsBody");
  if (!body) return;

  body.innerHTML = "";

  if (fraisLoisirs.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    updateTotalsLoisirs();
    return;
  }

  fraisLoisirs.forEach((item) => {
    const tr = document.createElement("tr");

    const justificatifHtml = item.justificatifId
      ? `
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span>${escapeHtml(item.justificatifNom || "Justificatif")}</span>
          <button type="button" class="table-action-btn btn-view-loisirs" data-justif-id="${escapeHtml(item.justificatifId)}" style="background:#2563eb;">Voir</button>
          <button type="button" class="table-action-btn btn-download-loisirs" data-justif-id="${escapeHtml(item.justificatifId)}" style="background:#16a34a;">Télécharger</button>
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
      <td><button type="button" class="table-action-btn btn-delete-loisirs" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".btn-delete-loisirs").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await supprimerFraisLoisirs(Number(btn.dataset.id));
    });
  });

  body.querySelectorAll(".btn-view-loisirs").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await voirJustificatifLoisirs(btn.dataset.justifId);
    });
  });

  body.querySelectorAll(".btn-download-loisirs").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await telechargerJustificatifLoisirs(btn.dataset.justifId);
    });
  });

  updateTotalsLoisirs();
}

async function supprimerFraisLoisirs(id) {
  const item = fraisLoisirs.find((row) => row.id === id);

  if (item?.justificatifId && loisirsDb) {
    await deleteFileFromLoisirsDB(item.justificatifId);
  }

  fraisLoisirs = fraisLoisirs.filter((row) => row.id !== id);
  saveFraisLoisirs();
  renderLoisirs();
  showToastLoisirs("Dépense supprimée");
}

async function viderListeLoisirs() {
  if (fraisLoisirs.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  if (loisirsDb) {
    for (const item of fraisLoisirs) {
      if (item.justificatifId) {
        await deleteFileFromLoisirsDB(item.justificatifId);
      }
    }
  }

  fraisLoisirs = [];
  saveFraisLoisirs();
  renderLoisirs();
  showToastLoisirs("Liste vidée");
}

function updateTotalsLoisirs() {
  const totalLignes = el("totalLignesLoisirs");
  const totalMontantEl = el("totalMontantLoisirs");

  const totalMontant = fraisLoisirs.reduce((sum, item) => sum + item.montant, 0);

  if (totalLignes) {
    totalLignes.textContent = String(fraisLoisirs.length);
  }

  if (totalMontantEl) {
    totalMontantEl.textContent = totalMontant.toFixed(2).replace(".", ",") + " €";
  }
}

function saveFraisLoisirs() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisLoisirs));
}

function resetFormLoisirs() {
  if (el("dateLoisirs")) el("dateLoisirs").value = "";
  if (el("enfantLoisirs")) el("enfantLoisirs").value = "";
  if (el("typeLoisirs")) el("typeLoisirs").value = "";
  if (el("lieuLoisirs")) el("lieuLoisirs").value = "";
  if (el("objetLoisirs")) el("objetLoisirs").value = "";
  if (el("montantLoisirs")) el("montantLoisirs").value = "";
  if (el("justificatifLoisirs")) el("justificatifLoisirs").value = "";
  if (el("nomJustificatifLoisirs")) el("nomJustificatifLoisirs").textContent = "";
}

async function genererPDFLoisirs() {
  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (fraisLoisirs.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie PDF n'est pas chargée.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const mois = el("moisLoisirs")?.value || "";
  const assistantNom = el("assistantNomLoisirs")?.value.trim() || "-";
  const totalMontant = fraisLoisirs.reduce((sum, item) => sum + item.montant, 0);

  const margin = 10;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`ETAT DE FRAIS SPORTS ET LOISIRS DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { title: "Date", width: 20, align: "center" },
    { title: "Enfant", width: 28, align: "left" },
    { title: "Type", width: 26, align: "left" },
    { title: "Magasin / lieu", width: 42, align: "left" },
    { title: "Objet", width: 82, align: "left" },
    { title: "Montant", width: 22, align: "right" },
    { title: "Justificatif", width: 45, align: "left" }
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

  fraisLoisirs.forEach((item) => {
    const rowValues = [
      formatDateFr(item.date),
      safeText(item.enfant),
      safeText(item.type),
      safeText(item.lieu),
      safeText(item.objet),
      item.montant.toFixed(2).replace(".", ",") + " €",
      item.justificatifNom ? safeText(item.justificatifNom) : "Aucun"
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
      doc.text(`ETAT DE FRAIS SPORTS ET LOISIRS DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

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

  const fileName = `etat-frais-loisirs-${mois || "sans-mois"}.pdf`;

  savePdfToHistory(doc, {
    type: "Sports et loisirs",
    nom: fileName,
    mois: formatMonthLabel(mois)
  });

  doc.save(fileName);
  showToastLoisirs("PDF généré et enregistré");
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

function showToastLoisirs(message) {
  const toast = el("toastLoisirs");
  if (!toast) {
    console.log(message);
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* INDEXEDDB */

function initLoisirsDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestionFraisDB", 1);

    request.onupgradeneeded = function (event) {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("justificatifs")) {
        db.createObjectStore("justificatifs", { keyPath: "id" });
      }
    };

    request.onsuccess = function () {
      loisirsDb = request.result;
      resolve(loisirsDb);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

function saveFileToLoisirsDB(fileRecord) {
  return new Promise((resolve, reject) => {
    if (!loisirsDb) {
      reject(new Error("Base IndexedDB non initialisée"));
      return;
    }

    const transaction = loisirsDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.put(fileRecord);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function getFileFromLoisirsDB(id) {
  return new Promise((resolve, reject) => {
    if (!loisirsDb) {
      reject(new Error("Base IndexedDB non initialisée"));
      return;
    }

    const transaction = loisirsDb.transaction(["justificatifs"], "readonly");
    const store = transaction.objectStore("justificatifs");
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function deleteFileFromLoisirsDB(id) {
  return new Promise((resolve, reject) => {
    if (!loisirsDb) {
      reject(new Error("Base IndexedDB non initialisée"));
      return;
    }

    const transaction = loisirsDb.transaction(["justificatifs"], "readwrite");
    const store = transaction.objectStore("justificatifs");
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function voirJustificatifLoisirs(justificatifId) {
  try {
    const record = await getFileFromLoisirsDB(justificatifId);

    if (!record || !record.file) {
      alert("Justificatif introuvable.");
      return;
    }

    if (record.ownerUid && record.ownerUid !== getUid()) {
      alert("Accès refusé à ce justificatif.");
      return;
    }

    const url = URL.createObjectURL(record.file);
    window.open(url, "_blank");

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  } catch (error) {
    console.error(error);
    alert("Impossible d’ouvrir le justificatif.");
  }
}

async function telechargerJustificatifLoisirs(justificatifId) {
  try {
    const record = await getFileFromLoisirsDB(justificatifId);

    if (!record || !record.file) {
      alert("Justificatif introuvable.");
      return;
    }

    if (record.ownerUid && record.ownerUid !== getUid()) {
      alert("Accès refusé à ce justificatif.");
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
  } catch (error) {
    console.error(error);
    alert("Impossible de télécharger le justificatif.");
  }
}
