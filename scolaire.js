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
  if ($("classeScolaire")) $("classeScolaire").value = "";
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
    classe: $("classeScolaire")?.value.trim() || "",
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

async function ajouterImagesAuPdf(pdf, items = fraisScolaires) {
 const sortedPdf = [...items].sort(
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


// Fond reproduit depuis le formulaire original Les Nids, logo compris.
function drawScolaireModel(pdf, background, items, assistant, dateCreation, signature) {
  const groups = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.enfant, item.classe || ""]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let firstPage = true;
  const rowEdges = [85.8, 100.6, 116.3, 132.1, 147.9, 164.5, 180.2];
  function fillLine(text, x, y, width) {
    if (!text) return;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(x, y - 4, width, 5.5, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const size = Math.min(10, 10 * width / Math.max(width, pdf.getTextWidth(text)));
    pdf.setFontSize(size);
    pdf.text(text, x, y);
  }
  for (const group of groups.values()) {
    const rows = [];
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    for (const item of group) {
      const detail = [item.type, item.ecole, item.objet].filter(Boolean).join(" - ");
      const lines = pdf.splitTextToSize(detail, 98);
      for (let i = 0; i < lines.length; i += 3) {
        rows.push({ item, lines: lines.slice(i, i + 3), first: i === 0 });
      }
    }
    for (let offset = 0; offset < rows.length; offset += 6) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      pdf.addImage(background, "PNG", 0, 0, 210, 297, "scolaire-modele", "FAST");
      fillLine(assistant, 100, 52.8, 84);
      fillLine(group[0].enfant, 72, 63.1, 114);
      fillLine(group[0].classe || "", 69, 69.6, 117);
      fillLine(dateCreation, 54, 238.7, 36);
      let totalCents = 0;
      rows.slice(offset, offset + 6).forEach((row, index) => {
        const top = rowEdges[index];
        const bottom = rowEdges[index + 1];
        pdf.setFontSize(9);
        const baseline = (top + bottom) / 2 + 1;
        pdf.text(row.first ? formatDateFr(row.item.date) : "(suite)", 33, baseline, { align: "center" });
        pdf.text(row.lines, 45, baseline - (row.lines.length - 1) * 1.6, { lineHeightFactor: 1 });
        if (row.first) {
          const cents = Math.round(Number(row.item.montant) * 100);
          totalCents += cents;
          pdf.text(`${(cents / 100).toFixed(2).replace(".", ",")} €`, 185, baseline, { align: "right" });
        }
      });
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(`${(totalCents / 100).toFixed(2).replace(".", ",")} €`, 167, 192, { align: "center" });
      if (signature) {
        const ratio = Math.min(55 / signature.width, 17 / signature.height);
        pdf.addImage(signature.dataUrl, "JPEG", 25, 250, signature.width * ratio, signature.height * ratio);
      }
    }
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
  const items = fraisScolaires
    .filter((item) => !mois || item.date.startsWith(`${mois}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) {
    alert("Aucune dépense pour le mois sélectionné.");
    return;
  }
  const background = "data:image/png;base64,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";
  let signature = null;
  const signatureData = getProfileSignatureData();
  if (signatureData && isImageDataUrl(signatureData)) {
    try {
      signature = await convertImageDataUrlToJpeg(signatureData);
    } catch (error) {
      console.error("Erreur signature scolaire :", error);
    }
  }
  drawScolaireModel(pdf, background, items, assistant, new Date().toLocaleDateString("fr-FR"), signature);
  await ajouterImagesAuPdf(pdf, items);

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
