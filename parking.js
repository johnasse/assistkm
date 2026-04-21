import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";

const STORAGE_KEY = "parkingModuleEasyFrais";

let currentUser = null;
let entries = [];
let justificatifDataUrl = "";

const moisInput = document.getElementById("moisParking");
const assistantInput = document.getElementById("assistantNomParking");
const dateInput = document.getElementById("dateParking");
const enfantInput = document.getElementById("enfantParking");
const typeInput = document.getElementById("typeParking");
const lieuInput = document.getElementById("lieuParking");
const objetInput = document.getElementById("objetParking");
const montantInput = document.getElementById("montantParking");
const justificatifInput = document.getElementById("justificatifParking");
const btnPhoto = document.getElementById("btnPhotoParking");
const nomJustificatif = document.getElementById("nomJustificatifParking");

const btnAjouter = document.getElementById("btnAjouterParking");
const btnReset = document.getElementById("btnResetParking");
const btnPdf = document.getElementById("btnPdfParking");
const btnVider = document.getElementById("btnViderParking");

const body = document.getElementById("parkingBody");
const totalLignes = document.getElementById("totalLignesParking");
const totalMontant = document.getElementById("totalMontantParking");
const toast = document.getElementById("toastParking");

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} €`;
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function getFileNameMonth(monthValue) {
  return monthValue || getCurrentMonthValue();
}

function saveModule() {
  const payload = {
    mois: moisInput?.value || "",
    assistantNom: assistantInput?.value || "",
    entries
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadModule() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

    if (moisInput && parsed?.mois) moisInput.value = parsed.mois;
    if (assistantInput && parsed?.assistantNom) assistantInput.value = parsed.assistantNom;
  } catch (error) {
    console.error("Erreur chargement parking :", error);
  }
}

function resetForm() {
  if (dateInput) dateInput.value = "";
  if (enfantInput) enfantInput.value = "";
  if (typeInput) typeInput.value = "";
  if (lieuInput) lieuInput.value = "";
  if (objetInput) objetInput.value = "";
  if (montantInput) montantInput.value = "";
  if (justificatifInput) justificatifInput.value = "";
  justificatifDataUrl = "";
  if (nomJustificatif) nomJustificatif.textContent = "";
}

function getTotal() {
  return entries.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function renderTable() {
  if (!body) return;

  if (!entries.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
  } else {
    body.innerHTML = entries.map((item) => `
      <tr>
        <td>${escapeHtml(item.date || "-")}</td>
        <td>${escapeHtml(item.enfant || "-")}</td>
        <td>${escapeHtml(item.type || "-")}</td>
        <td>${escapeHtml(item.lieu || "-")}</td>
        <td>${escapeHtml(item.objet || "-")}</td>
        <td>${formatMoney(item.montant)}</td>
        <td>${item.justificatifName ? "Oui" : "-"}</td>
        <td>
          <button type="button" class="table-action-btn btn-delete-entry" data-id="${escapeHtml(String(item.id))}">
            Supprimer
          </button>
        </td>
      </tr>
    `).join("");
  }

  if (totalLignes) totalLignes.textContent = String(entries.length);
  if (totalMontant) totalMontant.textContent = formatMoney(getTotal());

  document.querySelectorAll(".btn-delete-entry").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      entries = entries.filter((item) => item.id !== id);
      saveModule();
      renderTable();
      showToast("Dépense supprimée");
    });
  });
}

function validateForm() {
  if (!dateInput?.value) {
    alert("Merci de renseigner la date.");
    return false;
  }

  if (!enfantInput?.value.trim()) {
    alert("Merci de renseigner le nom de l’enfant.");
    return false;
  }

  if (!typeInput?.value.trim()) {
    alert("Merci de choisir le type de frais.");
    return false;
  }

  if (!lieuInput?.value.trim()) {
    alert("Merci de renseigner le lieu.");
    return false;
  }

  if (!objetInput?.value.trim()) {
    alert("Merci de renseigner l’objet / description.");
    return false;
  }

  if (!montantInput?.value || Number(montantInput.value) <= 0) {
    alert("Merci de renseigner un montant valide.");
    return false;
  }

  return true;
}

function addEntry() {
  if (!validateForm()) return;

  const entry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    date: dateInput.value,
    enfant: enfantInput.value.trim(),
    type: typeInput.value.trim(),
    lieu: lieuInput.value.trim(),
    objet: objetInput.value.trim(),
    montant: Number(montantInput.value),
    justificatifDataUrl,
    justificatifName: justificatifInput?.files?.[0]?.name || ""
  };

  entries.push(entry);
  saveModule();
  renderTable();
  resetForm();
  showToast("Dépense ajoutée");
}

function clearAllEntries() {
  if (!entries.length) {
    showToast("Aucune dépense à supprimer");
    return;
  }

  const ok = confirm("Voulez-vous vraiment vider toute la liste des frais de parking ?");
  if (!ok) return;

  entries = [];
  saveModule();
  renderTable();
  showToast("Liste vidée");
}

function addEasyfraisFooter(pdf) {
  const pageCount = pdf.getNumberOfPages();

  pdf.setFont("helvetica", "italic");
  pdf.setFontSize(8);
  pdf.setTextColor(120, 120, 120);

  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.text("Document généré automatiquement par easyfrais.fr", 10, pageHeight - 5);
  }

  pdf.setTextColor(0, 0, 0);
}

async function convertImageDataUrlToJpeg(dataUrl, quality = 0.88) {
  const img = new Image();
  img.src = dataUrl;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  return {
    dataUrl: canvas.toDataURL("image/jpeg", quality),
    width: canvas.width,
    height: canvas.height
  };
}
function drawCellText(pdf, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  
  const fontSize = pdf.getFontSize();
  const lineHeight = fontSize * 0.35;

  const totalTextHeight = lines.length * lineHeight;
  let currentY = y + (height - totalTextHeight) / 2 + 2;

  lines.forEach((line) => {
    let textX = x + 2;

    if (align === "center") {
      textX = x + width / 2;
      pdf.text(line, textX, currentY, { align: "center" });
    } else if (align === "right") {
      textX = x + width - 2;
      pdf.text(line, textX, currentY, { align: "right" });
    } else {
      pdf.text(line, textX, currentY);
    }

    currentY += lineHeight;
  });
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function getProfileLogoData() {
  return localStorage.getItem(`profileLogoData_${currentUser?.uid || ""}`) || "";
}

function getProfileSignatureData() {
  return localStorage.getItem(`profileSignatureData_${currentUser?.uid || ""}`) || "";
}
async function drawLogo(pdf) {
  const logoData = getProfileLogoData();
  if (!logoData || !isImageDataUrl(logoData)) return;

  try {
    const convertedLogo = await convertImageDataUrlToJpeg(logoData, 0.9);

    const maxWidth = 30;
    const maxHeight = 20;

    let w = convertedLogo.width;
    let h = convertedLogo.height;

    const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
    w *= ratio;
    h *= ratio;

    pdf.addImage(convertedLogo.dataUrl, "JPEG", 10, 8, w, h);
  } catch (e) {
    console.error("Erreur logo :", e);
  }
}


async function generatePdf() {
  if (!entries.length) {
    alert("Ajoute au moins une dépense avant de générer le PDF.");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("portrait", "mm", "a4");

  const moisValue = moisInput?.value || getCurrentMonthValue();
  const moisLabel = getMonthLabel(moisValue);
  const assistantNom = assistantInput?.value?.trim() || "";
  const total = getTotal();
  const dateCreation = new Date().toLocaleDateString("fr-FR");
  const signatureData = getProfileSignatureData();

  await drawLogo(pdf);

  let y = 15;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("DEMANDE DE REMBOURSEMENT", 105, y, { align: "center" });
  pdf.text("FRAIS DE PARKING", 105, y + 10, { align: "center" });

  pdf.line(60, y + 2, 150, y + 2);
  pdf.line(80, y + 12, 130, y + 12);

  y += 25;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  pdf.text(`Nom / Prénom de l’assistant(e) familial(e) : ${assistantNom || "-"}`, 10, y);
  y += 10;
  pdf.text(`Mois : ${moisLabel}`, 10, y);
  y += 10;

  const tableX = 10;
  const colDate = 28;
  const colEnfant = 40;
  const colDetail = 82;
  const colMontant = 38;
  const headerH = 10;

  pdf.setFont("helvetica", "bold");
  pdf.rect(tableX, y, colDate, headerH);
  pdf.rect(tableX + colDate, y, colEnfant, headerH);
  pdf.rect(tableX + colDate + colEnfant, y, colDetail, headerH);
  pdf.rect(tableX + colDate + colEnfant + colDetail, y, colMontant, headerH);

  drawCellText(pdf, "Date", tableX, y, colDate, headerH, "center");
  drawCellText(pdf, "Enfant", tableX + colDate, y, colEnfant, headerH, "center");
  drawCellText(pdf, "Détail", tableX + colDate + colEnfant, y, colDetail, headerH, "center");
  drawCellText(pdf, "Montant", tableX + colDate + colEnfant + colDetail, y, colMontant, headerH, "center");

  let rowY = y + headerH;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.3);

  const stopY = rowY + 80;

  for (const item of entries) {
    const detailText = [
      item.type,
      item.lieu,
      item.objet
    ].filter(Boolean).join(" - ");

    const dateLines = pdf.splitTextToSize(String(item.date || "-"), colDate - 4);
    const enfantLines = pdf.splitTextToSize(String(item.enfant || "-"), colEnfant - 4);
    const detailLines = pdf.splitTextToSize(String(detailText || "-"), colDetail - 4);
    const montantLines = pdf.splitTextToSize(formatMoney(item.montant), colMontant - 4);

    const maxLines = Math.max(
      dateLines.length,
      enfantLines.length,
      detailLines.length,
      montantLines.length
    );

    const rowH = Math.max(14, maxLines * 4 + 6);

    if (rowY + rowH > stopY) break;

    pdf.rect(tableX, rowY, colDate, rowH);
    pdf.rect(tableX + colDate, rowY, colEnfant, rowH);
    pdf.rect(tableX + colDate + colEnfant, rowY, colDetail, rowH);
    pdf.rect(tableX + colDate + colEnfant + colDetail, rowY, colMontant, rowH);

    drawCellText(pdf, dateLines, tableX, rowY, colDate, rowH, "center");
    drawCellText(pdf, enfantLines, tableX + colDate, rowY, colEnfant, rowH, "center");
    drawCellText(pdf, detailLines, tableX + colDate + colEnfant, rowY, colDetail, rowH, "center");
    drawCellText(pdf, montantLines, tableX + colDate + colEnfant + colDetail, rowY, colMontant, rowH, "center");

    rowY += rowH;
  }

  while (rowY < stopY) {
    const h = Math.min(18, stopY - rowY);

    pdf.rect(tableX, rowY, colDate, h);
    pdf.rect(tableX + colDate, rowY, colEnfant, h);
    pdf.rect(tableX + colDate + colEnfant, rowY, colDetail, h);
    pdf.rect(tableX + colDate + colEnfant + colDetail, rowY, colMontant, h);

    rowY += h;
  }

  const totalX = tableX + colDate + colEnfant + colDetail;
  pdf.rect(totalX, stopY + 2, colMontant, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Total Frais", totalX + colMontant / 2, stopY + 10, { align: "center" });
  pdf.setFontSize(10);
  pdf.text(formatMoney(total), totalX + colMontant / 2, stopY + 20, { align: "center" });

  const certifY = stopY + 15;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Certifié exact, le ${dateCreation}`, 10, certifY);

  pdf.setFont("helvetica", "bold");
  pdf.text("Signature de l’assistant(e) familial(e) :", 10, certifY + 12);

  if (signatureData && isImageDataUrl(signatureData)) {
    try {
      const convertedSignature = await convertImageDataUrlToJpeg(signatureData, 0.9);
      pdf.addImage(convertedSignature.dataUrl, "JPEG", 10, certifY + 14, 52, 15);
    } catch (error) {
      console.error("Erreur ajout signature PDF parking :", error);
    }
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.6);
  pdf.text("Justificatif joint au PDF", 10, 274);

  const bx = 108;
const by = stopY + 32;
  const bw = 90;
  const bh = 44;

  pdf.rect(bx, by, bw, bh);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("BON A PAYER", bx + bw / 2, by + 8, { align: "center" });

  pdf.line(bx, by + 12, bx + bw, by + 12);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Date : ............................................................", bx + 4, by + 18);
  pdf.text("Nom du responsable : ..........................................", bx + 4, by + 26);
  pdf.text("Imputation analytique : .......................................", bx + 4, by + 34);
  pdf.text("Signature : ", bx + 4, by + 42);

  for (const item of entries) {
    if (!item.justificatifDataUrl) continue;

    pdf.addPage();

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(14);
    pdf.text("Justificatif - Frais de parking", 105, 15, { align: "center" });

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(`Date : ${item.date || "-"}`, 14, 30);
    pdf.text(`Enfant : ${item.enfant || "-"}`, 14, 37);
    pdf.text(`Lieu : ${item.lieu || "-"}`, 14, 44);
    pdf.text(`Montant : ${formatMoney(item.montant)}`, 14, 51);

    try {
      const converted = await convertImageDataUrlToJpeg(item.justificatifDataUrl);
      pdf.addImage(converted.dataUrl, "JPEG", 15, 60, 180, 180);
    } catch (e) {
      console.log("Erreur image justificatif", e);
    }
  }

  addEasyfraisFooter(pdf);

const fileName = generateFileName("Frais_parking", moisValue, assistantNom);

  try {
    await savePdfToHistory(pdf, {
      nom: fileName,
      mois: moisLabel,
      type: "Frais de parking"
    });
  } catch (error) {
    console.error("Erreur historique parking :", error);
  }

  pdf.save(fileName);
  showToast("PDF généré et enregistré dans l’historique");
}

async function loadProfileParking() {
  if (!currentUser) return;

  try {
    const profileRef = doc(db, "users", currentUser.uid, "profile", "main");
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    const profileName = String(data.fullName || "").trim();
    const children = String(data.childrenList || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (assistantInput && !assistantInput.value.trim() && profileName) {
      assistantInput.value = profileName;
      saveModule();
    }

    const datalist = document.getElementById("profileChildrenList");
    if (datalist) {
      datalist.innerHTML = "";
      children.forEach((child) => {
        const option = document.createElement("option");
        option.value = child;
        datalist.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Erreur chargement profil parking :", error);
  }
}

function bindEvents() {
  if (btnPhoto && justificatifInput) {
    btnPhoto.addEventListener("click", () => justificatifInput.click());
  }

  if (justificatifInput) {
    justificatifInput.addEventListener("change", () => {
      const file = justificatifInput.files?.[0];
      if (!file) {
        justificatifDataUrl = "";
        if (nomJustificatif) nomJustificatif.textContent = "";
        return;
      }

      if (nomJustificatif) nomJustificatif.textContent = file.name;

      const reader = new FileReader();
      reader.onload = () => {
        justificatifDataUrl = reader.result || "";
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnAjouter) btnAjouter.addEventListener("click", addEntry);
  if (btnReset) btnReset.addEventListener("click", resetForm);
  if (btnPdf) btnPdf.addEventListener("click", generatePdf);
  if (btnVider) btnVider.addEventListener("click", clearAllEntries);

  if (moisInput) {
    moisInput.addEventListener("change", saveModule);
  }

  if (assistantInput) {
    assistantInput.addEventListener("input", saveModule);
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (!currentUser) {
    window.location.href = "connexion.html";
    return;
  }

  if (moisInput && !moisInput.value) {
    moisInput.value = getCurrentMonthValue();
  }

  loadModule();
  renderTable();
  bindEvents();
  await loadProfileParking();
})
const ok = await requireGlobalPin({
  title: "Accès au module parking",
  message: "Entre ton code PIN pour accéder à ce module."
});