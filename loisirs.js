import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

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
    console.error("Erreur initialisation IndexedDB loisirs :", error);
  }

  if (auth.currentUser) {
    currentUid = auth.currentUser.uid;
    initModule();
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUid = user.uid;

  if (domReady) {
    initModule();
  }
});

function initModule() {
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
  const input = el("assistantNomLoisirs");
  if (!input) return;
  localStorage.setItem(getAssistantNameKey(), input.value.trim());
}

function saveMoisLoisirs() {
  const input = el("moisLoisirs");
  if (!input) return;
  localStorage.setItem(getMonthKey(), input.value);
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

  try {
    if (justificatifFile) {
      if (!loisirsDb) {
        await initLoisirsDB();
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
  } catch (error) {
    console.error("Erreur ajout loisirs :", error);
    alert("Impossible d'ajouter la dépense.");
  }
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
  try {
    const item = fraisLoisirs.find((row) => row.id === id);

    if (item?.justificatifId && loisirsDb) {
      await deleteFileFromLoisirsDB(item.justificatifId);
    }

    fraisLoisirs = fraisLoisirs.filter((row) => row.id !== id);
    saveFraisLoisirs();
    renderLoisirs();
    showToastLoisirs("Dépense supprimée");
  } catch (error) {
    console.error("Erreur suppression loisirs :", error);
    alert("Impossible de supprimer la dépense.");
  }
}

async function viderListeLoisirs() {
  if (fraisLoisirs.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  try {
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
  } catch (error) {
    console.error("Erreur vidage loisirs :", error);
    alert("Impossible de vider la liste.");
  }
}

function updateTotalsLoisirs() {
  const totalLignes = el("totalLignesLoisirs");
  const totalMontantEl = el("totalMontantLoisirs");
  const totalMontant = fraisLoisirs.reduce((sum, item) => sum + item.montant, 0);

  if (totalLignes) totalLignes.textContent = String(fraisLoisirs.length);
  if (totalMontantEl) totalMontantEl.textContent = totalMontant.toFixed(2).replace(".", ",") + " €";
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

  doc.text(`ETAT DE FRAIS SPORTS ET LOISIRS DU MOIS DE : ${formatMonthFr(mois)}`, 10, 14);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, 10, 22);

  let y = 35;
  fraisLoisirs.forEach((item) => {
    doc.text(
      `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.lieu} - ${item.objet} - ${item.montant.toFixed(2).replace(".", ",")} €`,
      10,
      y
    );
    y += 8;
  });

  doc.text(`Total du mois : ${totalMontant.toFixed(2).replace(".", ",")} €`, 10, y + 10);

  const fileName = `etat-frais-loisirs-${mois || "sans-mois"}.pdf`;

  savePdfToHistory(doc, {
    type: "Sports et loisirs",
    nom: fileName,
    mois: formatMonthLabel(mois)
  });

  doc.save(fileName);
  showToastLoisirs("PDF généré et enregistré");
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatMonthFr(monthStr) {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  const months = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  return `${months[Number(month) - 1]} ${year}`;
}

function showToastLoisirs(message) {
  const toast = el("toastLoisirs");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

    const url = URL.createObjectURL(record.file);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error(error);
    alert("Impossible d'ouvrir le justificatif.");
  }
}

async function telechargerJustificatifLoisirs(justificatifId) {
  try {
    const record = await getFileFromLoisirsDB(justificatifId);
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
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error(error);
    alert("Impossible de télécharger le justificatif.");
  }
}
