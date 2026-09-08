import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
import { auth, db, storage } from "./firebase-config.js";
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

  if (!date || !enfant || !objet || Number.isNaN(montant) || montant <= 0) {
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

function getLoisirsItemsForMonth() {
  const mois = $("moisLoisirs")?.value || "";
  return fraisLoisirs.filter(item => !mois || String(item.date || "").startsWith(`${mois}-`));
}

function render() {
  const items = getLoisirsItemsForMonth();
  const body = $("loisirsBody");
  body.innerHTML = "";

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    $("totalLignesLoisirs").textContent = "0";
    $("totalMontantLoisirs").textContent = "0,00 €";
    return;
  }
  

  const sorted = [...items].sort(
  (a, b) => new Date(b.date) - new Date(a.date)
);

sorted.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml([item.type, item.lieu, item.objet].filter(Boolean).join(" - "))}</td>
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

  $("totalLignesLoisirs").textContent = String(items.length);
  $("totalMontantLoisirs").textContent = `${items.reduce((sum, item) => sum + Number(item.montant || 0), 0).toFixed(2).replace(".", ",")} €`;
}

async function convertImageDataUrlToJpeg(dataUrl, quality = 0.88) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    if (/^https?:\/\//i.test(dataUrl)) img.crossOrigin = "anonymous";
    img.src = dataUrl;
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

async function ajouterImagesAuPdf(pdf, items = fraisLoisirs) {
  for (const item of items) {
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

async function getProfileSignatureData() {
  const candidates = [];
  let storageError = null;
  // Même emplacement que l’aperçu de signature de la page Profil.
  try {
    candidates.push(await getDownloadURL(ref(storage, `users/${uid}/profileSignatureData_${uid}`)));
  } catch (error) {
    if (error.code !== "storage/object-not-found") storageError = error;
  }
  candidates.push(
    currentProfile?.signatureUrl,
    currentProfile?.signatureData,
    localStorage.getItem(`profileSignatureData_${uid}`)
  );
  let lastError = storageError;
  for (const source of new Set(candidates.filter(Boolean))) {
    try {
      if (isImageDataUrl(source)) return source;
      if (!/^https?:\/\//i.test(source)) continue;
      const response = await fetch(source);
      if (!response.ok) throw new Error("Téléchargement de la signature impossible");
      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) throw new Error("Format de signature invalide");
      return await fileToBase64(blob);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return "";
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

function drawLoisirsModel(pdf, background, items, assistant, dateCreation, signature) {
  const groups = new Map();
  for (const item of items) {
    const key = String(item.enfant || "");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  let firstPage = true;
  const rowEdges = [115.63, 130.4, 146.27, 162.19, 178.2, 194.24, 210.25];
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
      const detail = [item.type, item.lieu, item.objet].filter(Boolean).join(" - ");
      const lines = pdf.splitTextToSize(detail, 98);
      for (let i = 0; i < lines.length; i += 3) {
        rows.push({ item, lines: lines.slice(i, i + 3), first: i === 0 });
      }
    }
    for (let offset = 0; offset < rows.length; offset += 6) {
      if (!firstPage) pdf.addPage();
      firstPage = false;
      pdf.addImage(background, "PNG", 0, 0, 210, 297, "loisirs-modele", "FAST");
      fillLine(assistant, 95, 87.6, 90);
      fillLine(group[0].enfant, 69, 98, 116);
      fillLine(dateCreation, 51, 219.5, 37);
      let totalCents = 0;
      rows.slice(offset, offset + 6).forEach((row, index) => {
        const top = rowEdges[index];
        const bottom = rowEdges[index + 1];
        pdf.setFontSize(9);
        const baseline = (top + bottom) / 2 + 1;
        pdf.text(row.first ? formatDateFr(row.item.date) : "(suite)", 32, baseline, { align: "center" });
        pdf.text(row.lines, 46, baseline - (row.lines.length - 1) * 1.6, { lineHeightFactor: 1 });
        if (row.first) {
          const cents = Math.round(Number(row.item.montant) * 100);
          totalCents += cents;
          pdf.text(`${(cents / 100).toFixed(2).replace(".", ",")} €`, 187, baseline, { align: "right" });
        }
      });
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(`${(totalCents / 100).toFixed(2).replace(".", ",")} €`, 169, 228, { align: "center" });
      if (signature) {
        const ratio = Math.min(75 / signature.width, 30 / signature.height);
        pdf.addImage(signature.dataUrl, "JPEG", 22, 231, signature.width * ratio, signature.height * ratio);
      }
    }
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
  const mois = $("moisLoisirs").value || "";
  const items = getLoisirsItemsForMonth().sort((a,b) => a.date.localeCompare(b.date));
  if (!items.length) {
    alert("Aucune dépense pour le mois sélectionné.");
    return;
  }
  await loadProfileLoisirs();
  let signature = null;
  try {
    const data = await getProfileSignatureData();
    if (!data) {
      alert("Aucune image de signature trouvée dans votre profil. Ajoutez-la dans Profil pour obtenir un PDF signé.");
      return;
    }
    signature = await convertImageDataUrlToJpeg(data);
  } catch (error) {
    console.error("Erreur signature loisirs :", error);
    alert("Impossible de charger votre signature. Vérifiez votre connexion puis réessayez.");
    return;
  }
  const background = "data:image/png;base64,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";
  drawLoisirsModel(pdf, background, items, assistant, new Date().toLocaleDateString("fr-FR"), signature);
  await ajouterImagesAuPdf(pdf, items);

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

  render();
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