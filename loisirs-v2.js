import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { saveModuleData, loadModuleData } from "./cloud-sync.js";

let fraisLoisirs = [];
let uid = null;
let currentUser = null;
let currentProfile = null;
let eventsBound = false;

const $ = (id) => document.getElementById(id);

function getStorageKey() {
  return `loisirs_${uid}`;
}

function getDefaultMonthValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}


async function saveData() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisLoisirs));

  await saveModuleData(uid, "loisirs", {
    fraisLoisirs,
    assistantNom: $("assistantNomLoisirs")?.value || "",
    mois: $("moisLoisirs")?.value || ""
  });
}

async function loadData() {
  try {
    const cloud = await loadModuleData(uid, "loisirs");

    if (cloud?.fraisLoisirs) {
      fraisLoisirs = cloud.fraisLoisirs;
    } else {
      fraisLoisirs = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
    }

    if (
  cloud?.assistantNom &&
  $("assistantNomLoisirs") &&
  !$("assistantNomLoisirs").value.trim()
) {
  $("assistantNomLoisirs").value = cloud.assistantNom;
}

    if (cloud?.mois && $("moisLoisirs")) {
      $("moisLoisirs").value = cloud.mois;
    }

  } catch (error) {
    console.error("Erreur chargement cloud loisirs :", error);

    fraisLoisirs = JSON.parse(
      localStorage.getItem(getStorageKey()) || "[]"
    );
  }
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function isImageFile(file) {
  return Boolean(file && file.type && file.type.startsWith("image/"));
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

function updateNomJustificatif() {
  const file = $("justificatifLoisirs")?.files?.[0];
  $("nomJustificatifLoisirs").textContent = file ? `Fichier sélectionné : ${file.name}` : "";
}

function resetForm() {
  $("dateLoisirs").value = "";
  $("enfantLoisirs").value = "";
  $("typeLoisirs").value = "";
  $("lieuLoisirs").value = "";
  $("objetLoisirs").value = "";
  $("montantLoisirs").value = "";
  $("justificatifLoisirs").value = "";
  $("nomJustificatifLoisirs").textContent = "";
}

function getTotal() {
  return fraisLoisirs.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function showToast(message) {
  const toast = $("toastLoisirs") || $("toast") || document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

async function ajouterFrais() {
  const date = $("dateLoisirs").value;
  const enfant = $("enfantLoisirs").value.trim();
  const type = $("typeLoisirs").value;
  const lieu = $("lieuLoisirs").value.trim();
  const objet = $("objetLoisirs").value.trim();
  const montant = parseFloat($("montantLoisirs").value);
  const file = $("justificatifLoisirs")?.files?.[0] || null;

  if (!date || !enfant || !type || !lieu || !objet || Number.isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatif = null;

  if (file) {
    if (!isImageFile(file)) {
      alert("Pour le moment, seuls les justificatifs image sont acceptés.");
      return;
    }

    try {
      justificatif = {
        name: file.name,
        type: file.type,
        data: await fileToBase64(file)
      };
    } catch (error) {
      console.error("Erreur lecture justificatif loisirs :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  fraisLoisirs.push({
    id: Date.now(),
    date,
    enfant,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatif
  });

  await saveData();
  render();
  resetForm();
  showToast("Dépense ajoutée");
}

function voirJustificatif(id) {
  const item = fraisLoisirs.find((x) => x.id === id);

  if (!item?.justificatif?.data) {
    alert("Justificatif introuvable.");
    return;
  }

  const win = window.open();
  if (!win) {
    alert("Impossible d’ouvrir le justificatif.");
    return;
  }

  win.document.write(`
    <html>
      <head><title>${escapeHtml(item.justificatif.name || "Justificatif")}</title></head>
      <body style="margin:0;display:flex;justify-content:center;align-items:center;background:#111;">
        <img src="${item.justificatif.data}" style="max-width:100%;max-height:100vh;" />
      </body>
    </html>
  `);
  win.document.close();
}

async function supprimerFrais(id) {
  fraisLoisirs = fraisLoisirs.filter((x) => x.id !== id);
  await saveData();
  render();
  showToast("Dépense supprimée");
}

async function viderListe() {
  if (!fraisLoisirs.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisLoisirs = [];
  await saveData();
  render();
  showToast("Liste vidée");
}

function render() {
  const body = $("loisirsBody");
  body.innerHTML = "";

  if (!fraisLoisirs.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    $("totalLignesLoisirs").textContent = "0";
    $("totalMontantLoisirs").textContent = "0,00 €";
    return;
  }
  

  const sorted = [...fraisLoisirs].sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);

sorted.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>
        ${item.justificatif?.data
          ? `<button class="table-action-btn btn-view" data-id="${item.id}">Voir</button>`
          : "Aucun"}
      </td>
      <td>
        <button class="table-action-btn btn-delete" data-id="${item.id}">Supprimer</button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFrais(Number(btn.dataset.id)));
  });

  body.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", () => voirJustificatif(Number(btn.dataset.id)));
  });

  $("totalLignesLoisirs").textContent = String(fraisLoisirs.length);
  $("totalMontantLoisirs").textContent = `${getTotal().toFixed(2).replace(".", ",")} €`;
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

async function ajouterImagesAuPdf(pdf) {
  for (const item of fraisLoisirs) {
    if (!item.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);

      const meta = `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.lieu} - ${item.objet}`;
      const lines = pdf.splitTextToSize(meta, pageWidth - margin * 2);
      pdf.text(lines, margin, 22);

      const startY = 22 + lines.length * 5 + 6;
      const converted = await convertImageDataUrlToJpeg(item.justificatif.data);

      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - startY - margin;

      let imgWidth = converted.width;
      let imgHeight = converted.height;

      const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
      imgWidth *= ratio;
      imgHeight *= ratio;

      pdf.addImage(
        converted.dataUrl,
        "JPEG",
        (pageWidth - imgWidth) / 2,
        startY,
        imgWidth,
        imgHeight
      );
    } catch (error) {
      console.error("Erreur ajout image PDF loisirs :", error);
    }
  }
}

function drawCellText(pdf, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  const fontSize = pdf.getFontSize();
  const lineGap = fontSize * 0.35;
  const totalTextHeight = lines.length * lineGap;
  let currentY = y + (height - totalTextHeight) / 2 + 2.2;

  lines.forEach((line) => {
    let textX = x + 1.8;

    if (align === "center") {
      textX = x + width / 2;
      pdf.text(line, textX, currentY, { align: "center" });
    } else if (align === "right") {
      textX = x + width - 1.8;
      pdf.text(line, textX, currentY, { align: "right" });
    } else {
      pdf.text(line, textX, currentY);
    }

    currentY += lineGap;
  });
}

function getProfileLogoData() {
  return (
    currentProfile?.logoUrl ||
    currentProfile?.logoData ||
    localStorage.getItem(`profileLogoData_${uid}`) ||
    ""
  );
}

function getProfileSignatureData() {
  return (
    currentProfile?.signatureUrl ||
    currentProfile?.signatureData ||
    localStorage.getItem(`profileSignatureData_${uid}`) ||
    ""
  );
}

function getAssistantName() {
  return $("assistantNomLoisirs").value.trim() || currentProfile?.fullName || "-";
}

function getMainChildName() {
  if (!fraisLoisirs.length) return "-";
  const uniqueChildren = [...new Set(fraisLoisirs.map((item) => String(item.enfant || "").trim()).filter(Boolean))];
  if (uniqueChildren.length === 1) return uniqueChildren[0];
  return uniqueChildren.join(", ");
}

async function drawLogo(pdf) {
  const logoData = getProfileLogoData();
  if (!logoData || !isImageDataUrl(logoData)) return;

  try {
    const convertedLogo = await convertImageDataUrlToJpeg(logoData, 0.92);
    const maxLogoWidth = 28;
    const maxLogoHeight = 18;

    let logoWidth = convertedLogo.width;
    let logoHeight = convertedLogo.height;

    const ratio = Math.min(maxLogoWidth / logoWidth, maxLogoHeight / logoHeight, 1);
    logoWidth *= ratio;
    logoHeight *= ratio;

    pdf.addImage(convertedLogo.dataUrl, "JPEG", 10, 8, logoWidth, logoHeight);
  } catch (error) {
    console.error("Erreur ajout logo PDF loisirs :", error);
  }
}

async function genererPDF() {

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (!fraisLoisirs.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("portrait", "mm", "a4");

  const assistant = getAssistantName();
  const enfantPrincipal = getMainChildName();
  const total = getTotal();
  const dateCreationPdf = new Date().toLocaleDateString("fr-FR");
  const mois = $("moisLoisirs").value || "";
  const signatureData = getProfileSignatureData();

  await drawLogo(pdf);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("DEMANDE DE REMBOURSEMENT", 105, 18, { align: "center" });
  pdf.text("SPORTS ET LOISIRS", 105, 28, { align: "center" });

  pdf.setLineWidth(0.4);
  pdf.line(63, 20, 147, 20);
  pdf.line(80, 30, 130, 30);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.2);

  const bulletX = 16;
  let y = 42;

  const bullet1 = "120 euros par an et par enfant.";
  const bullet2 = "Cette somme sera remboursée sur présentation de facture accompagnée de l’imprimé.";
  const bullet3 = "Conditions pour l’attribution : inscription ou abonnement à l’année : activité sportive, culturelle, artistique, abonnement livres jeunesse…";

  const bullets = [bullet1, bullet2, bullet3];

  for (const text of bullets) {
    pdf.circle(bulletX, y - 1.2, 0.7, "F");
    const lines = pdf.splitTextToSize(text, 155);
    pdf.text(lines, bulletX + 4, y);
    y += lines.length * 5.2 + 2;
  }

  y += 8;

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Nom / Prénom de l’assistant(e) familial(e) : ${assistant}`, 10, y);
  

  y += 12;
  pdf.text(`Nom / Prénom de l’enfant : ${enfantPrincipal}`, 10, y);
  

  y += 10;

  const tableX = 10;
  const tableY = y;
  const colDate = 28;
  const colDetail = 122;
  const colMontant = 38;
  const headerH = 10;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.rect(tableX, tableY, colDate, headerH);
  pdf.rect(tableX + colDate, tableY, colDetail, headerH);
  pdf.rect(tableX + colDate + colDetail, tableY, colMontant, headerH);

  drawCellText(pdf, "Date", tableX, tableY, colDate, headerH, "center");
  drawCellText(pdf, "Détail de la facture", tableX + colDate, tableY, colDetail, headerH, "center");
  drawCellText(pdf, "Montant", tableX + colDate + colDetail, tableY, colMontant, headerH, "center");

  let rowY = tableY + headerH;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.3);

  const maxRowsHeight = 62;
  const stopY = rowY + maxRowsHeight;

  for (const item of fraisLoisirs) {
    const detailText = [item.type, item.lieu, item.objet].filter(Boolean).join(" - ");
    const dateLines = pdf.splitTextToSize(formatDateFr(item.date), colDate - 4);
    const detailLines = pdf.splitTextToSize(detailText, colDetail - 4);
    const montantLines = pdf.splitTextToSize(`${Number(item.montant || 0).toFixed(2).replace(".", ",")} €`, colMontant - 4);

    const maxLines = Math.max(dateLines.length, detailLines.length, montantLines.length);
    const rowH = Math.max(14, maxLines * 4.2 + 5);

    if (rowY + rowH > stopY) break;

    pdf.rect(tableX, rowY, colDate, rowH);
    pdf.rect(tableX + colDate, rowY, colDetail, rowH);
    pdf.rect(tableX + colDate + colDetail, rowY, colMontant, rowH);

   drawCellText(pdf, dateLines, tableX, rowY, colDate, rowH, "center");
drawCellText(pdf, detailLines, tableX + colDate, rowY, colDetail, rowH, "center");
drawCellText(pdf, montantLines, tableX + colDate + colDetail, rowY, colMontant, rowH, "center");

    rowY += rowH;
  }

  while (rowY < stopY) {
    const blankH = Math.min(18, stopY - rowY);
    pdf.rect(tableX, rowY, colDate, blankH);
    pdf.rect(tableX + colDate, rowY, colDetail, blankH);
    pdf.rect(tableX + colDate + colDetail, rowY, colMontant, blankH);
    rowY += blankH;
  }

 const bottomBlockY = stopY + 1;
  const totalBoxX = tableX + colDate + colDetail;
  const totalBoxY = bottomBlockY;
  const totalBoxW = colMontant;
  const totalBoxH = 24;

  pdf.rect(totalBoxX, totalBoxY, totalBoxW, totalBoxH);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("Total Factures", totalBoxX + totalBoxW / 2, totalBoxY + 8, { align: "center" });
  pdf.setFontSize(10);
  pdf.text(`${total.toFixed(2).replace(".", ",")} €`, totalBoxX + totalBoxW / 2, totalBoxY + 18, { align: "center" });

  const certifY = bottomBlockY + 10;

pdf.setFont("helvetica", "normal");
pdf.setFontSize(10);
pdf.text(`Certifié exact, le ${dateCreationPdf}`, 12, certifY);

pdf.setFont("helvetica", "bold");
pdf.text("Signature de l’assistant(e) familial(e) :", 12, certifY + 12);

if (signatureData && isImageDataUrl(signatureData)) {
  try {
    const convertedSignature = await convertImageDataUrlToJpeg(signatureData, 0.9);
    pdf.addImage(convertedSignature.dataUrl, "JPEG", 12, certifY + 14, 52, 15);
  } catch (error) {
    console.error("Erreur ajout signature PDF loisirs :", error);
  }
}

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.6);
  pdf.text("Justificatif joint au PDF", 10, 274);

 const cadreX = 108;
const cadreY = 214;
const cadreW = 90;
const cadreH = 44;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.2);
  pdf.rect(cadreX, cadreY, cadreW, cadreH);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("BON A PAYER", cadreX + cadreW / 2, cadreY + 8, { align: "center" });

  pdf.line(cadreX, cadreY + 12, cadreX + cadreW, cadreY + 12);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Date : ............................................................", cadreX + 4, cadreY + 18);
pdf.text("Nom du responsable : ..........................................", cadreX + 4, cadreY + 26);
pdf.text("Imputation analytique : .......................................", cadreX + 4, cadreY + 34);
pdf.text("Signature : ", cadreX + 4, cadreY + 42);

  await ajouterImagesAuPdf(pdf);
  addEasyfraisFooter(pdf);

const fileName = generateFileName("Frais_loisirs", mois, assistant);

try {
  await savePdfToHistory(pdf, {
    nom: fileName,
    mois: formatMonthLabel(mois),
    type: "Sports et loisirs"
  });
} catch (error) {
  console.error("Erreur enregistrement historique loisirs :", error);
}

pdf.save(fileName);
showToast("PDF généré et enregistré dans l’historique");
}

async function loadProfileLoisirs() {
  if (!currentUser) return;

  try {
    const profileRef = doc(db, "users", currentUser.uid, "profile", "main");
    const snap = await getDoc(profileRef);

    if (!snap.exists()) {
      currentProfile = null;
      return;
    }

    const data = snap.data() || {};
    currentProfile = data;

    const profileName = String(data.fullName || "").trim();
    const children = String(data.childrenList || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    const assistantInput = $("assistantNomLoisirs");
    if (assistantInput && !assistantInput.value.trim() && profileName) {
      assistantInput.value = profileName;
      localStorage.setItem(`assistantNomLoisirs_${uid}`, assistantInput.value.trim());
    }

    const datalist = $("profileChildrenList");
    if (datalist) {
      datalist.innerHTML = "";
      children.forEach((child) => {
        const option = document.createElement("option");
        option.value = child;
        datalist.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Erreur chargement profil loisirs :", error);
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("btnAjouterLoisirs")?.addEventListener("click", ajouterFrais);
  $("btnResetLoisirs")?.addEventListener("click", resetForm);
  $("btnPdfLoisirs")?.addEventListener("click", genererPDF);
  $("btnViderLoisirs")?.addEventListener("click", viderListe);
  $("justificatifLoisirs")?.addEventListener("change", updateNomJustificatif);

  $("assistantNomLoisirs")?.addEventListener("input", async () => {

  localStorage.setItem(
    `assistantNomLoisirs_${uid}`,
    $("assistantNomLoisirs").value.trim()
  );

  await saveData();
});

 $("moisLoisirs")?.addEventListener("change", async () => {

  localStorage.setItem(
    `moisLoisirs_${uid}`,
    $("moisLoisirs").value
  );

  await saveData();
});
}

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUser = user;
  uid = user.uid;

  // 🔒 Vérification PIN
  if (!ensureGlobalPinExists()) {
    window.location.href = "index.html";
    return;
  }

  const ok = await requireGlobalPin({
    title: "Accès au module loisirs",
    message: "Entre ton code PIN pour accéder à ce module."
  });

  if (!ok) {
    window.location.href = "index.html";
    return;
  }

  // Chargement valeurs locales
  $("assistantNomLoisirs").value =
    localStorage.getItem(`assistantNomLoisirs_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  $("moisLoisirs").value =
    localStorage.getItem(`moisLoisirs_${uid}`) ||
    getDefaultMonthValue();

 await loadProfileLoisirs();
await loadData();

  bindEvents();
  render();
});