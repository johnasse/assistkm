import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

let fraisNoel = [];
let uid = null;
let currentUser = null;
let currentProfile = null;
let eventsBound = false;

const $ = (id) => document.getElementById(id);

function getStorageKey() {
  return `noel_${uid}`;
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
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisNoel));
}

function loadData() {
  fraisNoel = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
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
  const input = $("justificatifNoel");
  const label = $("nomJustificatifNoel");
  const file = input?.files?.[0];
  if (label) {
    label.textContent = file ? `Fichier sélectionné : ${file.name}` : "";
  }
}

function resetForm() {
  if ($("dateNoel")) $("dateNoel").value = "";
  if ($("enfantNoel")) $("enfantNoel").value = "";
  if ($("typeNoel")) $("typeNoel").value = "";
  if ($("magasinNoel")) $("magasinNoel").value = "";
  if ($("objetNoel")) $("objetNoel").value = "";
  if ($("montantNoel")) $("montantNoel").value = "";
  if ($("justificatifNoel")) $("justificatifNoel").value = "";
  if ($("nomJustificatifNoel")) $("nomJustificatifNoel").textContent = "";
}

function getTotal() {
  return fraisNoel.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function showToast(message) {
  const toast = $("toastNoel") || $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

async function ajouterFrais() {
  const date = $("dateNoel")?.value || "";
  const enfant = $("enfantNoel")?.value.trim() || "";
  const type = $("typeNoel")?.value || "";
  const magasin = $("magasinNoel")?.value.trim() || "";
  const objet = $("objetNoel")?.value.trim() || "";
  const montant = parseFloat(($("montantNoel")?.value || "").replace(",", "."));
  const file = $("justificatifNoel")?.files?.[0] || null;

  if (!date || !enfant || !type || !magasin || !objet || Number.isNaN(montant) || montant <= 0) {
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
      console.error("Erreur lecture justificatif Noël :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  fraisNoel.push({
    id: Date.now(),
    date,
    enfant,
    type,
    magasin,
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
  const item = fraisNoel.find((x) => x.id === id);

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
  fraisNoel = fraisNoel.filter((x) => x.id !== id);
  saveData();
  render();
  showToast("Dépense supprimée");
}

function viderListe() {
  if (!fraisNoel.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisNoel = [];
  saveData();
  render();
  showToast("Liste vidée");
}

function render() {
  const body = $("noelBody");
  if (!body) return;

  body.innerHTML = "";

  if (!fraisNoel.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    if ($("totalLignesNoel")) $("totalLignesNoel").textContent = "0";
    if ($("totalMontantNoel")) $("totalMontantNoel").textContent = "0,00 €";
    return;
  }

  fraisNoel.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.magasin)}</td>
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

  if ($("totalLignesNoel")) $("totalLignesNoel").textContent = String(fraisNoel.length);
  if ($("totalMontantNoel")) {
    $("totalMontantNoel").textContent = `${getTotal().toFixed(2).replace(".", ",")} €`;
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
  for (const item of fraisNoel) {
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

      const meta = `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.magasin} - ${item.objet}`;
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
      console.error("Erreur ajout image PDF Noël :", error);
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
    console.error("Erreur logo PDF Noël :", error);
  }
}

async function genererPDF() {
  if (!fraisNoel.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("portrait", "mm", "a4");

  const assistant = $("assistantNomNoel")?.value.trim() || currentProfile?.fullName || "-";
  const mois = $("moisNoel")?.value || "";
  const total = getTotal();
  const dateCreation = new Date().toLocaleDateString("fr-FR");
  const signature = getProfileSignatureData();

  await drawLogo(pdf);

  let y = 15;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("DEMANDE DE REMBOURSEMENT", 105, y, { align: "center" });
  pdf.text("FRAIS DE NOËL", 105, y + 10, { align: "center" });

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

  for (const item of fraisNoel) {
    const detail = [item.type, item.magasin, item.objet].filter(Boolean).join(" - ");

    const dateLines = pdf.splitTextToSize(formatDateFr(item.date), colDate - 4);
    const enfantLines = pdf.splitTextToSize(item.enfant || "-", colEnfant - 4);
    const detailLines = pdf.splitTextToSize(detail || "-", colDetail - 4);
    const montantLines = pdf.splitTextToSize(
      `${item.montant.toFixed(2).replace(".", ",")} €`,
      colMontant - 4
    );

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
  pdf.text(`${total.toFixed(2).replace(".", ",")} €`, totalX + colMontant / 2, stopY + 20, { align: "center" });

  const certifY = stopY + 10;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Certifié exact, le ${dateCreation}`, 10, certifY);

  pdf.setFont("helvetica", "bold");
  pdf.text("Signature de l’assistant(e) familial(e) :", 10, certifY + 9);

  if (signature && isImageDataUrl(signature)) {
    try {
      const img = await convertImageDataUrlToJpeg(signature, 0.9);
      pdf.addImage(img.dataUrl, "JPEG", 10, certifY + 11, 50, 15);
    } catch (error) {
      console.error("Erreur ajout signature PDF Noël :", error);
    }
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.6);
  pdf.text("Justificatif joint au PDF", 10, 268);

  const bx = 108;
  const by = 228;
  const bw = 90;
  const bh = 44;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.2);
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

  await ajouterImagesAuPdf(pdf);
  addEasyfraisFooter(pdf);

 const fileName = generateFileName("Frais_noel", mois, assistant);

  try {
    await savePdfToHistory(pdf, {
      nom: fileName,
      mois: formatMonthLabel(mois),
      type: "Noël"
    });
  } catch (error) {
    console.error("Erreur historique Noël :", error);
  }

  pdf.save(fileName);
  showToast("PDF généré et enregistré dans l’historique");
}

async function loadProfileNoel() {
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

    const assistantInput = $("assistantNomNoel");
    if (assistantInput && !assistantInput.value.trim() && profileName) {
      assistantInput.value = profileName;
      localStorage.setItem(`assistantNomNoel_${uid}`, assistantInput.value.trim());
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
    console.error("Erreur chargement profil Noël :", error);
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("btnAjouterNoel")?.addEventListener("click", ajouterFrais);
  $("btnResetNoel")?.addEventListener("click", resetForm);
  $("btnPdfNoel")?.addEventListener("click", genererPDF);
  $("btnViderNoel")?.addEventListener("click", viderListe);
  $("justificatifNoel")?.addEventListener("change", updateNomJustificatif);

  $("assistantNomNoel")?.addEventListener("input", () => {
    localStorage.setItem(`assistantNomNoel_${uid}`, $("assistantNomNoel").value.trim());
  });

  $("moisNoel")?.addEventListener("change", () => {
    localStorage.setItem(`moisNoel_${uid}`, $("moisNoel").value);
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUser = user;
  uid = user.uid;

  if ($("assistantNomNoel")) {
    $("assistantNomNoel").value =
      localStorage.getItem(`assistantNomNoel_${uid}`) ||
      localStorage.getItem(`assistantNom_${uid}`) ||
      "";
  }

  if ($("moisNoel")) {
    $("moisNoel").value =
      localStorage.getItem(`moisNoel_${uid}`) || getDefaultMonthValue();
  }

  loadData();
  bindEvents();
  render();
  await loadProfileNoel();
});