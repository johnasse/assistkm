import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisParking = [];
let uid = null;
let eventsBound = false;

function getStorageKey() {
  return `fraisParkingMensuels_${uid}`;
}

function getDefaultMonthValue() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${year}-${month}`;
}

async function initParkingDB() {
  console.log("Parking DB initialisée");
  return true;
}

function saveFraisParking() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisParking));
}

function chargerInfosParking() {
  const assistantNom =
    localStorage.getItem(`assistantNomParking_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const moisParking = localStorage.getItem(`moisParking_${uid}`);

  document.getElementById("assistantNomParking").value = assistantNom;
  document.getElementById("moisParking").value = moisParking || getDefaultMonthValue();
}

function saveAssistantNomParking() {
  localStorage.setItem(
    `assistantNomParking_${uid}`,
    document.getElementById("assistantNomParking").value.trim()
  );
}

function saveMoisParking() {
  localStorage.setItem(
    `moisParking_${uid}`,
    document.getElementById("moisParking").value
  );
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

function updateNomJustificatifParking() {
  const file = document.getElementById("justificatifParking").files[0];
  document.getElementById("nomJustificatifParking").textContent =
    file ? `Fichier sélectionné : ${file.name}` : "";
}

function resetFormParking() {
  document.getElementById("dateParking").value = "";
  document.getElementById("enfantParking").value = "";
  document.getElementById("typeParking").value = "";
  document.getElementById("lieuParking").value = "";
  document.getElementById("objetParking").value = "";
  document.getElementById("montantParking").value = "";
  document.getElementById("justificatifParking").value = "";
  document.getElementById("nomJustificatifParking").textContent = "";
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

function isImageDataUrl(data) {
  return typeof data === "string" && data.startsWith("data:image/");
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

function getTotalParking() {
  return fraisParking.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

async function ajouterFraisParking() {
  const date = document.getElementById("dateParking").value;
  const enfant = document.getElementById("enfantParking").value.trim();
  const type = document.getElementById("typeParking").value;
  const lieu = document.getElementById("lieuParking").value.trim();
  const objet = document.getElementById("objetParking").value.trim();
  const montant = parseFloat(document.getElementById("montantParking").value);
  const justificatifFile = document.getElementById("justificatifParking").files[0] || null;

  if (!date || !enfant || !type || !lieu || !objet || isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatif = null;

  if (justificatifFile) {
    if (!isImageFile(justificatifFile)) {
      alert("Pour le moment, seuls les justificatifs image sont acceptés.");
      return;
    }

    try {
      justificatif = {
        name: justificatifFile.name,
        type: justificatifFile.type,
        data: await fileToBase64(justificatifFile)
      };
    } catch (error) {
      console.error("Erreur lecture justificatif :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  fraisParking.push({
    id: Date.now(),
    date,
    enfant,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatif
  });

  saveFraisParking();
  renderParking();
  resetFormParking();
}

function voirJustificatifParking(id) {
  const item = fraisParking.find((row) => row.id === id);

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
      <head>
        <title>${escapeHtml(item.justificatif.name || "Justificatif")}</title>
      </head>
      <body style="margin:0;display:flex;justify-content:center;align-items:center;background:#111;">
        <img src="${item.justificatif.data}" style="max-width:100%;max-height:100vh;" />
      </body>
    </html>
  `);
  win.document.close();
}

function renderParking() {
  const body = document.getElementById("parkingBody");
  body.innerHTML = "";

  if (fraisParking.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    updateTotalsParking();
    return;
  }

  fraisParking.forEach((item) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>
        ${
          item.justificatif?.data
            ? `<button class="table-action-btn btn-view-parking" data-id="${item.id}">Voir</button>`
            : "Aucun"
        }
      </td>
      <td>
        <button class="table-action-btn btn-delete-parking" data-id="${item.id}">Supprimer</button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-parking").forEach((btn) => {
    btn.addEventListener("click", () => supprimerFraisParking(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btn-view-parking").forEach((btn) => {
    btn.addEventListener("click", () => voirJustificatifParking(Number(btn.dataset.id)));
  });

  updateTotalsParking();
}

function supprimerFraisParking(id) {
  fraisParking = fraisParking.filter((row) => row.id !== id);
  saveFraisParking();
  renderParking();
}

function viderListeParking() {
  if (fraisParking.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisParking = [];
  saveFraisParking();
  renderParking();
}

function updateTotalsParking() {
  const totalMontant = getTotalParking();
  document.getElementById("totalLignesParking").textContent = String(fraisParking.length);
  document.getElementById("totalMontantParking").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function addWrappedText(pdf, text, x, y, maxWidth, lineHeight) {
  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  return y + lines.length * lineHeight;
}

async function ajouterImagesAuPdf(pdf) {
  for (const item of fraisParking) {
    if (!item.justificatif?.data || !isImageDataUrl(item.justificatif.data)) {
      continue;
    }

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

      pdf.setFontSize(10);
      let currentY = 22;
      currentY = addWrappedText(
        pdf,
        `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.lieu} - ${item.objet}`,
        margin,
        currentY,
        pageWidth - margin * 2,
        5
      );
      currentY += 4;

      const converted = await convertImageDataUrlToJpeg(item.justificatif.data, 0.88);

      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - currentY - margin;

      let imgWidth = converted.width;
      let imgHeight = converted.height;

      const ratio = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
      imgWidth *= ratio;
      imgHeight *= ratio;

      const x = (pageWidth - imgWidth) / 2;
      const y = currentY;

      pdf.addImage(converted.dataUrl, "JPEG", x, y, imgWidth, imgHeight);
    } catch (error) {
      console.error("Erreur ajout image au PDF :", error);
    }
  }
}

async function genererPDFParking() {
  if (!fraisParking.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const access = await requirePdfAccess(auth.currentUser);
  if (!access?.allowed) {
    alert("Limite PDF atteinte pour ce mois. Passe en Premium pour débloquer l’illimité.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  let y = 12;
  const assistant = document.getElementById("assistantNomParking").value.trim() || "-";
  const mois = document.getElementById("moisParking").value || "";
  const total = getTotalParking();

  pdf.setFontSize(14);
  pdf.text("Frais de parking", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  fraisParking.forEach((item) => {
    const line =
      `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.lieu} - ${item.objet} - ` +
      `${item.montant.toFixed(2).replace(".", ",")} €`;

    const lines = pdf.splitTextToSize(line, 180);
    pdf.text(lines, 10, y);
    y += lines.length * 6 + 2;

    if (y > 270) {
      pdf.addPage();
      y = 12;
    }
  });

  y += 4;
  pdf.text(`Total : ${total.toFixed(2).replace(".", ",")} €`, 10, y);

  await ajouterImagesAuPdf(pdf);

  const filename = `parking_${new Date().toISOString().slice(0, 10)}.pdf`;

  try {
    savePdfToHistory(pdf, {
      mois: formatMonthLabel(mois),
      nom: filename,
      type: "Parking"
    });
    console.log("Historique enregistré");
  } catch (e) {
    console.error("Erreur historique :", e);
  }

  pdf.save(filename);
}

function bindParkingEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("btnAjouterParking").addEventListener("click", ajouterFraisParking);
  document.getElementById("btnResetParking").addEventListener("click", resetFormParking);
  document.getElementById("btnPdfParking").addEventListener("click", genererPDFParking);
  document.getElementById("btnViderParking").addEventListener("click", viderListeParking);
  document.getElementById("assistantNomParking").addEventListener("input", saveAssistantNomParking);
  document.getElementById("moisParking").addEventListener("change", saveMoisParking);

  document.getElementById("btnPhotoParking").addEventListener("click", () => {
    document.getElementById("justificatifParking").click();
  });

  document.getElementById("justificatifParking").addEventListener("change", updateNomJustificatifParking);
}

document.addEventListener("DOMContentLoaded", async () => {
  await initParkingDB();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  fraisParking = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosParking();
  bindParkingEvents();
  renderParking();
});