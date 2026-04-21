import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

let fraisFormation = [];
let uid = null;
let currentUser = null;
let currentProfile = null;
let eventsBound = false;

const $ = (id) => document.getElementById(id);

function getStorageKey() {
  return `formation_${uid}`;
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

function saveData() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisFormation));
}

function loadData() {
  fraisFormation = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
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
  const input = $("justificatifFormation");
  const label = $("nomJustificatifFormation");
  const file = input?.files?.[0];
  if (label) {
    label.textContent = file ? `Fichier sélectionné : ${file.name}` : "";
  }
}

function resetForm() {
  if ($("dateFormation")) $("dateFormation").value = "";
  if ($("organismeFormation")) $("organismeFormation").value = "";
  if ($("typeFormation")) $("typeFormation").value = "";
  if ($("lieuFormation")) $("lieuFormation").value = "";
  if ($("objetFormation")) $("objetFormation").value = "";
  if ($("montantFormation")) $("montantFormation").value = "";
  if ($("justificatifFormation")) $("justificatifFormation").value = "";
  if ($("nomJustificatifFormation")) $("nomJustificatifFormation").textContent = "";
}

function getTotal() {
  return fraisFormation.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function showToast(message) {
  const toast = $("toastFormation") || $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

async function ajouterFrais() {
  const date = $("dateFormation")?.value || "";
  const organisme = $("organismeFormation")?.value.trim() || "";
  const type = $("typeFormation")?.value || "";
  const lieu = $("lieuFormation")?.value.trim() || "";
  const objet = $("objetFormation")?.value.trim() || "";
  const montant = parseFloat(($("montantFormation")?.value || "").replace(",", "."));
  const file = $("justificatifFormation")?.files?.[0] || null;

  if (!date || !organisme || !type || !lieu || !objet || Number.isNaN(montant) || montant <= 0) {
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
      console.error("Erreur lecture justificatif formation :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  fraisFormation.push({
    id: Date.now(),
    date,
    organisme,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatif
  });

  saveData();
  render();
  resetForm();
  showToast("Dépense ajoutée");
}

function voirJustificatif(id) {
  const item = fraisFormation.find((x) => x.id === id);

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

function supprimerFrais(id) {
  fraisFormation = fraisFormation.filter((x) => x.id !== id);
  saveData();
  render();
  showToast("Dépense supprimée");
}

function viderListe() {
  if (!fraisFormation.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisFormation = [];
  saveData();
  render();
  showToast("Liste vidée");
}

function render() {
  const body = $("formationBody");
  if (!body) return;

  body.innerHTML = "";

  if (!fraisFormation.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    if ($("totalLignesFormation")) $("totalLignesFormation").textContent = "0";
    if ($("totalMontantFormation")) $("totalMontantFormation").textContent = "0,00 €";
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

  if ($("totalLignesFormation")) $("totalLignesFormation").textContent = String(fraisFormation.length);
  if ($("totalMontantFormation")) {
    $("totalMontantFormation").textContent = `${getTotal().toFixed(2).replace(".", ",")} €`;
  }
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
  for (const item of fraisFormation) {
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
      const meta = `${formatDateFr(item.date)} - ${item.type} - ${item.organisme} - ${item.lieu} - ${item.objet}`;
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
      console.error("Erreur ajout image PDF formation :", error);
    }
  }
}

function drawCellText(pdf, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  const lineHeight = pdf.getFontSize() * 0.35;
  let currentY = y + (height - lines.length * lineHeight) / 2 + 2;

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

function getProfileLogoData() {
  return localStorage.getItem(`profileLogoData_${uid}`) || "";
}

function getProfileSignatureData() {
  return localStorage.getItem(`profileSignatureData_${uid}`) || "";
}

async function drawLogo(pdf) {
  const logoData = getProfileLogoData();
  if (!logoData || !isImageDataUrl(logoData)) return;

  try {
    const converted = await convertImageDataUrlToJpeg(logoData, 0.9);

    let w = converted.width;
    let h = converted.height;

    const ratio = Math.min(30 / w, 20 / h, 1);
    w *= ratio;
    h *= ratio;

    pdf.addImage(converted.dataUrl, "JPEG", 10, 8, w, h);
  } catch (error) {
    console.error("Erreur logo PDF formation :", error);
  }
}

async function genererPDF() {
  if (!fraisFormation.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("portrait", "mm", "a4");

  const assistant = $("assistantNomFormation")?.value.trim() || currentProfile?.fullName || "-";
  const mois = $("moisFormation")?.value || "";
  const total = getTotal();
  const dateCreation = new Date().toLocaleDateString("fr-FR");
  const signature = getProfileSignatureData();

  await drawLogo(pdf);

  let y = 15;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("DEMANDE DE REMBOURSEMENT", 105, y, { align: "center" });
  pdf.text("FRAIS DE FORMATION", 105, y + 10, { align: "center" });

  pdf.line(60, y + 2, 150, y + 2);
  pdf.line(80, y + 12, 130, y + 12);

  y += 25;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  pdf.text(`Nom / Prénom : ${assistant}`, 10, y);
  y += 8;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  const tableX = 10;
  const colDate = 28;
  const colDetail = 122;
  const colMontant = 38;
  const headerH = 10;

  pdf.setFont("helvetica", "bold");

  pdf.rect(tableX, y, colDate, headerH);
  pdf.rect(tableX + colDate, y, colDetail, headerH);
  pdf.rect(tableX + colDate + colDetail, y, colMontant, headerH);

  drawCellText(pdf, "Date", tableX, y, colDate, headerH, "center");
  drawCellText(pdf, "Détail de la formation", tableX + colDate, y, colDetail, headerH, "center");
  drawCellText(pdf, "Montant", tableX + colDate + colDetail, y, colMontant, headerH, "center");

  let rowY = y + headerH;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.3);

  const stopY = rowY + 80;

  for (const item of fraisFormation) {
    const detail = [item.type, item.organisme, item.lieu, item.objet].filter(Boolean).join(" - ");

    const dateLines = pdf.splitTextToSize(formatDateFr(item.date), colDate - 4);
    const detailLines = pdf.splitTextToSize(detail || "-", colDetail - 4);
    const montantLines = pdf.splitTextToSize(
      `${item.montant.toFixed(2).replace(".", ",")} €`,
      colMontant - 4
    );

    const maxLines = Math.max(dateLines.length, detailLines.length, montantLines.length);
    const rowH = Math.max(14, maxLines * 4 + 6);

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
    const h = Math.min(18, stopY - rowY);

    pdf.rect(tableX, rowY, colDate, h);
    pdf.rect(tableX + colDate, rowY, colDetail, h);
    pdf.rect(tableX + colDate + colDetail, rowY, colMontant, h);

    rowY += h;
  }

  const totalX = tableX + colDate + colDetail;

  pdf.rect(totalX, stopY + 2, colMontant, 24);
  pdf.setFont("helvetica", "bold");
  pdf.text("Total Frais", totalX + colMontant / 2, stopY + 10, { align: "center" });
  pdf.text(`${total.toFixed(2).replace(".", ",")} €`, totalX + colMontant / 2, stopY + 20, { align: "center" });

  const certifY = stopY + 10;

  pdf.setFont("helvetica", "normal");
  pdf.text(`Certifié exact, le ${dateCreation}`, 10, certifY);

  pdf.setFont("helvetica", "bold");
  pdf.text("Signature :", 10, certifY + 9);

  if (signature && isImageDataUrl(signature)) {
    try {
      const img = await convertImageDataUrlToJpeg(signature);
      pdf.addImage(img.dataUrl, "JPEG", 10, certifY + 11, 50, 15);
    } catch (error) {
      console.error("Erreur ajout signature PDF formation :", error);
    }
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.6);
  pdf.text("Justificatif joint au PDF", 10, 268);

  const bx = 108;
  const by = 228;

  pdf.rect(bx, by, 90, 44);
  pdf.setFont("helvetica", "bold");
  pdf.text("BON A PAYER", bx + 45, by + 8, { align: "center" });

  pdf.line(bx, by + 12, bx + 90, by + 12);

  pdf.setFont("helvetica", "normal");
  pdf.text("Date : ................................", bx + 4, by + 20);
  pdf.text("Responsable : ........................", bx + 4, by + 28);
  pdf.text("Signature : ", bx + 4, by + 36);

  await ajouterImagesAuPdf(pdf);
  addEasyfraisFooter(pdf);

const fileName = generateFileName("Frais_formation", mois, assistant);

  try {
    await savePdfToHistory(pdf, {
      nom: fileName,
      mois: formatMonthLabel(mois),
      type: "Formation"
    });
  } catch (error) {
    console.error("Erreur historique formation :", error);
  }

  pdf.save(fileName);
  showToast("PDF généré et enregistré dans l’historique");
}

async function loadProfileFormation() {
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

    const assistantInput = $("assistantNomFormation");
    if (assistantInput && !assistantInput.value.trim() && profileName) {
      assistantInput.value = profileName;
      localStorage.setItem(`assistantNomFormation_${uid}`, assistantInput.value.trim());
    }
  } catch (error) {
    console.error("Erreur chargement profil formation :", error);
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("btnAjouterFormation")?.addEventListener("click", ajouterFrais);
  $("btnResetFormation")?.addEventListener("click", resetForm);
  $("btnPdfFormation")?.addEventListener("click", genererPDF);
  $("btnViderFormation")?.addEventListener("click", viderListe);
  $("justificatifFormation")?.addEventListener("change", updateNomJustificatif);

  $("assistantNomFormation")?.addEventListener("input", () => {
    localStorage.setItem(`assistantNomFormation_${uid}`, $("assistantNomFormation").value.trim());
  });

  $("moisFormation")?.addEventListener("change", () => {
    localStorage.setItem(`moisFormation_${uid}`, $("moisFormation").value);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUser = user;
  uid = user.uid;

  if ($("assistantNomFormation")) {
    $("assistantNomFormation").value =
      localStorage.getItem(`assistantNomFormation_${uid}`) ||
      localStorage.getItem(`assistantNom_${uid}`) ||
      "";
  }

  if ($("moisFormation")) {
    $("moisFormation").value =
      localStorage.getItem(`moisFormation_${uid}`) || getDefaultMonthValue();
  }

  loadData();
  bindEvents();
  render();
  await loadProfileFormation();
});