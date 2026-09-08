import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";
import { auth, db, storage } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
import { saveModuleData, loadModuleData } from "./cloud-sync.js";

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

async function saveData() {

  localStorage.setItem(
    getStorageKey(),
    JSON.stringify(fraisNoel)
  );

  await saveModuleData(uid, "noel", {
    fraisNoel,
    assistantNom: $("assistantNomNoel")?.value || "",
    mois: $("moisNoel")?.value || ""
  });
}

async function loadData() {

  try {

    const cloud = await loadModuleData(uid, "noel");

    if (cloud?.fraisNoel) {
      fraisNoel = cloud.fraisNoel;
    } else {
      fraisNoel = JSON.parse(
        localStorage.getItem(getStorageKey()) || "[]"
      );
    }

    if (
      cloud?.assistantNom &&
      $("assistantNomNoel") &&
      !$("assistantNomNoel").value.trim()
    ) {
      $("assistantNomNoel").value = cloud.assistantNom;
    }

    if (
  cloud?.mois &&
  $("moisNoel") &&
  !$("moisNoel").value
) {
      $("moisNoel").value = cloud.mois;
    }

  } catch (error) {

    console.error(
      "Erreur chargement cloud Noël :",
      error
    );

    fraisNoel = JSON.parse(
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

  await saveData();
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

async function supprimerFrais(id) {
  fraisNoel = fraisNoel.filter((x) => x.id !== id);
  await saveData();
  render();
  showToast("Dépense supprimée");
}

async function viderListe() {
  if (!fraisNoel.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisNoel = [];
  await saveData();
  render();
  showToast("Liste vidée");
}

function getNoelItemsForMonth() {
  const mois = $("moisNoel")?.value || "";
  return fraisNoel.filter((item) => !mois || String(item.date || "").startsWith(`${mois}-`));
}

function render() {
  const items = getNoelItemsForMonth();
  const body = $("noelBody");
  if (!body) return;

  body.innerHTML = "";

  if (!items.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    if ($("totalLignesNoel")) $("totalLignesNoel").textContent = "0";
    if ($("totalMontantNoel")) $("totalMontantNoel").textContent = "0,00 €";
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
      <td>${escapeHtml([item.type, item.magasin, item.objet].filter(Boolean).join(" - "))}</td>
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

  if ($("totalLignesNoel")) $("totalLignesNoel").textContent = String(items.length);
  if ($("totalMontantNoel")) {
    $("totalMontantNoel").textContent = `${items.reduce((sum, item) => sum + Number(item.montant || 0), 0).toFixed(2).replace(".", ",")} €`;
  }
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

async function ajouterImagesAuPdf(pdf, items = fraisNoel) {
  for (const item of items) {
    if (!item.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage("a4", "portrait");
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

function drawNoelModel(pdf, background, items, assistant, signature) {
  const edges = [53.936, 60.328, 66.719, 73.08, 79.471, 85.863, 92.255, 98.647, 104.996, 111.388, 117.787, 124.179, 130.571, 136.963, 143.312, 149.704, 156.096, 162.488, 168.89, 175.238];
  const rows = [];
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  for (const item of items) {
    const names = pdf.splitTextToSize(item.enfant || "-", 56);
    const detail = pdf.splitTextToSize([item.type, item.magasin, item.objet].filter(Boolean).join(" - "), 101);
    for (let i = 0; i < Math.max(names.length, detail.length); i++) {
      rows.push({ item, name: names[i] || "", detail: detail[i] || "", first: i === 0 });
    }
  }
  for (let offset = 0; offset < rows.length; offset += 19) {
    if (offset) pdf.addPage("a4", "landscape");
    pdf.addImage(background, "PNG", 0, 0, 297, 210, "noel-modele", "FAST");
    pdf.setFillColor(255, 255, 255);
    pdf.rect(74, 39, 72, 6, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setFontSize(Math.min(11, 11 * 71 / Math.max(71, pdf.getTextWidth(assistant))));
    pdf.text(assistant, 74, 43.7);
    if (signature) {
      pdf.setFontSize(8);
      pdf.text("Signature :", 130, 15);
      const ratio = Math.min(65 / signature.width, 26 / signature.height);
      pdf.addImage(signature.dataUrl, "JPEG", 153, 2, signature.width * ratio, signature.height * ratio);
    }
    let totalCents = 0;
    rows.slice(offset, offset + 19).forEach((row, index) => {
      pdf.setFontSize(9);
      const y = (edges[index] + edges[index + 1]) / 2 + 1;
      pdf.text(row.first ? formatDateFr(row.item.date) : "(suite)", 52.8, y, { align: "center" });
      pdf.text(row.name, 71, y);
      pdf.text(row.detail, 131.5, y);
      if (row.first) {
        const cents = Math.round(Number(row.item.montant) * 100);
        totalCents += cents;
        pdf.text(`${(cents / 100).toFixed(2).replace(".", ",")} €`, 258, y, { align: "right" });
      }
    });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`${(totalCents / 100).toFixed(2).replace(".", ",")} €`, 258, 179.5, { align: "right" });
  }
}

async function genererPDF() {

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (!fraisNoel.length) {
    alert("Aucune dépense à exporter.");
    return;
  }


  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("landscape", "mm", "a4");

  const assistant = $("assistantNomNoel")?.value.trim() || currentProfile?.fullName || "-";
  const mois = $("moisNoel")?.value || "";
  const items = getNoelItemsForMonth()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) {
    alert("Aucune dépense pour le mois sélectionné.");
    return;
  }
  await loadProfileNoel();
  let signature = null;
  try {
    const data = await getProfileSignatureData();
    if (!data) {
      alert("Aucune image de signature trouvée dans votre profil. Ajoutez-la dans Profil pour obtenir un PDF signé.");
      return;
    }
    signature = await convertImageDataUrlToJpeg(data);
  } catch (error) {
    console.error("Erreur signature Noël :", error);
    alert("Impossible de charger votre signature. Vérifiez votre connexion puis réessayez.");
    return;
  }
  const background = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAACDkAAAXRCAMAAACpKiS6AAADAFBMVEX+/v4AAADY2Njn5+gXFheXl5e2trd2d3g1NTampqYmJSbHx8fUK13wkwCGhodXV1dGRkZoaGj2lSb2kh2EMm385Mf869b71Kf98+dtbnH3pkX6zJb73Ld8fYD5xoj4tWb4rFRvcHP3nTW+vsCNjZD5vHaurrCenqD2ojv50ZzLK15/gIL2slvVNmX4wXygnqCPkJLOz9DnigfAv8BgXmHukQGfoKLieJfzytbZR3L55+twbnCQjpCbLmjf3+AhHiLxoSewrrCnLmXrpLnVehj22uL74L2YRFYfHCDQz9CpU0W3LGGAfoDpm7Lus8RQTlGYMWfliKO5YjX1093bVHzzsUv67PHDayuvsLJBPkLULmAwLjHwusvdW4HLcSOzXDzeZIjXQW3dgRHlgZ6RPl2iTE2iMGfgao3okqvg3+BfXGDCLGDgb5DtrcD1wG8vLDDxwc/Rj3iwWkDfhA788N/POWnTfHDPdR/AZzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADhs/x7AAAACXBIWXMAABuvAAAbrwFeGpEcAAC3EUlEQVR4nO396b/jSHbYeYMAARBkF0hmdq6VWVVZW1dP71IvarXckkdSW9JIsiRrl2VLtsfbeDzP/jx//vOJBUBgI3lvRWbeE+f3fVF1kwt4AnGIOAQCQJYBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeLieP316y6ueP32ePVTPV4O7rXEAACTo1Uff/+jDVze++PnTGwf6jx8/evR4cQnPrFev7HIePX706Kvs7Xv1bPD8htebZj59/PjR4w+XGv2haRylAwBAo2ePHj1+bAbC2wqCTx4//uimF7766tHjR4tPPH7kffoqyz569Pjxy+ztMxWK9/jJ9Zd/+PjRV9nzjx89fmQqh08eP/7+6OknLx89fkTlAABQ6NWjx48+/r4ZCG+rHF7eWjlkz1cqh+yZGcU/efno0eNH37b/ekuVw6tnz4Z/PH35+PHjTz75xLT0lsrBRfXJSuVgKxEqBwCAQn4g/eTRrZXDo1srB7Po1SeeZdnzrx6bF7x6a5XD+GjJh48ef2r+/8WjR7fuc7CHXGzl8IjKAQAA46kf3p88vvFoxdNb5zlcrRzs7o4nb7NyGH1+Vzk8f3zL0YrnT+0MSF85LDSafQ4AAJWedIcpnrjh9OmHX3xkJ0u+evbhh8+yJx998YWdVPg0e+JmF3744Yfulc+fffHFR26yofkzODBgFvPRF9//tt2lYJf90RcfPZlXDuZwxquhcnj+7PtffNQdAXj64Rdf+Fmb5t32r2cffvjR0+yZe9G3h9d2L3g+eoE5DPLYzMScVA7Zk1f9p5non5h3mYBtifCRa8irb39oP91VDkOjX330xffdAqkcAAAqmdH7u8M/P7GzJb96nmXmtIKXL80/zdTCxx9l3zWzKB93ZxvYmY3mH25MNi96NV2Mrxye2qU8+mRWOZj9Hb/qKocnn7iPsgP3c7cA8x7/50t/psMXn5rFPntiJkm4T5y+wERphvtPXeSPHo0rh49fmnLhV2bWg1vCFybQj8zyPn3+hXmvOUrxyLS+qxye+0bbpx8/fvSxbwPzHB6aojxtN/u2eN9xAEDSPjFDZjfov3z06JNnnzx69HIYyc2o+vjRR8/tiQafPjFHGEzl8NGjR58+M8+YIfnRp982f/Y79F8+evTymaknzKj9/NPHj7549umjR19MKwczU7Kb52CqiI8/+tQfYHj56NHHzz559PgT/6dZoDu64ULykQ2vNYGHL3j03A7+jz/9tK9YXOXw9JEZ8J90n/Zplj33NZB9vf3fR671n/T7HF59av/36NGjrz4y68vsf6ByeHCKZrexTvn7DgUAUvbc/oh/aXfGP7NjtZ80aXb2f2zKhW6g/9BOLfyuHUTNQP/clh12r8Vz+3h3+sGzR4/N73YzjrsZiR8N8ykst0B7VkdXOTx5/Phjtwfkqd2fYeIw+yk+fPTY7BJxj5ti5plZ1OPHr+zo/zQbv8DsSXjlj4KMP9LtGfnkk09d5fD48Rd9I56bCuN5ZnYovHyefexOEvWrws9zcP9zpYo/uYTK4aHJ660rHDabI3sdAOBt+tj+1jaj4Vd2xDWnIn5kx07zi/xXT8yYagbnT4f99+Yhs8/+6YcfmmH+46FcML5yw60/K9MPsW40d8zPe3MIxOxI8JXD84/s5IRPbdHiX/vqw1fmAfPnS7vIT1x18qmL1hU4oxe8dM+8tJXJQuVgdy48tZ/2vA/Nlz5+xscrd1BjqXL40M6m+L47Q5PK4YHJz13dsNls2/cdDQCkzVzWyO2Of/zo05cvzQ/3j/uxsz//4ombV+AG0a/cbgjDvPzlS3t1Bv9Id8UE/zb79Ev3CaPK4VN7emdwbsVzM3o/6YZy+4jZH9CH9In71JeuWPjUzJIYv8CVDP4qDAuVw7NnH9t9Dv7TfBnx6LGZreFf/mS9cnAr4xO7v4LK4YHJj0PhIPx4RcUeEwACvLJTA8wQ6ucQfBJWDmaMfpZ9152a4AbRYA/Cp3Z+gJ0h4B7whxx85WAW7Z4frgNh5hL0t33oKocn33XzDZ7YX//+yafDu787rRzsHpLxC3zlMBxRCdro5jk8f+wuGv3KzqtcrhwerVUOz78w0y6pHB6gotvjsD+ZyQ77JpPrXL3vCADgBma8fGVG4VdPrKejyuHDR48/ef7I/ezuK4dun4OZAOne9GStcvBP9zMog3f3lYM5ZvLo5VLl8Ks+pJXKwS/+6S2VQ+buWvFJ92l3qRzMzI/HX1E5PEBF7euGtsoPZu+D4MMVxY7KAcCD9uSjZ/1g3g/5VlA5mCe+8Kc3ukHUnWxg+bkFAz9BcThaMbse1ELlYGZVPPXzHPzMxW5ZwzWYFiqH8QtuqBz6a0s/DeY53FQ5+HZ9xD6Hh6d1kyN3jdnRf9hsNme5e/yrLZUDgAftmR9d7ajopzZmTz8aVw5mRO7qAz9D0t+m6tVTM0PSTY3sz7r0Mxj9GNzVEa+eXaoc/ORMN0Wiez4oUZ5+uFw5jF9wa+XwaXhm5U2Vw+N+KujHVA4PTrV3hcPB/qvYbTZHuRMd2q1rBgA8UM/sOZPZr+x4aS7K8Cx7/u1Hj5/193zyr7KXSMj62Yfusg7PP3r8+LkZcb94nj152RcaX9jx/4mZRmDO3LRHIMxL+8tIultdea9s5WELgOcfP7bVgPnfEzMX8WO7rFfZ8w9tSC/d+3x94M6qmL5gmCHpCpAPu4Lmw8dD5fDIfpqLbLVyMK3/rjsF82Pzv49stfShm4vZTwPF+5ef3KGK7rf6WfQUyeNGbuwAVDBXY/rqY3MDSTPWfuovu2gusGBmAfR7Bsy1HbrXP/70ib3xlX3lx3aGgr13dT+SmqHYX2/y46d2JkL3Uve0ufTSp8/C+1V/aAsA95ZP7MkV7qxNezSiD8l89ssn3f8+fPT40SdP117wlYnRheEqnlembd/3B2M+Hj7tqb2V9vefPzX/++j5U3Olpw+71tvW2gtkP/70lakp7FWmzIEdU2R9l4tIPqRJDtuye6DebE5if7fnu43cIy0AVHhlB/3+qs8v7SBsfqZ/YsfWbmz8bncyox2MzW/3T+wr7YGCL9zI/XS80EfPzEu/n2VPvhpeap91A7D/l/mcR4+fmktBPnr08SeP7CGBJ5+af5kKxVy72vh+99lfmWtBmxmb9n0fz1/wso/xqV2ID8sN+x+5fzy3IX1hTiX9woT56PGzD+3/Xn3f/u+Ja71b0qPufx/ZZn5kziV5Yl82vfM23ovKTXI49g/U/YELgar99h1XDn/913/9bj8QgHjPXz379rN+x/vTZ99+ZX+kPw3OljAP+5Mwu7MYzC2jvt1f2unVt5+Nf3+/Ms89e/bKnU9hFhp8YHgixvA5T8xZD+ZfdklPnvUx9SH5zx7/b/0FXRhB4MPpHb/qP82F83z0vy6qyQKfmqDsK9xDt940FO/gSg7bYR+/OVohtnJot7t3Vzn85r/5jd/9r//xZz/78z/5t7/xm+/sUwEAeJ9Kd0JmPTxykjzP4bw5vaPK4Td/43d/9pff+4b38//xu7/xbj4XAID3yZxJYc6rCEoFyedWFMfgsMvb9Jv/9s+HssH6+3/8XfY7AAC07HLop0dmWbEVfM+rwy7ce/L2/MZ//Pk3Zr73M3Y7AABS53Y5hEcn7JWgMqGafVgEvS2/+Sd/+ffzwuEb3/jef6F0AACkrXK7HML7VLSSrz5dbkdteTt+/2fj4xRB6fBP/+atfzoAAO+RuwjUaELkMby2gzT1ZvPWTwv5/f+xVjh84xvf+4/MdQAAJOzgruUwKhS2weUkpSnO4emlb8dv/mzxSEVXOvyf41f/xp/8+Z//LjsiAACJcNdyGJ1JYY5fiD0pMz+NzhJ5K/50fY+D8Y9BmfAb/9G99u//ifkPAIAUHOytrsbHJmrJEyQPu7d+OYff/NnFwuEb3/gT97q//jfhNMrv/e7bjQoAgHfB3bFivIdhL3maQ7N96zcI//2F0zFHfm52Ovz+n/7sn8dHMXxBAQCAXLk7JbOd3sViL/ba0+XbPC3k+dNX3/72kz+9Ujh84xt//vv/t//6j7NDGux1AACIV9r5keO7W53NTohMqnYy2zOip8++//LxBz/5nf/P/3Gtcvjn/7K4W+Lnf/qWIgMA4N0o3PzI83Q3xFbs1RyK82bzlk4L+fZ3H39g/Nof/dn/9o37+UumSQIARKvswYrxGZjtAzxYUZT1jeVAftxs30rwz7//+Ce2cPjg1/73b/6Le5YO3/sZ13oAAEhmLha5GZ+LUJwe4MGKdrvZ3VY6HHaTYy+RPP2uKxtc5fDNb/5v/8v9SgdOsAAAyD9YMZoX0JjTNN/+5Zvv5GB2jdxWOhz2b+VSFE9e9oXDB7/2R9/85je/+b/er3T4x9+PHxwAAO9IZS/msC+mxcTokQczj/OmO2BWm7dxUuarr4bC4YNf+/ffvH/pML3AJAAA4g5WnGe7HB7a/Ehztsdmc3xvJ2V++1FQOHzwk7/45tcoHZjpAAAQK3cHK6rJqQmbbfEgD6rcdGnIt3BS5vOP3DkVfeXwN65y+Oa/uE/p8HMOVwAAhB+smO1yuOmwwDtkJ21ubrodhbnfVeRJGk//56hu+OCDn/y7b36N0uHvOTETACBVaQfkejbLIX+glcMN50wUp9h3+XwynFTRVQ6/11UO3/wXV68JNcfZFQAAoeyRic3mMJ2K+NB2OXRHK/Y37EzIY5+U+eorfxWHwH/oK4dv3uOaUD+LGR4AAO/6nhW76SMP7SpQ/Z3Ab7kLV76Ne1Lms/Ckis7/c6gcvvkv7nxhh5//dcT4AAB4d6rZwQp748z2od7Q85Z9DofN5hhvfufzj35noXD44Nf+VVA6/NldS4fvMUUSACD5nMxqfJPMzenwIO+cfeM8h2ZykunX8vz745MqFiuHu5+dyW2vAAAiudkD4XTI3Y2HBN45d67oLTtDyojTNJ5+vFw4+ItIBqXD3SqHP48VIAAA71Jhz8kMLrho90G8jUs3f33FoSxv2hdSxzva8uSvluuGDz74tf/HuHL45n++U+XwT5ECBADgnTpM7llxMIcE7ncxhLzKr04uODTNhVcV+aGq7l+0FFVZ1+XBXs4h0k6TJ0tzI33l4C8iec/S4edxAgQA4N2yuxiGO1K7iyYs3fOhKPI8z4u1Ub9o7BkZ5eXaodwau3apOsh/cNzbp4/3mmNRVEc7D2Kz2ZWnm+ZR3uDJ4txIXzl0F5G831yH70UJEACAd+w4vi6jPX9hfhWlomqPu+1ms90dl48X5O6qEJtNfbF0aG1psN3OJ2Dm5c4/t93eeCvtUYCNu05U56YLQeVVa3ZRrHu+vschvIjkvUoHKgcAgEjjaQ72stPb6ezCoul+ztsyo50XB4dh3L44NTE/n9x+hekZEtWxrxvMXoc7HrEoKnethyDIw63FxqXdJB9fKBw++GC4iOR9Sod/vlsTAeDtyWNddbeoHtgdj/AWFHacbUcFwHR6ZH8YwNuepwP7IRy4L88wyFu3b2F0vYXC7nD47b/b/YGrHPZ3m6WQt7b+uVvlULTba7tJnj2+c+Vwe+nwl3dqIoBkVY3dpB7KtnV/uQfNpDDzV95ORvXib81zVwbo6odt+7dXjh4HG9qqvvR7rSrb1u6fncUyk9efZVm1eES6c2gc1zqzaBNn0bRtaR8a/soOP2yHT8ybpvnyAV4wQO11oJrwQtTbcWYUpb3I5Mh55VCFO1BweYdB0e6nxYErHPZ11e95WNhx0azuGzicx5XN5nTL9aLq/k1rJ3o+f3mxcPjg9/7TUulw64Woufw0AKN688JsdKu6rJq6G8CL79Ttd+oXZjuZ119ONnlv6vb1m/riGP6tNz9sSvOSYnWsL9r2tsohf11/3jTtm3IhluXKoblYhzStUb8wW+mmbv/2b01RUrR12dT16K+sqT9v2jfd1vxbb1639YvXD/LMP40TJLtJAe5XeL3y0zxUXXrJlYsw5f99utPB7XEwlUHjJzvMrwCZn9amLlTjGQ7bY1ndcEGKOqx1mvvscvjgP/yrr7PT4f+8EiAAFfLXfoQ3G61DVw8U3zH/bN4s/cQ++PH1whCa13arVpi/bjoOcaFyyOvvuL0DNy3IVg63+NJ84qGvRBrbqO+04V+uFWUX2rfM/uFD/flty8dbdA527bvbbZ9Gg3YR/DQ/nc9Hf1jgGL7GTo4IB+Iru5NKu9Nh9+v9+225YKvf/Lg20aHarhxVqEa7RHZ1ldszTa9cz8He1Ku3PK/i8iyHDz74tf99qXK48Z7bXH0agN0YtbZcKOwo2f+md5WDGzoPZtNXleVnYeWQVaaqyO3W1v+3KfuDHX0Fkjd1WZmRuPqWf/ZQFE1pn83z4V22chheFC6rH7ndu82VdbLKnP4eLDIvbaBlefiRqRwKE9CP8qwaljJV2Eqp7KbNFe0Pzf+aOh/+8rsu+rbYyiEr7X/zxl/dJ1wDReUfHNqIt2I3DJyH3fgETdeb3Qh7Kg95URQHV0lsg9fk3W/+09lPiLiy0+FwGh2u+HVbOLiyoDi7yuFfz7KtXalIDkHZsj27w4LmEMzla0i6Iml44+Ieir+6VjlMLiLp/Nltt9zmYAUAVwa43QKt2Q3f7+bvKofK/+fzumm6yQO+cjD/beyW0/63qsum7QuG2g/JTf2irtvCHAH41mvzjrxuXrf2yENmxu68bhszfJvKIXyRe9QtKtg+2liq12X9w2a0yPrzssiaN+3ndWvnOZhmtOUPv/PD/vDLbCNcm3rmdTPeSfLZm8Pwl68rii4AVzl8/h3b2Lps3/ywGK2B/HXblObFQRvxVmz7UyvclRwm8xu7n+b7phjflHu+3/90KLLiMDnJc1Fhdyzs/V6B3NYR3aTLFyuVg71IdnO5cOgztLlWOfi2DhavmXllmsMHv/bvv3nviQ7f+7cXVxEAHYq28QcU8td19dP+0IKtHAo7dJqnf2SLhSyoHPLvtKNx0+/Z737DNy++43ZR+KMVZhNXvLajqqs47NBu5hy4N9ixvn9R96j9tDfVtHJ4YZ8OF/lZV2Lk33nRVw5mIsPB1QFzrWtaU31u5176MA91NfxVtJ8Peye6yqEyC3TVTGVeGVQOn5tFmpUTtBFvQ+6GXPOnG0zHRwS6n+bhtIPSPlKMb5DV72ewI/y1SQZux4J/x3F0fQdfOcwOH+QmkvnhCneL8Ong36xczGpa7GxPZeP3oTT3qRz+4v6Vw89+8/IqAqDC374u+sH99Yt+MmBWfOfFixcvXElhK4dg+D68qev6jZ0zPoybX9q/3O4Io6pftPZsiOCdP/y8Ox5ijynYysEPr8M8B/OicNC1R0WKtq7dr3lTOQRljFuk3eT/rT+20FcObTjsTxxsWIf6RdvYPSX+kEReV8Nf/r2+gMiyb72o69pWIi4+O8UzrJ3MG81ujKCNeHunVpjecbsSxiN2Ny6Pjj64ymH6873/iV/srh+u+IWtDn7sFje+9NN5ZYakDXRWDbjbddmdIuUkxEuVgy+I3KeuXzXz5U8uVw4/+Zt7Vw5/+RuX1xAAFfLX3eGILG/bqnT1gK0c2sPB/Ns/Xb7x5ynayqH8snS/5Ydxs6zLsiw/H6ZUFk3dH+uw8xub0kwu9B9m/uuOVtR2j7KrHIYXuUeN6o0ZgKuqed32lUO+sMisfG33RARHK8yjXeVQmfCKvuHuxW6CpKkAfL3wo75y+JGpHH442edgqgzTQL9rxSxkWAOHN635jLoM24i3wZYB2yYr3K/wyaUd64XpkO6Vu/ESwoG3uX7DrPoP+urgsA8OXAzzHM6L54DMZj0OszBGgV+pHHy90b3Hlg5L13+4ts/hg4WLSN52csXPucU2ADc9Ms+rusnN4Qm7L/5b4TyH7Ft17kfAqn7RDbx2x4LdVT+uHOxFEoItX/562KHR1O1Pm4XKIStKW2DYsb5/Ufeo+zS/I+TzSeUwWWRWfudS5XAYBZe7hQ41h3/Azvro/nJ7LdwREbcyiqz43JQci5VD9catAXO0gsrhrfIXm/aFw+Sqz26HxORkCzePctjF4M7HCMddczWF6pbKwUzlNccqfnu4spQ/t+K368XBvlk5rWJ6aSpTZszP65xM3hhitnMlmrvPkPzg/3vPyuHnv3tx9QDQojXHJMxhibyqfzQMv33lYA4VdL+d7RH+4KxMM6w29S+7ysH+iB8zO/Xdu39kf9yXC5WDrRJyO9YPL+oetX+89pMeJpXDdJF+AuNa5TBWuoX7KqF8XfhpkFWdD3/1ezGa0VmZTbfHwhYQwxoYjtRQObxlbkKjP9g/vayBOw4xqQLcPoZqXHqM3thcnehw7mdB2hM0T8PBqPxfL19D0hYo49M++smaG39exqC+WDm4C2WGJ2q0yzMqr1YOv3e/Czr8859cXDsA1CiMgzk04CcPdFMcfeUwjP3BXns3RH7p9jyYX2Ct+cUdzqH0zAD7Szvufmbrknaxcsjy+mAXNLyoe9Rq/OyLSeUwXaSPoHlzQ+WQ+9MlXPljG2ZnTNpJjsNfbol9y1xpYp52D+X1T8M10FcYVA5vmxtET65wmHSw3+UwHpbd1IfT+NSG8UuK7bWrKfSVgz2vIvxcd8LmdtcszeScXRXbTVfYzu6jcb54tMLdHbSZ7EdZqDS+e7/K4T9fqRy+9yd/fXHtANDFn3vZ5lnR71covtNWnw3zHD6riuyz4fiBGzftc5/neVub3fitmRDZXa2p+dxc0sAsrGjb3FQfjZn4MK8cmkNW/NTvcxhe1D3qQinflIeiqOpx5TBdpG3BLxt7nsW1yqHpioEv3zRFXroaqMyLxi2+++uXdXsoPuvPCnWVQ1V/lhWvXx+K3F4La1gD2bfqqsiKqqu1mOfw1oQXQ5j2r5sNMJkAYIfdfte+O4gwnSNwvHZOpDskccwzeyHqcIyvdss3yzSTJ6bFgD/EsnDGxelS5eCLnemSFs4kvVo5/IfFS0H92eXKgcIBwIgb4j6rzVGLn/ZXRjL/sleONk8f6hcv+usT+N3ydpd9U79401TmEEduj3x0uxHs2+2WunrzojbXWnhTN00339LPujSVwxt3BkdlF9a9qHvU+9KEZk/V8NdzsEFOFmnPlHjRHszL7CvcbTF+uFA5FEM5Ufaf1NQvXrjrYA1/mSX20zuyxh7JsXtjbPu+Y4/vDGugMAszV6emcni73CyF5cIh3y6Mywf7YP/73M4YmL2zvHJyhT8kcSzsHoZR3dG4O2nOZljaImHyOW7GxVKJYFq1FoE7xDGpE5rtZnuPymHlUlAXKwcmRwJY2TTm+fr8rLXniuHxInxNYa8QObyiWH1/sO3rXzR6dLrohY/ug8zuqgjiDD69W/LqKskn7VsPE7H56mDxEgxuQsNk7sNpdEssd/XI8QxKM6RfnJ/YH5I45n/829vt+IM/d6dWzBZ5Wrjmgt0PsXjVqdlOhYC9/MR0UaYIOdz56tMrl4K6ePnp/8LpmAAAwdwuhOUrIflTF/P5sYr+V369/NZ8e7ly8Le1+nFlKoh+yoRbor+cw9JehMlBkcUbe7rPXzyD09st7acwy5ov6H9eqxx+8hd3rBz+8U+5ABQAQLKmu7j0wvjrjwXMC41+BHd3uhoP/UaxX7mF1OiOV9tju91u/2B8mww3d/IPfjFdoj1GMl6mC2apQLA7I8ob7g06qJdOy/z+tcrhg7+5S+XwvX/iitMAANnc+YmzC0ANl3sej8zuvAp3U8v+WMX0VEl3GcmLlYOpGLbb7d+ZXQ7jgwr+cg7DlaHC0zwmd/92R0qWPsfsjFg5L3St3CiXSo3rlcPiyRWLlcP3/vlnHKcAAMhWlN1dKZaGX3fKYzgA58fRq/2pDQszEU3lcOFoRbdjwex5mMxSOPzd8uUc2nkt4GY5LNYHu9XKwZcbC6c9bxcW9dHjWJXD937+5/9mfYUAACDB4XzhUEV3ICMYgP11l/oTJv0LFqoOc7TiQuXgdyzYa0VOLyHxD/bhf5hGdJ6F6c4KWbwp5/phDHe16qWiorlf5bB4csWscvjeP/7X319fHQAAiND0N5peumVDd4nmYZQt/HUm+zOK3TyIpQE6v3xWpj+1YumWmI052WK2J8KdWjHeU9CuXMphPo1zth9lqapZ3Ofw7auVw0/+/dXK4e9//j9+l7oBACBdXg9XcrhUOfSVgS8c+kkO3V2jlobu6nLl4K/ZYI5KTGcl2htnbre76VL30wHfz8JYOiRhb9a5eEjCTcxY3MXSLs2QvF45LE6RHFUOP/8Zp1MAAOSr+h0Oa7v8u9tQ1qPCYfiR7yY5LJ0TaYfhS9eQLO39rux5mZNPLvxJmdPTNcz1rMeLdB+/WAT4kmd+sqhvw2Jo9dJZmc+uVw5LEx2CyuEv/+tvcBomAEC8onW/2Pdux8Ny5eAHYPdLP/dzIvpDAL6uWL5owuniHa+68mC7/b+mg3t3j+3p5RzqcG/HcAXpxcrB7VhYis21aLG1Zg7H4T77HP7Dhcrhe//0u0yLBAAk4HB0Bx7Olduxv1w5+Es92EMZ3dmbfeHgn1w+97LYzu66Gcp9ebDd/vd8+bLUfzDZLWALndEiu5tkLnyMr2lW74+1uJckPy1N9byhcliaIumuPv29n/1bpjcAABI6F/NUFf5qT8vzHPxAa6YSdGdv9ocq3CWghtMsxsq1RU4mSM7OvcwOu6UzLtweknCR/vOX9nl0YQe35eqWHR59mb5ru1Q/3VA5fPDv/tNi5fDzP/8NbogJAEiBvyjDyQ36FyoHP9Fwc67cO4KbWfuBe23Hwn5l4qRXdRMk53ss/FPjBbf76VGG/oDE/EJQ3d6R2exNdxWrhQteus9YPOPilsph4QLU//n//V+4WCQAIA2FHfS3x65W2K1fz8Hft6I3DOfdFMSVO0OYkyIvnVpRru5yyBr/TFDKFL+139rSYagDurtrj3aDzAuH0ZkXvnDYL1/a0jy70JpbKocPfvI3fzaqG/7TH/3fmRQJAEhFvdnsT+0wfLrrRzcX72nhf8D398f0Z1kEF0wo3F3gh8mLN02QXLhwtC8qgvG9KPfb/R8fR5WDr1z80YfwBrGN30+y2U/O/PCHKlZaam8L2tyzcvjgg9/7o26a5H/6V3/0N7/2k4+fr7ceAABRdqfaTG/ouZ/oyzsP3FUa/UjcDdBFd+wi3Lt/2A1VhB2jl+dcjq8g+dv16g0t9sOiy/32t8/22hF9oVH54w7u8tNuvoYN7dDVNJtt63cxuNIh7+ZFBHsowv0sJuZwP8cdK4cPfvJ7/+7/9xd/8e//4m9+79fMP79P5QAASMVhcjD/vHqKRFH5UzfDIxXFob+AVPieart3+zGKQ2mH7OOlENwsyO0/HFZ3R+z7R8r/a/sHP85HF5/2hcP2kPs6YXssq6qqyvDaVrk/oLFvq0NVunNJRjFXQXFjL6u9tA5urRwmPrrQegAARHMXap4fXDiU52CPw2ZfN4fDoSrPu8Wpic12sz3WZdmeT+58zwvnZGbVby9fs2Gpcmj+YWvnZNg6wO3XcKWJOUfCX8XSfuB+F4a7Kc3JEj704ZnwVJB62NGSn9f2u9yzcvj2TaseAACB/AA7Pr0yL8+70RwHOwCfdu4cB1c4HFbOhHSLu3BmRTeX4Q8WpkIUk6MVzW67tfMrzDyEzbY+5FV3ly6zy8A+umRXdKeQjJoQfuJx43aTFIdy/ZLU96scfvLsjp0AAIAY3VyGXTdrsjgslA0z/bkZS2c0rNz6uvvEX8xmQa7NkDSFw87uvqjsYre7fv+B3avhpz3ONbP5nbbwCOuZo1nc6Xg87S5c0+qe+xxe3aMjAACQoftpvt0d67atj+GOhVXn6e0m/CUdb9nlUPjrQC1OhfBnZborQZW7/soO9r4VowiK4VjLPLxiHtP0eg3BiZ22+YvFzg33rVjw+MmdewEAACmqyyVCM9/pH1wRan5NR2v58hBe7q8DVV6aPXkqzM08t9v+GMIkDH/tquGKUKMnXV0z2SMxuTbVZJfEwhmiWZb96l6Vw1dUDgCAhC2UBl2FYHYtzOcLuOMHY6Mf+CsXiJrsVljcL1G86K71cDY1xDD54LB8UapxxeLDrpaenO4H6a6Q6d+zfHzl+e/cp3J4+fTKKgcAQLDwqg3hWLori9F9NftyYnHIHwqMtStLdvzpEysXmaz8TgdbXJx+NDxxXB7n/UWhlqqK4XYb8z0O0yMda5e8/Kv7VA7f5XIOAICUzecZbvenNpgCeah3W3+96f1p7XzLorYTJLarL+i4G2X+9soRjaLtbmqx7S8+FV49elabjOuayR6Ryp0kutlPrlFtBUc6Fm5Z4Ty7T+XA5RwAAGnL693elQbb7X6/O53L6TWaiqo9H4/Hc3tpBsOhPZ/r5tLkSKs0pcF+ec+FDcbf9Oo4WZS/AJS5uNPo8f6C07YBk5M+iva4253qxTt65b6s2Czceavz/OWd64bH32WaAwAgdXlTtnVd123ZHC5cNzqKoj793Wm0O2HyfHk8meplfh/N4/JOjbzuziKdVRt2efl6kXIykzBP8wmfgydf3a1s+Oq7HzHLAQCAqA7V4j6AXn6ophfJdo+X5+NCRWEueFmfj+e6Hd2R4xZ5VTbV5VLpyfdf/s7vPH78wU+ulw2/8/Ljbz9hjgMAAA/HamlQFHetGm729Fevnj379kff//i7f/Xy5Xc/Nr773b96+dXvOF999fKvvvvx//z+R99+xd4GAF9PY3aqFld+0AAQ4vlT47nx/3r69OmTJ09+9atfPXny5Il99H1HB0Ciomo8++Onskdy83phStnhh62baZY3bRvsfB3+OXkiy/Iv88l7+3f0R3bHu4APfs9tXgYvAQAAD0XRtm39om5bdx8dXxssVA5N/XnTvmnMk21T1v1cseGfkydMGfKiGr+3e8eXTf3a1gV5+yK4mE1RvnFvP9Svm7K+NAUMAAC8L4f6M/9X4Yb9hcohr83AX9Z5VpidBNWbbsC3/zyYZ6dPlHXpljO81/rcVAQ/so99WX9eD5XDj163rX1R0ZqX2IUCAIAHWznkTdmMj1bk3bGExg7ph+6JvP5huIS8H/+HJ35UFn454/f+0hUEpjgoykPRDpVD0/iXuvcV7ZXL+gEAgPdZOVR12bRm0B4qh8+7HQWlPXRQdBXCUCr4JXyZLTzhlzN+r9sDkX3LXR8vrBz6IsPNtshKd0QDAAA8xMrBH1Roi6ByqPq7AHw+GuerN+HxjNweXZg/0e07GL3XVxCuRliuHPxz/n8AAOAhVg5f2r0Ah/qwMM/BD/C+CPATEbp3v3hhp1dOnxgqh9F7s7KuiuLgZjRQOQAAILVyKOuyLMvP3yxXDj8M9xCUwSX1i8Phy9fdG8Inhsph9N6saF+8eFFTOQAAIL5y8Bd2WDi3ws1WLF77Iw2T54vWzVqYPOGXM3qv/TP/Zda4nROXjlaUS7cKBAAAD6Ry6CckLlQO7kk3FWJWOJiHDgtPdDMkg/f2ulkPyzMk7Z6Lzzm3AgCAh1s5+PF6XDn0Mx/tk/a/VX8ixcBerGH2hF9O8N7eZ/5fi5VDXv90XmoAAIAHVTkUbXsw9+ELK4f+8k2/rNtD8Zk5LeJQt9Vnn33W3RawKQ9F0Sw8kR0+a+rys0P4Xvd4XhRfun8dPqtet/0dBn/52Wdl/eVnuZtEmfuZEAAA4GHJ/e//3ExdNFeDDiqH13lwCsULc45mZV704sUbvwfhYN70ZuGJ3LzhxQtzpKJ/r1ummSDpdie0o3c0bgFllhWfm3devqkxAAB434o8X5+UuPbcxTctvbfIr+9MuOU1QO/t3a4aAACkpmjq+g8vvsIchbsv996Vutl++soTlwU3gz3Y27XcP0IAAHAXP6g/u7LjqxqfqHNwxUBz0xGxXzenB+eTW7e628MX5iBcfjb/Nks89JOMyx9cLQTO/YcX5b8084woHQAAeCf83eHvUDk07V0rh6oeP9j+YKFy+FZ3tbM/fv3rVxdL5QAAgKzK4Ua2ciibpcrBspWD1VcOlw+dLFYOAADg3cjLY233HhzK9rfcYYi8qNrWTyQ4lG2Z21LhULZt+YdZVlS/ODZVkWV/WHQvmL/NL7otD1VdZIW9/7w/CSnPin/538+NPT7RVQ7mwfJ8tot1H9kvpCiKpm3/pZ0S4ZZgP/dcVf5lrnKweynMKxtbePzSLcAdhRkvEAAAfA3FD37cmsrB3CbeXloky+s/bpumtQcYmrpsyvpsKoeqaRp7a5VD7SoHcwWTrPrF8La2f5uVn8umac/nwk+F9BdZL7OiOv/CfGRhLjpiK4emybLmF2dbwVS/+IH7HOez1gTWfm4ObLhl230kx3Nrwsm7eQ5mKYUJoKzP/y3LKjtTorA1TVM3Tfn6a0zyBAAAg9yOxMXZ7gQ4/qEZy82OA/uAuzjJoe4OTxTlH5spleY/WWaeK472BT82l0H7sX3bj+2V0ezzv2XnRv7C74XITQmRZc1v9ZdPL85d5VCa65CY/5gl2mux93eQrc6mSjmYDzv8uP/c7Mflf7OlQlc5HO1sClNIVH+Xm/rEVg6mabk5sFEMCwQAAF9/noMflc2Qnvt7pv2WmeCQjyc2HMyOA/9PO5gfp28brohuRnAznC9VDj+YVw5+nkNl5z0Uv+h2OlTurImyHVcObp6D+fi+cvClR3YaVw72A319BAAA4lQOjTsSYP7nSwBTH/ibsg4zJA9/nI8qh+5tbf+2H/Sv3Q0zJO9QOXxrWHhYOTSLlUNxCiuHtlmqHNyjxW9xIxcAAN5p5XBofuu36vOkcmjXK4d/uFflUO5O1iFa5fB3dnn2sAoAAHhHlUNR2wmP9VuvHCanfEba5wAAAGJWDtUvsm7cXq4cSvvnytGKcvFoRTGqHH55W+XQXKgcjtPKIf/XYeXw+WLlUA7XjgAAAJEqh9ycnJBlv2hGlcOv+8mSbTfz0Z6+4MsFM4LP3zZUDv/aDu5NVzkUx35ZrlKYVg6uZvDlQc9+YlZ8buZgnuy7XOVQddMph3Mr3O6KwlQOVfvfupf2UzQBAEC8a0i+bvMi/4HZLxBUDkX7W3mRf8tcz6GqD0Ve1fYSDMeDubumHcFr97Z8oXIof3Eo8qbuzsrMWvPS5sf22hA/zovCVw4/LnzlUP3CXripLvOisHexsqoft3Yxpgw5N3lxKO2Mhf/+x1VeHM6Nn/toK4dDXRXFodzZYMxLW1NfFGaB/21YIAAA+DqKxl7tOW8Ne1VHdx3IqukeLc2fxbfMX6V97getmTxg3ze8rfjB8Da34NK8w1zkyXHLchecbNu2cvetKMyb7X0rzOsP3RL7+YxVXfb/Pvxx27Y/KM2nlY1dmvnIxpQdtl6pzGON2efg/iztpaUmCwQAAF9LdzThcDgUowfco79+8H/+4a8fCv/c4dfNNZf823599DazN6Jjlzj8e3ip+bBuCeYN7k3F4fBL/7Lh5p1VW+T2xYb9y73WL8Je9rr/cPu8rRzcn8PnXrkbKAAASIOfIXkHrnIAAAAaUTkAAIDbHexchrtwZ38CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUKdqz+e6/Fp3SSua+usu4u2p2vpcV5FX2Fu+aX1e1m/9Mx6comnvfKX99YVVt6fj4fBWQwEgwXHj7Y/B17/ZhLZ5/9C5f8mpf8aq3EvL8RKa4B9H81e+75a5O1cLUVin+8Q3f2Z/9B8/fGoQpFtwH8Nh239y8Or9Kbz5alHbF202m10zet/Wb02Lff+PoUXb3TnY2B5O3aLL1aa4APb9J7dD1Auvtp+096vA/qPpmhOyq39wdkGMRoz87N+1da22H7Yrgg4eXj9+v4sw1IxW2PY8+qC+FdtTPTyx1EvhM+fgH0Mgza5bVl1cSKdRWxLwrfqnzdeqPg8/bdu2rOwaya8Vi1XbfVbRltFDASBNuJEdtr2rlUM/nLmhaRiz68n45F7uN9ULlYNdWHOHyuFafIvP7KsrlUNfCbmxb1o5mIX3W8pD+PixuLVysK/uIiyDEX13uFg5dGVXVuyuVw6b+m6Vg19m/xl22dPYLlQOk/cvVw75bmk1TltxOtxYOfi1PKocinA97w9qKoeFAfxODt+py6b6sqzrwy2VQ9MXePMP/rqhAJBnvJHd5Vcqh36oqcdjdjeS9EOLf3l5qXIYBu7bKoeL8Y0/t3+quVw59CPQbq1y6IewajwYn4o7VA5d4OHgHA5p46b4ALqV46uAy5WDb8itlUPXmODRcty8y5XD5P2LlUNYOAzraKEVzW2Vg/+wsHIoTuMlVWoqhzqs+e7sUPsdeEVraoKrlUPwwfPK4euFAkCglRFuPkA1o6HCj7T9mN0Pq91WxL/cbatXK4dudLy1crgQ3/hze3aIWa8cunh9/IuVg2tD9+h2Pwr9xsrBvbpba3u3w+bKPodumPa7cy5XDn6nw62Vg19mcEik60HXPvvz/ULlMHn/YuXgX7N3rWmzK+Xd9crBFQZh5eCOmWw2boX26ZFc5VCV5Wcm2YqiKb8ssiz/si6rrhQrDllVmn8cvlW6wwaH8L+lOyRRHLIflfZlplIwhd2hyHL/p6scupeaP8yn/CjPKrfEwr4vb8rKVQ554z9pCOVQ5CUlBKCE3cieyva8DwcYu53dll5TDFt7v8n240w/ZpuhY7cPfih3g0O5VDnUZXv02/omjMKr7hNf+LnmmdYftC+DT/Uvz4PRxQ+ofpQLKgfzarcIN2C5V+yq/pCDe/hi5WBa1J6m1ZcZQ/N665u+0JRuCC1Hu3PKlVf7hriu6CqHorEvcPMD7EtHE9vsMrvXhp9yPJiflVvXtvXKYfr+3H6cXUXb1q9juzLcUZ1mF0yQCVpR+10GbrFLveR0K2RIIfcOl4X2QEi1m9ZP43QSXTl8XjdNa0b5n9Zt+6Ytsi/rF3XdlVbV67L+YZNl5Zu2rN+Y1trR3Y3xZf2t5vV3fmle1dTla/t09tO2yH5a13XZFlnZdpXD8NK6bNrGLOaH3/lhbXZKVOY/h7ou6++Yj83rtjHvNXwoed3UnzNRElDCbmTPw570hTFjoRToRtq+cjBDQH0M3tS93P57WjmYzyjc70X3+iGKe8cXhun3Euy6jx0+dbLgrgXd6BxUDkNd4I7Z74PftG7EOl6tHFyLmn4hbRB2Hs4eHTdlNFB2c0+DymH86u4Htv2wUTXgm7VwGNpEvbV1RbfS23C2RO5W1XrlMH9/v1r6lBitmbC4Cxfsj2jYz13qpfEKsU8GlcMx2GPh2ho8Pk4nyZXDj+xkBDNg15+ZUfxvx4cIqhd2EK/88J+HlYMd8ovX3/KvKlrz0uJ1lVX1ITvUn2dZ01UO/UuL9ltuwe0Ls/fKfJJ9zr63fFGa94zmDTd9bAB0CEe4YQC6UDmcwpG2GybsKNGUwZbf/az0v7CXKoduV3Nza+VwJb4wTP9M28V7oXJw42o3Ok8rB9dOu0XuR64+dNv4GyoHdxpK29Vbk7AvVA5u7Z5vqBz6IG6sHMya2eenYVnulZdCG1UOs/cvVA5VOPNgtZOC80iuVA7bsDPdQahtmDbV5EhUSpWDn+hrx2hbEYwqB1dYtPZ4UF5/GVYOblaC2T9gB/+sMZOMD3WefW6eMDsWvtVVDv1L+6kMdol9AWKX7P45TJgMKgfmSQJ6hBvZ43gnwbxyMIes7QBlttI787szGEm2BzuK1sPLt0e/jV+uHNyGv765crgcXxDm6JSOS5XDqSsWzuE/wsqhH6WGzx7vi7ilcrB/t/0P+/PK7++eCWBrhnK75Tb/2F+pHHY7/2k3Vg6urfUwtLthd3Kcer1ymL1/bZ+DP4HkQicNJdmVysEe3zIH5fs+cdVpf7i/38WUWuWQlW/s9T/8dARTB9jhOjfHYg6+Jijqn5onCzOC95VD8fq1eU37uqscvjT//bItzG4Hu+8hK+3Rh2r00jetq0Vs5nSVw8EWKLZyyOt62InUVQ7KLqgBqBZuZMt+S7xWORz9cGZG2nMwTLhfn3bgDEdtuz+7Xasc/OHoaRT3jG9tn8OloxVHXwmZwG3bTktHVM79sOSrovCfN+9zsAfj/b6E8Cfb2j4HW8z450+7a5WDK938DoqrlYOt2WoXTj2sqvHVHfyH7ZvKqoNXzN+/UDl0+6WO8yElbIWrH9vrlcPZdlARVHOTXTjDP1OrHLKqflEWs8qhaJqmyfvKwV1C4/Wocqhb85qmOxjhKoemzXJTBvyozrPCLNNWDsNLs0P74nV+oXLIirLuKwUqB0CfcCPrfiVWw9UYTlY7VA7tsPG2f/thwm79z37HuRtF7RIaszHf52uVw3DY3x2wdh93qu4V39o8h3qYpOBe7q/EYCuH81DZuIFpiHF3suP16OyMYQw+dS26ZZ7D8NO4P4lwGE4XmmI/rPVVjQ1xvM9h/Gq7Y+dgpyzeWjnYEqxxn+PW1Xl6TsvwYSFfOczfv1A5DCdc7KYz58Jh3MV4XumlcJ+DLVSa6X6gIWgb1fDEOJ1kVw5m7G66ysEcRBgfrci7ksEf0Qj2OfSdH1QOpakcmix/XR+yn74uun0OYZ4cXreXKgdbO3SzZdnnAKgTjszu518zHTOG0xm2lRvO7EgbVA52m136/w+Fxqb0xy+q5crBbeqD8wM2833mN8c3+p2cF0XuTiywI/bofD8fsy0UzKt3hR03m8nRis4pH3+004+0lyuHoigO7jqKbtAKLibVXYZyoSmucnBVjfl7b4fkcuXVtlzLbW9U7nf31cqhO4p0God7vLVymL9/qXIIr6MZTqmbDON9EbbUS77jzTMne/GGXWEbZQPp3xksNTxRNUwn6ZWDGbHdXAJbG8wrh+xzP0/ykGU/NH8ezKu7MyAm+xyKrHxR11X7JrgS1PBSo3ldTCqHvDYTJ+1SDbvXwp7uSeUAqHPHysENZ3aktUe5h5HEjCB2GHU/Au0Saj/G2MfXKoeVTf1d41sZ7exb1yqHnRnJtwe7C8XuoVi6noO9/uP9Kod5o+y+gTC01cqhtocpXJF2vXI4uJ/l7nf+tcrBDcTd/n1b6Z2WDhetVQ4L71+sHPzpM6NreM2H8eONlcOucNXopHI4p185fFYV2Wd1leX1izLP7bWbFiqHQ13mRVX/0M6DbIrPXpsx3l7yqTD3mggqB3eO5aHw//GVQ//SvMmzvP18us8hK+uqqOzJoM0hK35a51n15ksqB0CjO1UOm8YOZ2aQ3dthwW3f+73WwchpX352A2trF/wO9zlMr/S4Vjnsc1sJmV0iZxv74pWgzFWRppXD8Y6VwzC8ul0hm36KwFrlcLbzJA+2SLP7bC5VDpvKT1L1xxEuVw6+qvPzLmybJz/fL1cOC+9frByyrBqu8RiO2vN9DueVXvId7xLM7nRwux5U7XM41C9evLETE5vPX7ywhyzs5EavMgcc3GSIF2Y6RJYV5mUHM/fRPWhPurSvsv8dH5jopzd2Ly3aFy9emBtV2AVkPyy7t7XmafNg88Yt82D+40JhhiSgSTgyV+N5BPtDbgVTHhszFm3bfneC2767cxjM9KphpPKVg/1xvrc76eeVw3RKm/u4/H7xLY12Wz9g+1kKo+W7ysGMfScTY9X/kA5efbATDPppecH43w93C5VDeKEpP+COiqHhHk2H5ab4/QcmrHo3/NjOll/tT6dw5YbrpSuVg90VUDdN0/ZD/WTKQLAuuw8bdhAtvX/on9GQn2W29LHaS/Mc6pVeCvpvX/gctCmVzydnTArRcTpJrhyyzPW1GZ0nX4+ll7m/ggdnb6n8vVqLyTPdS4uVT+kfXnsBAB3m5y7kF67n0Lgz8ewh9aFyCHZK978Cu0mRbqfDbrFyON3r3IqV+MIwNzt7Pcv+ZIG1cyu2uR23tmZZdq/C9KxMfyWBKpjHZw2FhH1bd2qie3VwkaKdOXV1/mP+4OuK9sK5FUc7ELt5Is3VK0GZaXH2Bpz+1MVLlYMLfmCed2dOFDedlbn0/tXKYbhh5unSuRXl9XMruokVRz/ttjshpA/6nO65FU683/WH1y/qtq3NVZ0A4M6Cjay7fdCl6zlsyu6GCKdiqBy60+/6X9j92H702/PdYuVwuOP1HC7HF4a563YSnK9VDt3FMNtsuXJwn1+Gw9L48gfuc7pZDNvZVTFdJTO7oL+7ruT5YuXQ3eXicFvl4K4IfUPl0F32Kqz0XJjVTZXD0vsvVA7dSS775QW3k3msFyuHKrxKyCTooLijcrgqN2fasuMAwL0EG9lycvB9sXLwJxa2/dA7H0mGmQh23psdTpYqB/ezvLq5crgcXximecbtoKiuVQ7+buGHtcqhuxbDuAI4Dns0TsFFDcrht3Uf91DuGH3I/TH69cphuPP3TZWD/fTxdIzlyqG7W1VY6bk2H2+qHJbef7Fy8McRFhfszjZxV6K+Xjn0F8wMTpXtgg56KNHKofA3rAKA92vYyLpxKpjfuFw59IcM+srBjiSn2uqv4zdcwqEbaCaVQ+722E/G2fvHF4ZpZ2vupjMkFyuH/pDJcuXgqhXziz48/OEedfEGV0hyO0WCmy6d+8kZ/iD/YW+u/juaKHGhcnBVTXlr5dDv+7lcOfhrLdrucrf0avojTt28EHs+yUrlsPz+hcqhOLkzWrvDCgudlJnTfLvPvaVy6O7oGUy48O0LLmOdauUAAA+Dmxo33LuyDqap27seGv2uYTPBu9t/0A29w70d+kl1xfyykaN/nNvuLol+p4CPolPcI77ZCOF+g5bBp45untiF312LYlo5nMuydYWQq1bafq5jYScGdtMiq/4iy64W8g8Pg1ewf8JenMHec6ge75wZN6WrHPrrJkwqh/GrhwtOlzdVDjbg0SmR/UxPM63QtW9+TKivHJbfv1A52AuN2muVTyd7+Fa0Z1/rhLewGPeSM73JVfcPv8PIrNEmKEGW0mm84rgdNADc3+TsQfcbfXo+nhl7+tHLvKMJhl67+e7nInY/QofKodvpMCojOvVSFOEO75vj84bRLpgWMfnUflKm+SA7mufzyiFgR0a3uO6AQHDZZR/h1j9+nA6pbnizl7A+jV8aFDijpvSVQxPuwJmflTn0hysWup0OlyuH/prc4/MRuis++uDMNRyXK4eV988qh8kCw50Jk1aMjimNe2lWOfidDj7f6kmf+PRYSKfxR07nggIAbjfeyHa7ly9VDk1w6pvZKPd3pMz6wbGbGRhcnmC5cpiMvuGm/q7xecFo517UroxJ/cGWs7+awGrl4Iej6QWiuk/0v9a72A+zH+PuxprmYjyjV/rbQ1+qHMwfze2VQ/fs5cqhv4vGEHw1P0PGXMRiuXJYe/+kcugrLS88eDBuxejMlEkvBc8E168cKtXjLOiVdKJyAIBYjguXP7hcOSxOFOjf2V2jIagc/K/PeeWw63+G3lY5XIwvfMaPdjaybr/CdEwaTip1ViuH/taW7hSB6aPjgqC/dWRQObjR1d7k4jQrHC5WDqNG3VA5+NH6YuUwugDF6E5e7XQMXqwc1t8/vePVaCblaNbB+HpW3Rtuqxzc2uxnZYb1Tn+dSioHAHiLuo3sdn8cbpx7l8ph9KuzO55cjSqHYA58Pzpsd+dg9/X1yuFqfOEzfrRzQ/r5a1QO+5O5ll7PXRjKvG40j89eiXI8Co4mAAyTGjJ7dww3lK7vPrl35TA9B3SpchhuM2a5s03Hl5nYbN08zsXK4cL7p+dW5G4C5ahGHLd5tH5vqxzcJw639ewvU7kfLjVF5QAAeCgOZV3XzezEw6Jq67oNSpsL7vDSd88GV0VeX+EM1rcgb8xncMIiAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHqZDW5/rpggfKpr6XJf5yhsuPwsAAFJRbawyeKjZu8c2p6p76HDyD+39Cxvzj12x+Oxhu5k4utcVu/BfWZYd7Zvy4B/NhbdnWZZ3oTmtf/jsPr2vXGx0m3P/NhvfNu8/5TxrQrD0vtHTpQ5vBQBArXo6OBduwHTObmAtg8F8d5gOu9NnV4d+X6VMxuJN/XUrB1+RmDeHlcO+qwrcEu9aOcyWSuUAAEA3PA6j+Xk+Njejsfw0GXZnz64O/b5KmYzF3Wffv3KotpPXNePPcZ9718phtlQqBwAAuuGxH2X9A9u9/f+pGKoL/9B2ss9h/uza0N9VKcMef1c5+J0O968cuoqk38nQLB0kuWvlMFsqlQMAAK0ZPffBaG53OezN6Hk4+r0BTT9K5/XWlxjDsDt/tmhKww7DZ/NXY4sNWxJsT7OxeDSmN+tvH8b22r6gLJt8qAy6dw/R9TszumLobpXDfKlUDgAAmIG8Pg5DqPt93h0FOPTVRfd87ofRYdhdenZYUjmtUsrwZ72vHNxIPhqlF96+MIcxGyqSMix/fOXg3+53Htyxcpgvdb1yONQ155UAADSwRwaaYDR3A7afs+jVsyE2HHaXnl0e+k2VcrSfWAdj8bY7AnLvysFUJPv8FITRhFMyuoMkd6wc5ktdrRzM+tsGRRMAAKkyw+P2EI7m7gTG0YjdhqdZZIv7HCbPLg799lNK+3A4Fu92fjy+d+VgQj7ZCmZbDdHt974iMWd07LZ3rhzmS12rHNzbFoonAABS435SF/th5PO79nfBmO1PptyGe+SHYXfp2cWh3/4yr+xEinAs3rnqxc+wuEflkLu6x8ZRB5XD0R92Mcu1H3qnymFhqWuVg5tH4RYPAEDK7PB49kcNhmmM01Kgu9DT5tiP2cGwu/Ds4tBvPmRfuHe2wUMHOxXx/pWDPdbSuKd8IWArB1ORnIrMlEX277tVDgtLXasc3CobzmsFACBVdngs/f/9aG7/9qWAHwwPw7mQu9kMyaVnl4Z+OwYf/ThrJyD4iiW3w3rl9nbcVDmcjtZ5uA6EGbZPQ/ljottW7nCF+ft898phYamr8xxs7cTFJQEA6ev2NYSjeXhJyG7an90t4LkRMhx2588uDf3dvgb7eDAWbw++pmhvrhy66A79Qyb2eih/XOVgdmK0dldGU9+1clha6mrlkB+XJnoAAJCafle8nejgR3Nz/em+dugmJGTu8gqb/qj/eNidPrs09B+7xZ2Hx+1YXPl5mv74wMrbVyuHpvtUOyXBlT/2scb895TvzDGSO89zWFoq13MAAChnh8dT0zTNZJgu2v6mV/3I6l7TDdjTYXf8rF3GeJmuOCmbpjlPxmI/meDshvs7Vw52cXXTNK09v3O4dlVjFrE1VUntD4vcoXJYWiqVAwBAufPaRZ6HUqAvBNxFJTfdvvv5sBs+uzD0d5dY2CxdNtJeO8EeJbmpcmgr69BXJAH7Dl+E2GMUdk/HXSuHxaVSOQAAdOvvI+FNzg5wdcXoAkfu5lbnxWE3fHZh6J9UKcFYbC44bU+v2N7n3Ap/Uui4/LHRld15IqfizpXD4lKpHAAAuk2Hx3GV4E7ZdI8Vo7MIjpNhd/7sfOifVinBWNx013rY3Kdy6O5LNSp/fOXgTxhtu5M4bq8cFpdK5QAA0M0Oj6fa2vWjebvvTqiwQ7m999W+LibnH47Oypw9Ox/67dWS9mf7WcfxWNyEhcVdKwf3sqNdrpvY2QSVg510aSqGO1YOy0u927kV7Xazc4d6qt1m7xvCgxFWSLC6H8qDAKCDGx6D6zXbe1jaExLMOGlv2WAHeDOg7ltzCob7Kd6Mht2lZ+dDfx2Mum6A7sfiJryKxF0rB1uRzG4s0VUOdreJqYdWK4dt2913M1z68lLtHyf/+rK6fD2Hsi+PXAU2tJIHv94KCVb3g3kQAHSwm+Vuw9cdmvB3pN5s/f/PWVacxg8N99a2J3QuPTsb+t0/urKg3/gOlUO30+GulUMbHiApw/LHvvcYlCiLlcNwPKIIlr681O7Onv2aCVfkdAhxq6Xpb+xhl8aDEVZIsLofyoMAoITdLHeXf3IFwNlvq3u7vLstw+TqUH3lsPjsbOi329v+zg79jbmDm1w196scTuGr+uMrfeXQuDH/rpXD8lLXKoel+1b4Ssgsw+2KMSuaB2OskGF1P5gHAUCJU3gOZX+zbHeCRFA4ZNnhNC8NhqMVS8/Ohn5XpRSjqZndWOze4vdd3LFycBXJ+BISdVA5dO5WOawsda1yWLxXpn2xvfJVM1whiwcjrJBgdT+UBwFAh2ECZDYc9a/Cq0Dt+7Ki6asDf6+I0fTC+bOzof80uryk2/p2Y3F4J4y7Vg793ovg1M/d164cVpa6Vjm4M0Mme63t3Tzsa4rjUIPx4NdfIcHqfjAPAoB2RdPWdTueNV6Zh5q1mzNcfjZ5h7qdTZQr2rqrcJq69KuGB2OskGF1P5gHAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcNkGAIBbZACVAwDgZhngKofk14OCJiaDvoIKQhNdaNiIT0EqKGhiMugrqCA00YWGjfgUpIKCJiaDvnrXivbwzj8TUhNdaNiIT0EqKGhiMuird6w4bXbFu/5QSE10oWEjPgWpoKCJyaCv3q3DfrPZHN/xh0JsogsNG/EpSAUFTUwGffVONVs7X755t58KsYkuNGzEpyAVFDQxGfTVu9TaumFP4fDuCU10oWEjPgWpoKCJyaCv3qHcHKrYnJnm8B4ITXShYSM+BamgoInJoK/epcOWHQ7vidBEFxo24lOQCu+qieXpVL+bT0qXgnR8SKqaHQ7vh9BEFxo24lOQCvdsYtWez3WZ3/6G01ufpZ6X9fncVlm6FKSjLlVbn+uUM/ZdJXrR1Odz3bznSo/vJ95CKhy7a5vvj+U4w8/uYT8MH9yM7sCxO+jaK99BE5twYrn9Rz/yF3UX466fP+Yi3Bfj+WVl+HQZroXN9tR2hUfw4O7cXXpnocn+0HPwfLfSsqzZdYsYfim65fZbZrdmT0Eb+8/Y7s7DBty+buvjKPbBP0KVbe9KpKZQ2mzasIPbCyv1xu5VtGVya6Tqe7HraPuPZuVb4p49rz17qU9Gl2243B2Fy7Tjwqv7nHbZH2pGbbLvO/sot6398MnTt6dFeqaJfmXjcug3IMf+i7r4TfNdF+jyyn6bg0Uuvn05rdbDhlpvpXIYj25DOjcPsXLwW9RR5WBPc++D8y3xETbjRvWBVpvNtpqshc3GH78YP3jML1cOfhgfVQ5FuIh9t/lwD57H25vFysG+rXlXlcNspVI5XKscRqnyfisHP8j0Rev41dv2xsrBn/PpEsLkF5XDlcphbeMyWtld/y5+09Yrh3pIk/W3UzngPVcOm81u2NFfbUdZ+7AqB/9RYeXQxeud3LfLR9gN074VfaCt/8kwXgt+kZMH3bpZrRz8m8LKobCDQs/WKP1y++pid7ly6IN/65XDbKVSOVytHHwvPoDKwQ8y/Tg2ebXNouuVQzl61iQllcO1ymF549L1h+c7ePGbtlo5dE/05eDi26kc8N4rh6B06DLf74x7YJWD26QGlUMXyrYL6Rw+PKnh+0CPfsierAX3gumD58uVgysMwsrBHe/ZbPbb0co9jjbxvuK5UDn4prz9ymG6UqkcrlYOfqfD+68c+tHnvJJEJryrlUNXfrtvkd1LRuVwrXJY3Lj4r9Rm33WD+7ovftNWK4f+11BXDi6+ncoB76tyOJXteT/eMWazudsg2sk+peEO6Zu/mkP31antM2XZ3GFm4tetHNz3M6gc3Nd2ZzaA5XYykPdf5+4r2m10zfhbB2uhLOvd8NXsH2zdvoOtad9Ck7vPGEZb98V33/ut+bBqNx1m+jXttzfzyqEu26PfcjT3rxzGnXO5cpiu1Bu7V3XlYJOirxwWvyV95bD87B0rh5XuMNmxPQWH3YdX1/0+sdwGYDNu23YLCdrUzZU4mJtqbcNv0Hyew9v41susHJY2Lv4fZ7N+z9PRfvZNq+yatImwcyvVfYCp9Hb7oBxcfPtyWq2HDbWiVw7n4Qhnt0vdbolsNvYH5PsvxGiC4Xir8s4qB/tFnA5y/ke9G7JHP5uP4bHgvgGmkc14LbiR3I7JwYNu3TTLTe5/3VXjysG+f9sEKy54vBtzuu3NvHIwSyuCrc79Kodx51ypHBZX6tXuVV05uAQJSuz5tyRMpIVn71g5rHSHHWTK4AXhq8+jXd726+Gyb/LCNpy7kbv3rlUOCs+9WKscFjYu7qjPOfxxUF74pg0vC7cDNjXqY5AHF94+Tav1sKHW26kcfFr6bDcbkX1+mmy9HkjlsPWb1+G7476pXSTnyS6CbkPZHT7oGlCOfjOehzHZjgLhBr/fvK9VDtvwsLDdSOfbcMCo5kdBynB7s1w5dCE376BymK9UKocrlUPfI++/cjBLOdoUqeevHqXOeuXgIpvchpPK4WrlsLBxOYVr0q3X44Vv2nLlYLutCcvBC2+ncsD7qhzc3z7dTeqfbDJ3eyEeTuWwPfrRefjuhKF3R/66XQTbnf+qmeHWHsHtGnDuvqmzImFaORyvVQ72wEITVg7uW95troOth1mWW71+e9P/I1yg/wxXf9Rvv3JYWKlUDlcqh93OZ8h7rxxscpR20f49syS6Xjm4KnZyRwwqh4uVw/LGxR/Q6V5o9+X0G4WFb9py5WDetj2E5eCFt1M54L1VDra6dRsYu62p3bakfmiVw8YeRWmD746Lqw90+KeN0I7O/r2n3dAA8zLX9HCfw251n0N5oXI423qgcEO63UjU403/8E/zyqPZzpjDyXtzJY0LlYOfbfEO9jnMViqVw9XKwW3b/ap8n5WD+epuK/t2X+nP9zlcPVoxDHAXP5WjFeGKWNy4uOOl1ehLaftl5Zu2XDm4Pb72qx6eiLn8dioHvLfK4TDkuy0iGvfdCDZfi5XD7mR1l1B4B5VDY75k+3z47rhAJlvj/onWD9Nn/3f3QlMeNdO1MAzQ0wM59sGFJrt9Dnbr0ASVQz/kO3aN9k8cbSxuwa7oWNs028256YL7VQ7jzrk0Ss1W6q3dq7dy2B/sPOJ3Wjksd4eNpnBvapcPefXLWq0czrMD7Rcqh7fxrZd4tGJx4+K2F8Mq7veBrnzTFisH+66zPy7mvuoX3k7lgPdWOQwJ7rZEudusBQPUYuXgDV+Ut7/Pwe/Bq/oCYYjc6reB7svthmnz995uNn0Dmr5tw1pw12AYzq04F0VxcBentA8uNNk+dLJv3BV2DdkCoa9egsDtG2yhYP65K2ygzaWjFb7iuHflMO6ci/scpiv11u7VWzlsc7vToXIb/XdTOSx2hytefY6cglc3RZHb/Ar2yK1WDjbO6cXYr5yVGfVbL7JyWNq4DD8TgrlT5fo3bbFysAsp/f9dglx4O5UDHkDl4AbDLpvbh1Y51L6ysV+h65VDbfckut/3YeVQ95tmN02irs+n7fr1HOzi1yqHXeG+1ZPK4bxSOezMFS+3B3uwIt9drxzyt185zFYqlcPVyuHgh+z2PVcO3b4Gu2x/vDF89WgcW60cJhm7kIzX4lBYOSxuXPpyf7FymH/TFiuHbl9DUA5eeDuVAx5A5eAz1A9Ep4dWOZzdt6nN1yqH/kiBOxRppzId7O/7KmjAcLurSZEQTH4YhDuBlyoHu9PB7Xq4vs9hb8/ybk00Z7tdef/7HGYrlcrh6lmZlZ/F5g/uvbfKwQ4y/QGHcqFy6K99fq1yYJ/D3SqHxY3LZJ/DcDB15Zu2VDn0R4qD7/qFt1M54L1VDsO8HrsBqpumacdbmcXKocyd7B1WDjbCvb1VhZ0huR/vG+l/PfnfhObV5iJP3Z6BPnr/luv3rehuH7HQZHc6hT/I3NjA8vlR4+FniKsczFbmZF5T9Tt4FiuHfmblQuWQX68cxp0zH6XK9ZV6a/fqPVrRzQQ6u66PVTmUlyqHpe5w2VA2jc0+l0vjysHfdeWGoxW3znN4G996iZXD4sZlfF7V9CfZ/Ju2VDnYl56apnF3zbv0RTWoHPCez63Iu4F4UD6wcyu6I7qtn6Dm4xo2zn0h4b/cZmPpDg4GlUN3u6txkbDtb2znruS02w3XlbpwbkU3KeTopy91M9X7Tf8wS80dIXc7ls1DdruyWjmc+t0ndoMfXufnlsph3DnH8ID3cCrh8krl3IobKgd34RN72dJ7Vg6X+uTGcyu6CwR1KTxcyWRvTxwdXyFotXKoxxm79qmcWxGuiMWNy3Ba+PCltIXEyjdtqXLorg/R1X4XvqhLaaWyssd7qRyGyYHd5YlGWfuwKgf7xbKbxePC7PHNaMLGsbtS4/YQVg7d7a76X1tN01T5fNW47XJzvXKowrOt/du6Vwa1jascustOt9nFysFtg+rRJaq6hyfX7BnWz2rlcA5789Q/v7JSuZ7DDZWDu0z716gcLvXJjZXDZJAZnz48voDkpcphnLGrn0rlEK6IxY2L+672XT6UZCvftOFV/XZgejOLYZuy/HYqB7yvysFdh7Ge3+dt2O48oMrB/QQfFeP9tts2yl3I0e/R629lHVQO3e2uZtv26YPhBeEuVQ79dQWHj+6/2UGAvnJwNcH2cLlycDs+7N+n4MdpubRjuf+c3Uqk7m1dS4YBZGWlUjncUDm4Syls7l85XOqT2yqH2R2ThhOVq7D2vFY5jDN29VOpHMIVsbxxGbZA4/W68k1bqBymv96Ggx3Lb6dywHuqHFz+28sTuesd1sZ5tFF8QJVDX97Yf7gi339Vg4vGj05XM4EPX+7+dldXKwc3/2N+mvyscujubeficL8EhzkV3S4OXzn0xyEuVA65O4xyCn65uLtdhFWEU9m7fQWzK5Y6pwp6s79QxOpKpXK4pXLox+17Vg6X+uS2ysEuYX+239d+yJochAhm067ft8JlrJ9zkbu5EVQO1+Y5LG1c3A8FP6wPV5Bf+6YtVA7uX7ZP3W34jpffTuWA93KvzO62jPaEinBX+Gizt1g52PuzGdU7rRy6KWDuu9P28xgLO6szPDetu9Nxf8nWcnS7q6uVQ/gLYqHJQ+XQzZdw//A7Fdoiy5p9sE3uKofufO2VyuHc1u5E/G5ygxtiduYepW5PRHhqRe1uruVuzVWvdY7rP/PCIry70cpKvbF7lVcOvlC9d+VwqU/cHS39zRNXu6MOz4/qjmmt70pYrxz8/ZrNHR7Ntyi4gEn/qfnb/NYLrRwWNi6utLcTU7vqf+UW9iuVg8uK8HYV5mfHhbdTOeDdVw4Dm99tmJKjU5MvnZW5vPf87VUOXdnt/uG/qn7Hcb/97b/cTVi1d7ez6zefVyoHt0U9rzQ5qBz8Tge/76OehOQ2Hn3lYN5nfx0uVw6D0Z6RzWbrlxfuVq7DZ8Y3GB91TjlehF8BKyv1xu7VXjl0Ox3uWTlc6pOe+QKudcdwvfTwtKIgVFeQNNcrB//KPpbj/FObm9NCUeUw37j0ux/7Xq0ubr76B7q1aTc5/eGObrfUhbdTOeA9Vg6nfHSThsklqR9Y5eA//bgYS/hod9i3P1JoG3AOdgZfqRz8zTcPVysHvzq7b/xx8ZT6rnIwS7Vnjl6pHPqDEv4nYbd1D3c5jJ46r3dOX2Btwh3TKyuVyuGmyqEb5O9bOVzok5sqh/FdKboDHkGo7lCer1svVg6TuZYmY6kcrlcO843LsCfKK69svqaVQzvaAdGVgxfeTuWA91Y5bNuFe/KObib1oCoH/wupP18ynCd2LiZf7tH7y9Htrm6oHNzAfLxeObgX9jNKww3xLtzBEZ5QeblycNMXstEPGdtZ473E7jDFZjaXc9o5o2GqvrxSqRxuqxz8Or1v5XChT26qHNwgMz6vqBoVBG4UK2+oHPq9DvZDF0pl9jlMsmFx4zL5RtpjUZe+afPKYXSVj/6iLhfeTuWA91I5bPfHxm98gmlawwmPD7FymB7AtTecsYFU17/cZrwub60c/L7B5mrlMD0HruoGhf1wmarbK4ft7jyuD+yVJ90WY3oth8NpqWhaGmj2s5pkZaVSOdxWOUzO7Llz5bDeJzdVDuPZsu5V9aggcB/ZZeXFyiE79FuEerif24DK4dbKIcvd7PLNZmsmjlz8ps0qh9Ge3m7SS3Xp7VQOuErBgeV7NvFQ1nXd3HRdu+F2V29X3tR1XUb7pKJq67rtirzxJ9nG33DvwkNZn2sz1y0OBen49kXuk6/FppieiY9vMdHdmnzPtxPl+wk9qfD2mzjc7gpfj4J0BMQmutCwEZ+CVHj7TRxud4WvR0E6AmITXWjYiE9BKrz1JpqjhMPUA3wNCtIREJvoQsNGfApS4a030UxB51BuFArSERCb6ELDRnwKUuGtN9Hc7uphzEcTT0E6AmITXWjYiE9BKihoYjLoK6ggNNGFho34FKSCgiYmg76CCkITXWjYiE9BKihoYjLoK6ggNNGFho34Rhd1AwBgTQZQOQAAbpYBrnJIfj0oaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+DYAANwiA6gcAAA3ywBXOSS/HhQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8GwAAbpEBVA4AgJtlgKsckl8PCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbi2wAAcIsMoHIAANwsA1zlkPx6UNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/FtAAC4RQZQOQAAbpYBrnJIfj0oaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+DYAANwiA6gcAAA3ywBXOSS/HhQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxLcBAOAWGUDlAAC4WQa4yiH59aCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbi2wAAcIsMoHIAANwsA1zlkPx6UNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/FtAAC4RQZQOQAAbpYBrnJIfj0oaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+DYAANwiA6gcAAA3ywBXOSS/HhQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxLcBAOAWGUDlAAC4WQa4yiH59aCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbi2wAAcIsMoHIAANwsA1zlkPx6UNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/FtAAC4RQZQOQAAbpYBrnJIfj0oaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhvAwDALTKAygEAcLMMcJVD8utBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxLcBAOAWGUDlAAC4WQa4yiH59aCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbi2wAAcIsMoHIAANwsA1zlkPx6UNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/EpSAUFTUwGfQUVhCa60LARn4JUUNDEZNBXUEFoogsNG/FtAAC4RQZQOQAAbpYBrnJIfj0oaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhPQSooaGIy6CuoIDTRhYaN+BSkgoImJoO+ggpCE11o2IhvAwDALTKAygEAcLMMcJVD8utBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxKcgFRQ0MRn0FVQQmuhCw0Z8ClJBQROTQV9BBaGJLjRsxLcBAOAWGUDlAAC4WQa4yiH59aCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbiU5AKCpqYDPoKKghNdKFhIz4FqaCgicmgr6CC0EQXGjbi2wAAcIsMoHIAANwsA1zlkAOAYPIGNHkRSw4b8VE5AJBN3oAmL2LJYSM+KgcAsskb0ORFLDlsxEflAEA2eQOavIglh434qBwAyCZvQJMXseSwER+VAwDZ5A1o8iKWHDbio3IAIJu8AU1exJLDRnxUDgBkkzegyYtYctiIj8oBgGzyBjR5EUsOG/FROQCQTd6AJi9iyWEjPioHALJFGNCKpj6f66bI3g2hQ7DQsBEflQMA2W4c0Ird9C4M+9w9czh2jxwP/pHt9LXH0UL8v7Iss28933m7m0kkNGzER+UAQHfl0IaPtZcrh2pcc1A5QCUqBwCqK4d6/GB7sXLoXtx0S2WfAxSicgCguXJoun/sg6JgrXLol9Efn6BygEJUDgBku/Xwe1UaJzPw7+yfzVALnPMsy8/2z11hZkzaF9hi4mxf6iZAmIpia5aw7yZTUjlAISoHALLdbeKePd5w6v9ZhrsQ3LGIsnvOVRX9P/2UiJ19S+UfoXKAQlQOABRXDm4XRBGWCsf1ysG8+mgPZdT+ESoHKETlAEBv5ZDbAxJdGeBOs+hPnJhVDrZmKO3DXbFB5QCFqBwA6K0cqm146MGddLmt1ioHc5xiW2Xn4EVUDlCIygGA3srBnlmx7a/OkG/DUy5nlYMpE/aFe5O78AOVAzSicgCgt3Iox9d1KvZhrTCtHOyhjaM/aOEXwT4HKETlAEB75VDcVjl0+xrs41t3niaVAxSicgAgW8R9DvnFyuHYzW84D49TOUAhKgcA2uc5HG6a52B3SGzLpmnOwzKoHKAQlQMAvZWDu8x0Mz634rBcOXTXqfbcvEoqByhE5QBAb+XgJjacR0/20x4mlYO7OPXAPkHlAIWoHAAovobkMZzo4KY5rFxDcnbHLPs6KgcoROUAQHHl4A5BHMO9Cs1y5WAvGrU/18ZQb1A5QCEqBwCKK4fC3rhiczT3yrRVwOZULFcOdXBcw+2cMCWGfc/J3lmzLMvq1u1uJpHQsBEflQMAxZWDv/70ZrPt/j+M/qPKwf2j2x9x6soIV210zrdudzOJhIaN+KgcAGiuHPx9tsfzHhcqB3sWRn+dantrLHPXKyoHKETlAEB15ZA1fm+D3ePQT3KYVg7t6EiGPX3T3CmLygEKUTkA0F05ZPm5O1Jx7q8mOascTqPbcfd356ZygEJUDgBki3H4vWrruq36uZFvmdAJA0LDRnxUDgBkkzegyYtYctiIj8oBgGzyBjR5EUsOG/FROQCQTd6AJi9iyWEjPioHALLJG9DkRSw5bMRH5QBANnkDmryIJYeN+KgcAMgmb0CTF7HksBEflQMA2eQNaPIilhw24qNyACCbvAFNXsSSw0Z8kxvOAwCwLAOoHAAAN8sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACArMjzYS3keWH+V+Sd4J/2z17V1u3B/VmET81e2i8q+JjZ+4qmrst88kT4vHuumC58GtnSh40+eNKyLCvKui5HTZsto1hr+rAwv7zho7r3jD7rpo9fW9lV8Ipp2yafMottcS3Pog3fkS8Fu94D3aNLyTRZhTf36nw1LK7A4BP9n5M1uLi06b/nLwoSPDB59FDWdTP5pHBlFTd2epYd2rpt5qtowYWsc/GM10b/16hvp329GP9SC6d/Lr1n4Ws5enL++GiNjJK6i++WpA/X4WRVTTcoo1S5nE79Gxe+UrNPvOnrOnz0tQ3lwlej+9fw0SsJMf+ide/rO3StO/tPna/jMDft30O44Xdj+as4yexpD+fhUwvhzFq0mMV4R+rNpu7+bjebs3/M2xdZVuy6f7Rdz7Vb+8DJDjC7TdsvrXKv3J6a8QPG5CtW7LoPLo7uBTufd/XmZD6o3mz896/Ybcogrv25S9Au0K17ZOnDqs122NT3TfENLfwCjkPezZaR7zfbIC2Dpp+Hl242pyxrhhfW5t/Dwvz6uOHju5dsT+XkE7f+gWLvVobZCmxt2yaf4l8UKJfW8jTaoOEb89Q02DC6XZcJkxctJdNkFc569doyR8aZmWXZ0bdu6Olpus7espSm0xc1bv3thgFg0vd2Kf6TzsV4IfvabfbcF+OGTs/yk4vHfpFGXygbzLFfqdk864YE90HvbaP6h4uT/TqN8nra14vxL7Tw7NJ6oXHDtmGew+Ov4Cx9J2vEv3r8Pbwh6UfrcKlXi91m54M8bG2j55k2Sqc+/ez3Y/6VWvjEW76uo3XUZ/3Stmvpq+E+LPzolYSYbz6zLCt9cO2V7nRtX9iw1Jt9ly65aVnft6NvzPSruHOfP87sSYvr+bZjvnUZtWg5i/GO1Jv++1ScLlcOm83OVYcmbU/H3cbmx1Ll0L/0lsoh35vcPJr/NpPKwf5/VjkMX/ThAfvWO1cO581mfzSfvO9fM1tG2Q29s6bfXjn4z7vh44OXHPuxcbMzn+gbvb4RDYbahc3cdC1/ncqhX8j8uz1LpskqnPXqtWVOs3U0wptWHcc9PU3XC5XDkKaTFzV2XZkFBVu6cdq7rfD+eNouLeSwXjksdLppxc4uyfT5ePtaNKdhpfr3j7KuT/B20y3FvL1/+Oy29XeoHPrQZi28NNT4lyzk8LXKYbxG7lg5dKt1vA6XssWE1V6uHMbp1Ie9XDksfeItX9fJOvJZf6lyCL8atgWjj16vHCabT/fjYXc87ftUvK1yCL6J1bYPz25Aur4df2PmX0W7iq5VDrvJtmO+dRm1iMrhvTLfLl/JHbZ95RBuqvwQX1RH/7T5v90rdjJbi0nlsK2yLC9PG1+bugeWdJVD/4Wu9v61Q+XQZXxfOeyKrDi0Xeb7QItDvbUft/Rh08oh/PnW+DL3cBraO1vGcTN8wSZN9ytt9FWaVA5mYUVe7tz27/rHu5cUuRkv7JO1/y2WH/0DSxvR0acM2uEHwnwtz6N139m++BgHG0ZXmY1Vs/CipWSarMJZr15b5sg4M01Nctx3zRg2V6N0nb5lMU0nGb93GVicw1yY9H213ezts223yfPZaFpi/+i3xtc6/ey7pNzXs+2r3VM0a0GQdV2Cl93upNpX0e7h1i97/t0I+jpcuX38Cy1cGmrG24alHL5SOUzWSF85hPFeT/rxOgwbFITVBTJUDuNMG6dTX0UM34/wK7X0ibd8XcN1NGT90rZr6avRLn/0PCHmm09TY7j9OqXb6bDWnZ2FDUux6/vZvrv70o2/MeOvYt7sXCjTymHU4nq+7VjYukxatJDFeEfqTb/q+z/90N31Td/f7udLM/wSmxWS4Q8g+7UbbTVGurRo+9+jB59+feVw8l/ToXJwcZnaefSAialZ/rBp5RDuWjwPVe7y603ab/dVvzWZNN0Gve3yfbly8LuMd2Z13PDxw0uO9ofSYdv9oimO/Zd0vhENP2XQDj+z52t5sXLIRpXDeDds+Nhh77pm8qKlZJqswlmvXlvmyDgzzUpqjl3Dhs3VKF2nb1lM0/GLhm1a8OC070/9ToPSP9MvpLTbwGFrfKXTg+N2o5XsWrzbbRcrh2rcltx3a7cU/3DT9fvCd2NeOYziX2jh0lAzWtmLOXylcpiskaFyCOK9mvSTdThpkH/htmvxUDmMM22cTru9Hy/HlcNw5GD+ibd8XcfrqMv6pW3X2ldj4aPnCTHffHYlWv++C90ZLmm0YemrMffaWZ0X9mG/OP/+WeVwuLztKOZbl3GLDCqH96Te1Hv3ZSh2+/PlysH2tT9uuvD0KBvOSxuAUPdzZRd+LW3695VDfex3S4wLhe6QZfjAkMZ3qBz6j15+vfsZkp26UnfS9NsrB7+75PrHDy9p7HvrIZzD1q2w9Y3o9Pf1aDM3Xctfq3LotkKz7/Y8mcarcN6r15Y5MikD8u0+L7vgZ5WDe+Bi5dCl6fhFbtVPmj7p+yo4knGaZGO+N8+tVQ6zTi/sy4d/Ttvf3lI5tJOY3cM+Z+5YObj4F1p4YagJlj/N4auVw2iN3LVy8F+t8TqcNMiHtS33boBbqRwm6bTrVvxy5bD8ide/rrN1NN8xs/aibq3PP3qpcphuPn0nDm6uHIINS18jVLY1fYE6in6hiD9drxzq6bZjvnWZtMi1in0O74XtDr+/7FhfqRxMshy2Q6+Nnx5lg//iXK0cqmBx+d4+1FcOZ5ed88ohK13+fs3Kob32evszpMxa/w2bNv1OlcOpuOXjp2VauBfh6PYmX9yIjka3YTO3sJa/XuXgN0NL3+1JMo1X4bxXry1zZNJAU5P4UWCpctherxx8mo5fdNjOI5j2fTBVrPuNPsnG5a3xQqebsm7x+3aHyqE4jXc3uYfzfX8M/i6Vg4tgoYWXKodhWJyWE1cqh8kauUfl4L5a826ebccq/8hK5TBJp13un1/b5zD7xJu+rpN15LP+cuUw/mosfPRS5TD5os23XnepHPodWt1L3Dfav2TyjZl9FY8LlcC8cjhOth2zrct0QHBrhsrhvag3dePS/bxprlQO9iBfOUnxlcohO4WZtV45lOGsWPeeoXLIjt1erknl4L8F/QPuMN9dK4fDtp8Cvfx68zNkm/df+WnT71A52A37DR8/vKQ0KzsPv+3u4y9tRCfDx7CZW1jLX7NyaO3b55XDLJnGq3Deq9eWOTIpA+yu5W53xmxz5Y5JX64cxik3rIX+dILOtO/d+xzfS8NvdpuNy1vjpU438wgOX69yGCVK93DR7d296z4HG/9CCy8MNeM5NWEOX6scJmvkzpWDS/rxOpw0qAursecDrFYOk3TaF41r1GLlsPSJN31dJ+vIZ/2VymH81Zh/9GLlMP6izbdet1cOwYale9PJvrR7yfgbM/0qVlv7Q+9a5dBMth3zymEyILhPpnJ4L+rNOd+b70ex3+f90Yp9adlkHPp/b56ugznqo6cn2eAOX1abTW0X1axUDqPFuff0lYP5BeC3wZPKoRjtnTC/uNwmav5h08rh6FqW95P+w/PJ5vlsd14Onz9u+u2VQ9vNkLz28ZNDg9WwdNu86uJG1H3KYNjMLazlGyqHUbCj6PrZU+MXLSXTeBXOe/XaMi+MBbYm6XdnzDZXNl0nybySppMXmbnrm/7c3/katJ8ybLAm2eh/rQ9b42ud7ibkN1+nchglSrcuz8PpAUvfjdXKwca/1ML1ocav7HED/E/wa+dWjNfIcG5FEO8NST9ah12DJtuxxn8lliuHaTrtc7+KliuHhU+86es6Xkdd1i9tu5a+Gu3yRy9VDpMv2nzrtdSdYa4ublgqt92YdMP4GzN8Fc3i2pM/7jWtHEYtrufbjtnWZTogGFQO74kp5M6mHxr7x/isTFsCmn1jdV2fd+7Mq2FC0+XKwR0aq1bPt/WVw2hxLrmDyqGfHzCtHNxmrd7s67quT9vJWZnBh62clem/CJU5024b/r40y9ga7ieUq6z9pmPa9Bsqh825rmtzxtn5to83a6UoikO5s9PTRvOP3RlRiyeohZ8yGDZzC2v5hsphepbYaFNm2z150VIyjVfhvFevLXOk9p2ztZnpjkl3+8mHzVWYrpNkXknT6YsKe6rbKRiMJ33vh9J+tfizOPKiyJuj21AOW+NrnW4myZvRs/walcN0an612R43m214kuH0u7FwbkUQ/1ILl4aa0cpeyuGrlcN4jUzPynRj/A1JH67DrkGT7VjjtzrBWZkunZrFdMr9j+WVymH+iTd9XcP1519XLW+7lr4a7fJHL1cOoy9an8GFceWsTH/YYGHD4htU+vNv+kmU4Tdmdlbm8bBYOYQtrufbjtnWZTogGFQO74npsMpk0HlTDZXDvh3V6r6H7Xf7zpXD5X0OVyoHOxnoQuXgnfyX/Y77HMzzx+F0ab+M/c6wH5X7zdR0FvjtlYPjvuM3fPzwZbG7I6ebopV9DqNPiVc5XNzn0G3KJvscZsk0XoXzXr22zJG66516qEm6BUw3V34oGifzauUwfVFem4vmDOP7tHIITxibZqPb+b6yz2Gh0w1z5psbfWNVDubcenfO0c37HML4l1q4PtSEldAkh69XDqM1cvM+h3nSD+uwa9BkO9b4uXxD5bC12eSuXzRLJ/s76bReOcw+8aava7j+htdd2+cwqRymH71SOYRftC6D3UWkqpv2OSxtWM62EPNzFYO+Db4xk30OprCsb9jnkE22HQv7HMYDgmsORyveC9NhxW6b5/uduajI8jyHc1WV3SG8ux6tuDLP4fLRCneo9MLRil1VVf20pLvOc3Bys1O3/8KPl1Fu9mXTNKWbAHSfoxVlVfUnrN3w8cVusz+djmd/HdfgNG27/PGmyI/Gk0+Jd7Ti0jwHN5t64UjkNJnGq3Deq9eWOTLKzHy7qZumafwB+WFzFabrtXkOo5QbN9ZcDbC+09GK7el0OnYX910+drzU6T4o88O9uGflMEoU97D9oeim6d06zyGM/9ajFaOVvZTDq5VDMKkyWCPX5jlcTPpuHa7Nc7BDXj8Ncrym5+mU273w5hDHWuUw+cSbvq7h+vOvm04jXXvRZOgNPnqlcgi/aF0G16fT6eqE125JC+vYTv7I9+7zxn3bfWNmU47K7mjtpXkO5+m2Y7Z1mQ4IBpXDe2LnorSbsjFdfumszK5kvXGG5NIxzpUZksML3EScUeVQnDZ1N2tpNEOy6R9oukuI3K9ysAV9v2kYL8PV53avxvUZkqNfssFg1m+Db/j46aHX8PwrP0tqeMgfcpx8ysoMyelankd7p8phdCz/UjKNV+G8V68tc2SUmeb4uP/FG4w1k3S9Ujn4NF16kY2yr66mfX8M5g9O5+uOVtYNnT60ziznvjMkx2+q3AX3+knvd5khudrC0VATdN54h8y0AdPKYZK+kzWyVjncmPRuHV6oHA7bbbVYOczTKfcr/1LlMPrEm76u03Xksv5K5bD81Rg+eq1yCL5oQQYXbtxf687O8jq2RUPle3wStv/GzCoHN7PxauWQjbcdi5VDOCAYVA7vie2ww/Z0NN14qXLwJ/PNTllbqRz8y65WDuHi/N+jysFW6rPKwZ837R/ofljdt3IIT0Abvd6cs2f3lrnPWzlbr5r/6aYAdwvrvrM3fPz0JeEE9/7MrO6HsJ/6PfmUwbCZW1jL82jvUjn4C0QsVQ7jZJqswnmvXlvmZE0FmXny+zJbt3Eeb666dL1+VmaQcrPXDb8hp30fnkvo/75T5TA66XF4x/G+13MIEyVsYvcxd68cFlvYRWJ/i89XdtjwWSjdk5P0nayR5crh5qQPT4xcrBzMo4uVwzyd/GvK8mLlEH7iLV/XyTryWX+5clj5agwfvVY5BF+0IIN95bDWnZ2VdWwOVHQnTk3Ddt+YeeXgLuB9tXI4jLYdi5VDOCC41czRivfCpcDJ/SK8eCWobksyuaDISuXgL6F2sXJoJ4sb1wM+UUxQ/sJu4aVq/A9Yf3r26Ej33SuH4KTF0ev7bbb/5TC7lsroKzv84uh+aHTfIL9BueHjpy/pLh7svpT2qWPfO/43w+RTwjf3m7n5Wp5He5fKoVy6nuxSMk1X4axXry1zJMxM8+MxXA+TzVWXrpcrB5+mK5WDOz1xtgbdpw8X5POn19+tchidKNt/xr0rhyBRRk3M/UkPd68cFlo4XPCnWV7ZYcNnoTiz9J2skcXK4Q5Jf7pWOZgzM90lTUeBLqST7Z9ms7+8zyH8xFu+rpN15LP+cuWw9tU4Xa0cgs3nkMG+cljtzvGSpuu4sVe6WN7N674xS/scbqocstG2Y7lyCFrkWkXl8F64DvOZebFy6Arcpp9pW5hTqRYrBzPTdjqDptc04THB4ZqolZ8JPqkc8v12Ms8h343vcDHc1edulUM95HW/bR693uwYC7/1k6b7ZvRb7GP3o6Kr0ruFVW6i2g0fP9025Pvgaq9u6e6Yobsmbb3wKYNgMzdfy/No71A5NP6KyIuVwyiZpqtw1qvXljkSZuYwoI6OFE/T9VLl0Kfp5OrT3XQ/d6i6X4Ojvj/2z3X7jG+qHBY6PXczz7uf7verHEyidNdID6YL9BdNu3vlsNDCfDtc3WvUV6NLIF2uHGbpO1kjy5XDtaSfrMNLlYM5LWChclhIJ7c+j5tg5By+UoufeMvXdbyOuqy/WDlMvhoLH71eOQybzyCDXeWw2p2TjptsWPL9ttz61dD11vgbM6scGluF3lA5lOG2Y6VyGFpkUDm8J67DcvdV6iuH3WG463nff9134OhvnHKY71ytNtsmP1T1vrutmX1gfJv3xk6iNtd1776ZbkJuufXXyZ9UDvYmgH7TvDvkh+bsbwcYlBLuh9XCh4WPuUN2w/3cm+4sojq4zm6Yz+PZj4dZ0yevsQs0z5bd4NwvzF9P7vrHz4aN7kZGB3/XGPu1tzdSPuwm9UlYgSydfD5ey/NoZ5VDEGz42MHcKcoNKpMXzZNptgpnvXptmeV2uKnkaCwYapLuasnjzZVP13Eyr6Tp6EX5frMv7dZ8uBfEvO/NrcNt/OY+QtnFyuFKp5vyxd4l6dQdV75H5WATxV5ux5XRw+lybn/BwnfjWuUwb6EN1T8Snj8SjI/LlcPwFZyl73SNDJVDGO+1pJ+sw65Bk+2Yv+OkSbVZ5bCQTnl//6WFymHxE2/5unbraJz1S9uupa9Gu/zR65XDsPkc7njV+lcvdGf41VvbsBw3/dU7/CybyTcmmKycmwYc3Z3lgsXPM7KeD0SzrcusRVQO748/YOU2q9PrOYR37rHfOFeZmklv+52/Le6kcujP4O1q0l6/69PcoXA3zFv3i9v2s82nlYM5y8tXDqPT3oJtndtLuPBhwWPjO0fv/PK25o5CwSYzrByCkdfv2x83fVo52Bve2pb4Z/uFuT2/N3z8/Ad33X3icLx02z0yunjiaP/yNP75Wp5Hu3Y9Bxvs5DF/CbtZi6bJNFuFs169tsxTeCWGYHAb7+wJbts3SddxMq+k6fhFZgVvdpM1M+v7yqxL2w39BZRWKocrnZ6bV7gOne2kKE+n036z3Z1OzbV5uWZ76uIZTzByN71a+G5cqxzmLbShbne7fsXNtg2jB2dr244K0/SdrJHhrMxRvFeSfrIOuwZNtmPdGarbeeWwlE6+1DR3d17Y57D0ibd8Xbt1NM76pW3X0lejXf7oC5VDv/l0d9ne2+5z+0MWujPM1bUNi5lL2p/s68q/8Tdm+Cp27E1Xg3/PM7KeD0Szr86sRVQO709/d4HrlUN/6M7UrHazOyvcfTbsg6uJLXwh3B3lh88NF7dQOfQ3/HNxbXf99ebCK+2f7l45uEvQbDbbethihpVDuGntZppPYh1XDt2z9rf8aGF2csENH7+wq97co3Z8yThzOpZZy+Nv7zCFYfmg7DTyWbQ3Vw7bY3C9w/F3e5pMs1U469VryyzDW0UGg1vYOHu8ZbaL1KXrhcphSNPJi/LzbF0trEFzJ2UTeTAL7HrlsNTpmblvfN+hoxQYAmuvntHj08JdnCDIY3tY6j6Vw6yFfvAx0Y/aGG4brlYO0/SdrJGVyuFq0o/W4eXKwRyHmW66ltKp62c/q2r6soVPvOXr2q2jcdZfqBxGX412+aMvVA7D/VL9BaSCq2/MuzPM1bUNS77t53r202lG35hJ5bA92R0SN1UOzuXKIWwRRyuEOZRtM79Qz63yph1f5qcqS38W/DtWNKNLBH39pld3WjG3fXzelJNlmhW4MvP0gvlavlu070exn99S9O1bzshJ398je1bedbhXh07dLy3uFqt9pIgb561fg8uti7MO72L5E2N9Xe/x0deZUKrI3fmet+EAMNOsT5gEAAAYO+yD6wkDAABcUoWnVgAAAFxUuMlVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADgLSjy8L4Aec8/cGjrthm/vmPf179w8bli+jGTVwQfXuSjp7tXZFnV1u3onkfuReO7GZgXDXedt8vqGhS0a+EOCIeyrrv2DW0ZxVXMXr/05HIDL6+y7u2ztR68O/iIfG0VAQDw7tSb0zD+VJueHU7zk/172/avKHb9K872DdvD+nObXbfow3azN3/X/Su6f/rxvthtyiw7D5+/2ZzM483e/r2rZp+yPZXdQ+3WPeIfKPZmWf5zbXxdu7anURXULX1vHw3aUveR5/vNdqhDKv/ZZ//s2QXpomrnq2BltXRP1e7t07WelZvNcXhzF8phayKZryIAAB5K5ZDvN5vd8bTdbI7FvSqHbTfgt5u1ysF/+krl0JjR/miW2y58io/qaEoL+6LzlcohHNBdVL597VrlUG42/cKycrvZ7O3rd/nXqRy6z1mrHI6bvlwxb/ZNp3IAADzAyqEf642z/2e5r7uHit2m/3uhchg/t+n+bcY/Xyr0uyHch3fjsqscrMPWD6C2BrDRFechLvcpRd6c/OLrzeZoxtn86B9YqhzM+4u83HWDs23WZrOz0dfbZq1yOG6G6qDabvY2jLYreJYqh3AVrK2W46RyGK31LN/vT10LzJrzYbnKYbqKAAB4v5XDYWnIC47ZuxFy8Q2z53ZbPwBX293WVw7Bp9l/bvb5vHLoBtJhTF2K4GirkcO22/dQHF00i5WDC7PY9ccBzB6VLhj7v6XKId/uq303YJ82e/+C0u8IWKocwlWwslr2ftwfKofRRI5ycy67BRe77cnvvhhXDqNaAwCAB1E57G8YBi9VDqdjP0TWK5VDffT7CRYrh2Yypo4/xT1bD685bO3CLlQO4U6PdrLwpcqh3Byz7vd/tR2ad3IvuGfl0PrFr1QOx02Td1VCsduWe1c+UTkAAB7+PofROH/3fQ6l+7lc7PbNSuVwrtzYvlw5HILBev4p9sPDvQjZ0Q7JlyuHfj/DKXjjWuVw3JRZ68uD2u8eMUq3M+SelUPuH1muHGzV0JUrxW5T+ZipHAAAD7xyMMfz3USA+1YOh70dbKvNsdqsVA7Z0Q7gy5VDdhrOY5h/SmmG8nw7zGA0A/rhcuUwlAujN65UDnYQ98vITsGpDP7N96sc9kXjipDlysEeqejKlWK3aXLXHioHAMBDPLeiLg0//86etTC+nMNuc7SvKPOlymH83L44+wG26SuHvXuFqw3qzdHP9lupHMzZHZvzYXEgdnsbqvCQf2XP8rxQObTDDMnRG0eNL0t/MMIN4j60Yhecl1Hs7XGRpcohXAUrq8XsUjivVg52d0NXrpjKIWv9hA7mOQAAHupZmd0YVZqRex/8Nh9OMZxeA2HhuX1RmcG92Js/xmdlHvvKwf3AX6kcssKeqHmqxvM2i6I4lDs7YXF0YkLlqpClszLPdV0f98HJktMzGsKTI7srUZxsOeAG+NEpEr6MuHBWZnNhleVZtTUfHpyVuTXsjojchtzVR7ZycB9N5QAAePD7HEztYMY9f/mCu+9zKHbbPGs2dTbsc2gn+xzcRMy1yiHL8tpc52k4ZjEMxPZIyrRyWNnn0F1FYiiCliqHyT4HN4ibYf5we+VwfZ+Du6DTKawc9jvD9oQ/rcI/ZysHNxeUygEA8NDnOfgHd8HFIO80z2FfZPWmzI7bKlub53D08xXWK4csK8w1IsMrSuxPp+PZX5J6dGmDxl23Yagc/PzLarMtq+ocTHFcuCbCfJ5DudmXTdOUdp7mrUcrbjgdJbeHYcxRiIWjFafNqWmaxp8y4ioHOxmEygEAIKNysMcYyntWDoftKd/viouVQ3Ha1P3JBIsXKyhOwzWgJ5+Sh6eOtvZlwdmkbpj2YY7GfjPJsb1SOZxG17M8BjMkDwszJMu7VA6ZOTNzqXI4uCtpG+1QORy224rKAQAgpXIIzny8a+WQnba1efRS5WD3DFysHPwEhqVPGZ3y4I4yBMcV/EkMPkx36sXSGxcrB3N5CHuUwf3+D6//4P8e3d+iuVPlYEoNf2BitBLb7niOC89XDmbFUTkAAKRUDsG5jHeuHNqNPWBwsXLIzpuzuXLCeuWQr1cO7TBfobtW07H/FL9TwIdZjIqF4I3TtriKoLtgk9+J4a8z5WOwTw1XqvJ/3V45mKJmaZ+D2f8ShNNVDubMzP5illxDEgDwICuH/Oj/kbuj+veqHPKtHR4vVw75frt89eluYqSbwLD0KSa4boDf+YkMZXdqw8EH3oVZhec8mDf6obipliqHfhD3BcixD6I7fJNvu+Mf7hpUd6kcTH0zrxyGxrtypascsnKzo3IAADwA9WZ3yB07hjX+H4W9c2VtzxM8DUObmSvgX+EPA3RvWHjOFgtuZ0JfOQSfNlQO9q6V88oh32/2pXlbNdxiYj44dzeuOuz622ft3Y2zD7u+YvAN8AP88EbzSYWbOjmtHGZXwT5s3Y28zZmiPhyzivwj9qMnq2BlleX9jIZZ5dDv5/DzKvrKoTgN58qyzwEA8P4M970+jS5pUGdZbs5/3O/2K/e43o2ugbDN58/ZYqHwY/fkLtt2VO4rB/PWpftWmOmCu525uXU/ts5/1td9mP30hm33iL/lxHC/yfC+laZe2fbtm1YO7vpL4TRMs1j3+m5nhVlF251pt7vr1mQVLK+yrgAw9xgfRWcPVvSTOO2sjL5yMIdiqBwAAA+6csiy1oySG/cD/r6Vg3Olcsiaxcohy8/uVAN7G+0+gukBgcZ9cHC1S3MmaRB4eN+K8HiMf5nd8zCrHIJBvDuv4uDPtgiuLmEus7nZbIPbid9cOZibdU4+ODxV1J78MVQO5mAJ+xwAAA/doWnLxUmT70xVls30vlszeVM2+eSRmwK/8WXD6+vpnTSKpiyrqwECAACVzKUlZqd+AAAALDM34drVbTu+0SYAAMCi/DSexwAAAHDJoT6djuxzAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIBs6v8PpV86FTIQVNwAAAAASUVORK5CYII=";
  drawNoelModel(pdf, background, items, assistant, signature);
  await ajouterImagesAuPdf(pdf, items);

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

  $("assistantNomNoel")?.addEventListener("input", async () => {

  localStorage.setItem(
    `assistantNomNoel_${uid}`,
    $("assistantNomNoel").value.trim()
  );

  await saveData();
});

  $("moisNoel")?.addEventListener("change", async () => {

  localStorage.setItem(
    `moisNoel_${uid}`,
    $("moisNoel").value
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
  if (!ensureGlobalPinExists()) {
  window.location.href = "index.html";
  return;
}

const ok = await requireGlobalPin({
  title: "Accès au module Noël",
  message: "Entre ton code PIN pour accéder à ce module."
});

if (!ok) {
  window.location.href = "index.html";
  return;
}

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

  await loadProfileNoel();
await loadData();

bindEvents();
render();
  });