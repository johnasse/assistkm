import { getPrivateBlob, privateStoragePath } from "./private-storage.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getStorage, ref, deleteObject } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
const storage = getStorage();

let currentUser = null;
let historique = [];
let deleting = false;

const $ = (id) => document.getElementById(id);

function loadHistorique() {
  const storageKey = `historiquePDF_${currentUser.uid}`;
  historique = JSON.parse(localStorage.getItem(storageKey) || "[]");
  for (const pdf of historique) {
    if (!pdf.storagePath && pdf.downloadURL) {
      try { pdf.storagePath = privateStoragePath(pdf.downloadURL); } catch { /* Invalid/unowned legacy files stay inaccessible. */ }
    }
    if (pdf.storagePath) delete pdf.downloadURL;
  }
  saveHistorique();
}

function saveHistorique() {
  const storageKey = `historiquePDF_${currentUser.uid}`;
  localStorage.setItem(storageKey, JSON.stringify(historique));
}

function canDownload(pdf) {
  return !!pdf?.storagePath || !!pdf?.downloadURL || !!pdf?.data;
}

function renderHistorique() {
  const body = $("historiqueBody");
  body.innerHTML = "";

  if (!historique.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucun PDF</td></tr>`;
    $("nbResultatsHistorique").textContent = "0";
    syncSelectionActions();
    return;
  }

  historique.forEach((pdf) => {
    const tr = document.createElement("tr");
    const downloadable = canDownload(pdf);

    tr.innerHTML = `
      <td class="checkbox-cell">
        <input type="checkbox" class="pdfCheck" data-id="${escapeHtml(pdf.id)}" aria-label="Sélectionner ${escapeHtml(pdf.nom || 'ce PDF')}">
      </td>
      <td>${escapeHtml(pdf.mois || "-")}</td>
      <td>${escapeHtml(pdf.type || "-")}</td>
      <td>${escapeHtml(pdf.nom || "-")}</td>
      <td>${escapeHtml(pdf.dateGeneration || "-")}</td>
      <td class="pdf-row-actions">
        ${
          downloadable
            ? `<button class="btn btn-secondary btn-view" type="button" data-id="${escapeHtml(pdf.id)}">Voir</button>
               <button class="btn btn-primary btn-download" data-id="${escapeHtml(pdf.id)}">Télécharger</button>`
            : `<button class="btn btn-secondary" type="button" disabled>Indisponible</button>`
        }
        <button class="table-action-btn btn-delete" data-id="${escapeHtml(pdf.id)}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", () => voirPdf(btn.dataset.id));
  });

  document.querySelectorAll(".btn-download").forEach((btn) => {
    btn.addEventListener("click", () => telechargerPdf(btn.dataset.id));
  });

  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => supprimerPdf(btn.dataset.id));
  });

  document.querySelectorAll(".pdfCheck").forEach(box => box.addEventListener("change", syncSelectionActions));
  $("nbResultatsHistorique").textContent = String(historique.length);
  syncSelectionActions();
}

// Preview from an in-memory PDF Blob: remote Content-Disposition headers cannot force a download.
let previewUrl = null;
let previewRequest = null;
let previewVersion = 0;
const previewDialog = $("pdfPreviewDialog");
function resetPreview() {
  previewVersion++;
  previewRequest?.abort();
  previewRequest = null;
  $("pdfPreviewFrame").removeAttribute("src");
  $("pdfPreviewFrame").hidden = true;
  $("pdfPreviewOpen").removeAttribute("href");
  $("pdfPreviewOpen").hidden = true;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}
async function voirPdf(id) {
  const pdf = historique.find(p => String(p.id) === String(id));
  if (!pdf || !canDownload(pdf)) return;
  resetPreview();
  const version = previewVersion;
  $("pdfPreviewTitle").textContent = pdf.nom || "Aperçu du PDF";
  $("pdfPreviewStatus").hidden = false;
  $("pdfPreviewStatus").textContent = "Chargement du PDF…";
  if (!previewDialog.open) previewDialog.showModal();
  previewRequest = new AbortController();
  try {
    const bytes = await (await getPrivateBlob(pdf, { signal: previewRequest.signal })).arrayBuffer();
    if (version !== previewVersion || !previewDialog.open) return;
    previewUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    $("pdfPreviewFrame").src = previewUrl;
    $("pdfPreviewFrame").hidden = false;
    $("pdfPreviewOpen").href = previewUrl;
    $("pdfPreviewOpen").hidden = false;
    $("pdfPreviewStatus").hidden = true;
  } catch (error) {
    if (error.name === "AbortError" || version !== previewVersion) return;
    console.error("Erreur aperçu PDF", error);
    $("pdfPreviewStatus").textContent = "Impossible d’afficher ce PDF. Vérifiez votre connexion, puis fermez l’aperçu et réessayez.";
  }
}
$("pdfPreviewClose").addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("close", resetPreview);
window.addEventListener("pagehide", resetPreview);
$("btnMergeSelected")?.addEventListener("click", () => mergeSelectedPDFs().catch(error => {
  console.error('Fusion privée impossible', error);
  $('historyActionStatus').textContent = 'Impossible de fusionner les PDF. Vérifiez votre connexion et votre accès aux fichiers.';
}));

async function telechargerPdf(id) {
  const pdf = historique.find(p => String(p.id) === String(id));
  if (!pdf) return;
  try {
    const blob = await getPrivateBlob(pdf);
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = pdf.nom || 'document.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    console.error('Lecture privée du PDF impossible', error);
    $('historyActionStatus').textContent = 'Impossible de télécharger ce PDF. Vérifiez votre connexion et votre accès au fichier.';
  }
}

function selectedIds() {
  return [...document.querySelectorAll(".pdfCheck:checked")].map(box => box.dataset.id);
}
function syncSelectionActions() {
  const count = selectedIds().length;
  $("btnDeleteSelected").disabled = deleting || count === 0;
  $("btnDeleteSelected").textContent = count ? `Supprimer la sélection (${count})` : "Supprimer la sélection";
}
async function deleteHistoryEntries(ids) {
  if (deleting) return;
  const idSet = new Set(ids.map(String));
  const entries = historique.filter(pdf => idSet.has(String(pdf.id)));
  if (!entries.length) return;
  deleting = true;
  document.querySelectorAll(".btn-delete, .pdfCheck, #btnSelectAllHistorique, #btnUnselectAllHistorique, #btnMergeSelected").forEach(el => el.disabled = true);
  syncSelectionActions();
  $("historyActionStatus").textContent = "Suppression en cours…";
  try {
    const results = await Promise.allSettled(entries.map(async pdf => {
      if (!pdf.storagePath) return;
      try { await deleteObject(ref(storage, pdf.storagePath)); }
      catch (error) { if (error.code !== "storage/object-not-found") throw error; }
    }));
    const removed = new Set();
    results.forEach((result,i) => {
      if (result.status === "fulfilled") removed.add(String(entries[i].id));
      else console.error("Suppression PDF impossible", result.reason);
    });
    historique = historique.filter(pdf => !removed.has(String(pdf.id)));
    saveHistorique();
    renderHistorique();
    const failed = entries.length - removed.size;
    $("historyActionStatus").textContent = `${removed.size} PDF supprimé${removed.size > 1 ? "s" : ""}.` +
      (failed ? ` ${failed} suppression${failed > 1 ? "s" : ""} impossible${failed > 1 ? "s" : ""} : les documents concernés sont conservés dans l’historique. Vérifiez votre connexion puis réessayez.` : "");
  } catch (error) {
    console.error(error);
    $("historyActionStatus").textContent = "Impossible de terminer la suppression. Rechargez l’historique et vérifiez les documents restants.";
  } finally {
    deleting = false;
    document.querySelectorAll(".btn-delete, .pdfCheck, #btnSelectAllHistorique, #btnUnselectAllHistorique, #btnMergeSelected").forEach(el => el.disabled = false);
    syncSelectionActions();
  }
}
async function supprimerPdf(id) {
  if (deleting) return;
  const pdf = historique.find(p => String(p.id) === String(id));
  if (!pdf || !confirm(`Supprimer définitivement "${pdf.nom || "ce PDF"}" de l’historique et son fichier enregistré ?`)) return;
  await deleteHistoryEntries([id]);
}
$("btnDeleteSelected").addEventListener("click", async () => {
  const ids = selectedIds();
  if (deleting || !ids.length) return;
  if (!confirm(`Supprimer définitivement les ${ids.length} PDF sélectionnés de l’historique et leurs fichiers enregistrés ?`)) return;
  await deleteHistoryEntries(ids);
});
$("btnSelectAllHistorique").addEventListener("click", () => {
  document.querySelectorAll(".pdfCheck").forEach(box => box.checked = true);
  syncSelectionActions();
});
$("btnUnselectAllHistorique").addEventListener("click", () => {
  document.querySelectorAll(".pdfCheck").forEach(box => box.checked = false);
  syncSelectionActions();
});

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

onAuthStateChanged(auth, async (user) => {
  if (currentUser?.uid !== user?.uid) {
    previewDialog.close(); resetPreview(); historique = []; renderHistorique();
  }
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUser = user;

  // 🔒 Vérifie que le PIN existe
  if (!ensureGlobalPinExists()) {
    window.location.href = "index.html";
    return;
  }

  // 🔒 Demande le PIN
  const ok = await requireGlobalPin({
    title: "Accès à l’historique",
    message: "Entre ton code PIN pour accéder à ce module."
  });

  if (!ok) {
    window.location.href = "index.html";
    return;
  }

  // ✅ Chargement normal
  loadHistorique();
  renderHistorique();


});
  

// ===== FUSION PDF =====
async function mergeSelectedPDFs() {
  const checkboxes = [...document.querySelectorAll(".pdfCheck:checked")].filter(box =>
    historique.some(pdf => String(pdf.id) === box.dataset.id && canDownload(pdf))
  );

  if (checkboxes.length < 2) {
    alert("Sélectionne au moins 2 PDF disponibles à fusionner.");
    return;
  }

  const { PDFDocument } = window.PDFLib;
  const mergedPdf = await PDFDocument.create();

  for (const checkbox of checkboxes) {
    const id = checkbox.dataset.id;
    const pdf = historique.find(p => String(p.id) === String(id));

    if (!pdf) continue;

    const pdfBytes = await (await getPrivateBlob(pdf)).arrayBuffer();

    const loadedPdf = await PDFDocument.load(pdfBytes);
    const pages = await mergedPdf.copyPages(loadedPdf, loadedPdf.getPageIndices());

    pages.forEach(page => mergedPdf.addPage(page));
  }

  const mergedBytes = await mergedPdf.save();

  const blob = new Blob([mergedBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "fusion_easyfrais.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}