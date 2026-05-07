import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
import { saveModuleData, loadModuleData } from "./cloud-sync.js";

let fraisScolaires = [];
let uid = null;
let currentUser = null;
let currentProfile = null;
let eventsBound = false;

const $ = (id) => document.getElementById(id);

function getStorageKey() {
  return `scolaire_${uid}`;
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
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisScolaires));

  await saveModuleData(uid, "scolaire", {
    fraisScolaires,
    assistantNom: $("assistantNomScolaire")?.value || "",
    mois: $("moisScolaire")?.value || ""
  });
}

async function loadData() {
  try {
    const cloud = await loadModuleData(uid, "scolaire");

    if (cloud?.fraisScolaires) {
      fraisScolaires = cloud.fraisScolaires;
    } else {
      fraisScolaires = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
    }

    if (
      cloud?.assistantNom &&
      $("assistantNomScolaire") &&
      !$("assistantNomScolaire").value.trim()
    ) {
      $("assistantNomScolaire").value = cloud.assistantNom;
    }

    if (
      cloud?.mois &&
      $("moisScolaire") &&
      !$("moisScolaire").value
    ) {
      $("moisScolaire").value = cloud.mois;
    }
  } catch (error) {
    console.error("Erreur chargement cloud scolaire :", error);
    fraisScolaires = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
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
  const file = $("justificatifScolaire")?.files?.[0];
  const label = $("nomJustificatifScolaire");
  if (label) {
    label.textContent = file ? `Fichier sélectionné : ${file.name}` : "";
  }
}

function resetForm() {
  if ($("dateScolaire")) $("dateScolaire").value = "";
  if ($("enfantScolaire")) $("enfantScolaire").value = "";
  if ($("typeScolaire")) $("typeScolaire").value = "";
  if ($("ecoleScolaire")) $("ecoleScolaire").value = "";
  if ($("objetScolaire")) $("objetScolaire").value = "";
  if ($("montantScolaire")) $("montantScolaire").value = "";
  if ($("justificatifScolaire")) $("justificatifScolaire").value = "";
  if ($("nomJustificatifScolaire")) $("nomJustificatifScolaire").textContent = "";
}

function getTotal() {
  return fraisScolaires.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function showToast(message) {
  const toast = $("toastScolaire") || $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

async function ajouterFrais() {
  const date = $("dateScolaire")?.value || "";
  const enfant = $("enfantScolaire")?.value.trim() || "";
  const type = $("typeScolaire")?.value || "";
  const ecole = $("ecoleScolaire")?.value.trim() || "";
  const objet = $("objetScolaire")?.value.trim() || "";
  const montant = parseFloat(($("montantScolaire")?.value || "").replace(",", "."));
  const file = $("justificatifScolaire")?.files?.[0] || null;

  if (!date || !enfant || !type || !ecole || !objet || Number.isNaN(montant) || montant <= 0) {
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
      console.error("Erreur lecture justificatif scolaire :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  fraisScolaires.push({
    id: Date.now(),
    date,
    enfant,
    type,
    ecole,
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
  const item = fraisScolaires.find((x) => x.id === id);

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
  fraisScolaires = fraisScolaires.filter((x) => x.id !== id);
  await saveData();
  render();
  showToast("Dépense supprimée");
}

async function viderListe() {
  if (!fraisScolaires.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisScolaires = [];
  await saveData();
  render();
  showToast("Liste vidée");
}

function render() {
  const body = $("scolaireBody");
  if (!body) return;

  body.innerHTML = "";

  if (!fraisScolaires.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    if ($("totalLignesScolaire")) $("totalLignesScolaire").textContent = "0";
    if ($("totalMontantScolaire")) $("totalMontantScolaire").textContent = "0,00 €";
    return;
  }

  const sorted = [...fraisScolaires].sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);

sorted.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.ecole)}</td>
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

  if ($("totalLignesScolaire")) $("totalLignesScolaire").textContent = String(fraisScolaires.length);
  if ($("totalMontantScolaire")) {
    $("totalMontantScolaire").textContent = `${getTotal().toFixed(2).replace(".", ",")} €`;
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
 const sortedPdf = [...fraisScolaires].sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);

for (const item of sortedPdf) {

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

      const meta = `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.ecole} - ${item.objet}`;
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
    console.error("Erreur ajout image PDF scolaire :", error);
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
    console.error("Erreur logo PDF scolaire :", error);
  }
}


 async function genererPDF() {

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (!fraisScolaires.length) {
    alert("Aucune dépense à exporter.");
    return;
  }


  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("portrait", "mm", "a4");

  const assistant = $("assistantNomScolaire")?.value.trim() || currentProfile?.fullName || "-";
  const mois = $("moisScolaire")?.value || "";
  const total = getTotal();
  const dateCreation = new Date().toLocaleDateString("fr-FR");
  const signature = getProfileSignatureData();

  await drawLogo(pdf);

  let y = 15;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("DEMANDE DE REMBOURSEMENT", 105, y, { align: "center" });
  pdf.text("FRAIS SCOLAIRES", 105, y + 10, { align: "center" });

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
const sortedPdf = [...fraisScolaires].sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);
 for (const item of sortedPdf) {
    const detail = [item.type, item.ecole, item.objet].filter(Boolean).join(" - ");

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
      console.error("Erreur ajout signature PDF scolaire :", error);
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
 pdf.text("Date : ............................................................", bx + 4, by + 18);
pdf.text("Nom du responsable : ..........................................", bx + 4, by + 26);
pdf.text("Imputation analytique : .......................................", bx + 4, by + 34);
pdf.text("Signature : ", bx + 4, by + 42);

  await ajouterImagesAuPdf(pdf);
  addEasyfraisFooter(pdf);

 function cleanFileName(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
}


const fileName = generateFileName("Frais_scolaires", mois, assistant);

  try {
    await savePdfToHistory(pdf, {
      nom: fileName,
      mois: formatMonthLabel(mois),
      type: "Scolaire"
    });
  } catch (error) {
    console.error("Erreur historique scolaire :", error);
  }

  pdf.save(fileName);
  showToast("PDF généré et enregistré dans l’historique");
}

async function loadProfileScolaire() {
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

    const assistantInput = $("assistantNomScolaire");
    if (assistantInput && !assistantInput.value.trim() && profileName) {
      assistantInput.value = profileName;
      localStorage.setItem(`assistantNomScolaire_${uid}`, assistantInput.value.trim());
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
    console.error("Erreur chargement profil scolaire :", error);
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("btnAjouterScolaire")?.addEventListener("click", ajouterFrais);
  $("btnResetScolaire")?.addEventListener("click", resetForm);
  $("btnPdfScolaire")?.addEventListener("click", genererPDF);
  $("btnViderScolaire")?.addEventListener("click", viderListe);
  $("justificatifScolaire")?.addEventListener("change", updateNomJustificatif);

  $("assistantNomScolaire")?.addEventListener("input", async () => {

  localStorage.setItem(
    `assistantNomScolaire_${uid}`,
    $("assistantNomScolaire").value.trim()
  );

  await saveData();
});

  $("moisScolaire")?.addEventListener("change", async () => {

  localStorage.setItem(
    `moisScolaire_${uid}`,
    $("moisScolaire").value
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

  if (!ensureGlobalPinExists()) {
    window.location.href = "index.html";
    return;
  }

  const ok = await requireGlobalPin({
    title: "Accès au module scolaire",
    message: "Entre ton code PIN pour accéder à ce module."
  });

  if (!ok) {
    window.location.href = "index.html";
    return;
  }

  if ($("assistantNomScolaire")) {
    $("assistantNomScolaire").value =
      localStorage.getItem(`assistantNomScolaire_${uid}`) ||
      localStorage.getItem(`assistantNom_${uid}`) ||
      "";
  }

  if ($("moisScolaire")) {
    $("moisScolaire").value =
      localStorage.getItem(`moisScolaire_${uid}`) ||
      getDefaultMonthValue();
  }

  await loadProfileScolaire();
  await loadData();

  bindEvents();
  render();
});
