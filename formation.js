import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let data = [];
let uid = null;
let eventsBound = false;

const $ = (id) => document.getElementById(id);

function storageKey() {
  return `formation_${uid}`;
}

function save() {
  localStorage.setItem(storageKey(), JSON.stringify(data));
}

function load() {
  data = JSON.parse(localStorage.getItem(storageKey()) || "[]");
}

function getDefaultMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function isImageFile(file) {
  return Boolean(file && file.type && file.type.startsWith("image/"));
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

function totalAmount() {
  return data.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function updateFileName() {
  const file = $("justificatifFormation").files[0];
  $("nomJustificatifFormation").textContent = file ? `Fichier sélectionné : ${file.name}` : "";
}

function resetForm() {
  $("dateFormation").value = "";
  $("organismeFormation").value = "";
  $("typeFormation").value = "";
  $("lieuFormation").value = "";
  $("objetFormation").value = "";
  $("montantFormation").value = "";
  $("justificatifFormation").value = "";
  $("nomJustificatifFormation").textContent = "";
}

async function addExpense() {
  const date = $("dateFormation").value;
  const organisme = $("organismeFormation").value.trim();
  const type = $("typeFormation").value;
  const lieu = $("lieuFormation").value.trim();
  const objet = $("objetFormation").value.trim();
  const montant = parseFloat($("montantFormation").value);
  const file = $("justificatifFormation").files[0] || null;

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

  data.push({
    id: Date.now(),
    date,
    organisme,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatif
  });

  save();
  render();
  resetForm();
}

function viewImage(id) {
  const item = data.find((x) => x.id === id);
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

function removeExpense(id) {
  data = data.filter((x) => x.id !== id);
  save();
  render();
}

function emptyList() {
  if (!data.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;
  data = [];
  save();
  render();
}

function render() {
  const body = $("formationBody");
  body.innerHTML = "";

  if (!data.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    $("totalLignesFormation").textContent = "0";
    $("totalMontantFormation").textContent = "0,00 €";
    return;
  }

  data.forEach((d) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateFr(d.date)}</td>
      <td>${escapeHtml(d.type)}</td>
      <td>${escapeHtml(d.organisme)}</td>
      <td>${escapeHtml(d.lieu)}</td>
      <td>${escapeHtml(d.objet)}</td>
      <td>${d.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${d.justificatif?.data ? `<button class="table-action-btn btn-view" data-id="${d.id}">Voir</button>` : "Aucun"}</td>
      <td><button class="table-action-btn btn-delete" data-id="${d.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => removeExpense(Number(btn.dataset.id)));
  });

  body.querySelectorAll(".btn-view").forEach((btn) => {
    btn.addEventListener("click", () => viewImage(Number(btn.dataset.id)));
  });

  $("totalLignesFormation").textContent = String(data.length);
  $("totalMontantFormation").textContent = `${totalAmount().toFixed(2).replace(".", ",")} €`;
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

async function addImagesToPdf(pdf) {
  for (const d of data) {
    if (!d.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

      pdf.setFontSize(10);
      const meta = `${formatDateFr(d.date)} - ${d.type} - ${d.organisme} - ${d.lieu} - ${d.objet}`;
      const lines = pdf.splitTextToSize(meta, pageWidth - margin * 2);
      pdf.text(lines, margin, 22);

      const startY = 22 + lines.length * 5 + 6;
      const converted = await convertImageDataUrlToJpeg(d.justificatif.data);

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

async function generatePdf() {
  if (!data.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const assistant = $("assistantNomFormation").value.trim() || "-";
  const mois = $("moisFormation").value || "";
  const total = totalAmount();

  let y = 12;

  pdf.setFontSize(14);
  pdf.text("Frais de formation", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  data.forEach((d) => {
    const line = `${formatDateFr(d.date)} - ${d.type} - ${d.organisme} - ${d.lieu} - ${d.objet} - ${d.montant.toFixed(2).replace(".", ",")} €`;
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

  await addImagesToPdf(pdf);

  const filename = `formation_${new Date().toISOString().slice(0, 10)}.pdf`;

  savePdfToHistory(pdf, {
    mois: formatMonthLabel(mois),
    nom: filename,
    type: "Formation"
  });

  pdf.save(filename);
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("btnAjouterFormation").addEventListener("click", addExpense);
  $("btnResetFormation").addEventListener("click", resetForm);
  $("btnPdfFormation").addEventListener("click", generatePdf);
  $("btnViderFormation").addEventListener("click", emptyList);

  $("btnPhotoFormation").addEventListener("click", () => $("justificatifFormation").click());
  $("justificatifFormation").addEventListener("change", updateFileName);

  $("assistantNomFormation").addEventListener("input", () => {
    localStorage.setItem(`assistantNomFormation_${uid}`, $("assistantNomFormation").value.trim());
  });

  $("moisFormation").addEventListener("change", () => {
    localStorage.setItem(`moisFormation_${uid}`, $("moisFormation").value);
  });
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;

  $("assistantNomFormation").value =
    localStorage.getItem(`assistantNomFormation_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  $("moisFormation").value =
    localStorage.getItem(`moisFormation_${uid}`) || getDefaultMonth();

  load();
  bindEvents();
  render();
});