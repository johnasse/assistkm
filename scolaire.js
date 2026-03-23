import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisScolaires = [];
let uid = null;
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

function saveData() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisScolaires));
}

function loadData() {
  fraisScolaires = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
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

function updateNomJustificatif() {
  const file = $("justificatifScolaire").files[0];
  $("nomJustificatifScolaire").textContent = file ? `Fichier sélectionné : ${file.name}` : "";
}

function resetForm() {
  $("dateScolaire").value = "";
  $("enfantScolaire").value = "";
  $("typeScolaire").value = "";
  $("ecoleScolaire").value = "";
  $("objetScolaire").value = "";
  $("montantScolaire").value = "";
  $("justificatifScolaire").value = "";
  $("nomJustificatifScolaire").textContent = "";
}

function getTotal() {
  return fraisScolaires.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

async function ajouterFrais() {
  const date = $("dateScolaire").value;
  const enfant = $("enfantScolaire").value.trim();
  const type = $("typeScolaire").value;
  const ecole = $("ecoleScolaire").value.trim();
  const objet = $("objetScolaire").value.trim();
  const montant = parseFloat($("montantScolaire").value);
  const file = $("justificatifScolaire").files[0] || null;

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

  saveData();
  render();
  resetForm();
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

function supprimerFrais(id) {
  fraisScolaires = fraisScolaires.filter((x) => x.id !== id);
  saveData();
  render();
}

function viderListe() {
  if (!fraisScolaires.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisScolaires = [];
  saveData();
  render();
}

function render() {
  const body = $("scolaireBody");
  body.innerHTML = "";

  if (!fraisScolaires.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    $("totalLignesScolaire").textContent = "0";
    $("totalMontantScolaire").textContent = "0,00 €";
    return;
  }

  fraisScolaires.forEach((item) => {
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

  $("totalLignesScolaire").textContent = String(fraisScolaires.length);
  $("totalMontantScolaire").textContent = `${getTotal().toFixed(2).replace(".", ",")} €`;
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

async function ajouterImagesAuPdf(pdf) {
  for (const item of fraisScolaires) {
    if (!item.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

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

async function genererPDF() {
  if (!fraisScolaires.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const assistant = $("assistantNomScolaire").value.trim() || "-";
  const mois = $("moisScolaire").value || "";
  const total = getTotal();

  let y = 12;

  pdf.setFontSize(14);
  pdf.text("Frais scolaires", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  fraisScolaires.forEach((item) => {
    const line = `${formatDateFr(item.date)} - ${item.enfant} - ${item.type} - ${item.ecole} - ${item.objet} - ${item.montant.toFixed(2).replace(".", ",")} €`;
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

  const filename = `scolaire_${new Date().toISOString().slice(0, 10)}.pdf`;

  savePdfToHistory(pdf, {
    mois: formatMonthLabel(mois),
    nom: filename,
    type: "Frais scolaires"
  });

  pdf.save(filename);
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("btnAjouterScolaire").addEventListener("click", ajouterFrais);
  $("btnResetScolaire").addEventListener("click", resetForm);
  $("btnPdfScolaire").addEventListener("click", genererPDF);
  $("btnViderScolaire").addEventListener("click", viderListe);
  $("justificatifScolaire").addEventListener("change", updateNomJustificatif);

  $("assistantNomScolaire").addEventListener("input", () => {
    localStorage.setItem(`assistantNomScolaire_${uid}`, $("assistantNomScolaire").value.trim());
  });

  $("moisScolaire").addEventListener("change", () => {
    localStorage.setItem(`moisScolaire_${uid}`, $("moisScolaire").value);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;

  $("assistantNomScolaire").value =
    localStorage.getItem(`assistantNomScolaire_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  $("moisScolaire").value =
    localStorage.getItem(`moisScolaire_${uid}`) || getDefaultMonthValue();

  loadData();
  bindEvents();
  render();
});