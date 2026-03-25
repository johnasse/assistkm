import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

let fraisFormation = [];
let uid = null;
let currentUser = null;
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

function updateNomJustificatif() {
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

function getTotal() {
  return fraisFormation.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

async function ajouterFrais() {
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
}

function viderListe() {
  if (!fraisFormation.length) return;
  if (!confirm("Voulez-vous vraiment vider toute la liste ?")) return;

  fraisFormation = [];
  saveData();
  render();
}

function render() {
  const body = $("formationBody");
  body.innerHTML = "";

  if (!fraisFormation.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-cell">Aucune dépense enregistrée</td></tr>`;
    $("totalLignesFormation").textContent = "0";
    $("totalMontantFormation").textContent = "0,00 €";
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

  $("totalLignesFormation").textContent = String(fraisFormation.length);
  $("totalMontantFormation").textContent = `${getTotal().toFixed(2).replace(".", ",")} €`;
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
  for (const item of fraisFormation) {
    if (!item.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

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

function addPdfToGlobalHistory(blob, fileName, monthLabel) {
  if (!currentUser) return;

  const storageKey = `historiquePDF_${currentUser.uid}`;
  const historique = JSON.parse(localStorage.getItem(storageKey) || "[]");

  const reader = new FileReader();
  reader.onloadend = function () {
    historique.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      mois: monthLabel,
      nom: fileName,
      data: reader.result,
      dateGeneration: new Date().toLocaleString("fr-FR"),
      type: "Formation"
    });

    localStorage.setItem(storageKey, JSON.stringify(historique));
  };

  reader.readAsDataURL(blob);
}

async function genererPDF() {
  if (!fraisFormation.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  const assistant = $("assistantNomFormation").value.trim() || "-";
  const mois = $("moisFormation").value || "";
  const total = getTotal();

  let y = 12;

  pdf.setFontSize(14);
  pdf.text("Frais de formation", 10, y);
  y += 10;

  pdf.setFontSize(10);
  pdf.text(`Assistant : ${assistant}`, 10, y);
  y += 6;
  pdf.text(`Mois : ${formatMonthLabel(mois)}`, 10, y);
  y += 10;

  fraisFormation.forEach((item) => {
    const line = `${formatDateFr(item.date)} - ${item.type} - ${item.organisme} - ${item.lieu} - ${item.objet} - ${item.montant.toFixed(2).replace(".", ",")} €`;
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

  const fileName = `formation_${new Date().toISOString().slice(0, 10)}.pdf`;
  const pdfBlob = pdf.output("blob");

  addPdfToGlobalHistory(pdfBlob, fileName, formatMonthLabel(mois));
  pdf.save(fileName);
}

async function loadProfileFormation() {
  if (!currentUser) return;

  try {
    const profileRef = doc(db, "users", currentUser.uid, "profile", "main");
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
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

  $("btnAjouterFormation").addEventListener("click", ajouterFrais);
  $("btnResetFormation").addEventListener("click", resetForm);
  $("btnPdfFormation").addEventListener("click", genererPDF);
  $("btnViderFormation").addEventListener("click", viderListe);
  $("justificatifFormation").addEventListener("change", updateNomJustificatif);

  $("assistantNomFormation").addEventListener("input", () => {
    localStorage.setItem(`assistantNomFormation_${uid}`, $("assistantNomFormation").value.trim());
  });

  $("moisFormation").addEventListener("change", () => {
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

  $("assistantNomFormation").value =
    localStorage.getItem(`assistantNomFormation_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  $("moisFormation").value =
    localStorage.getItem(`moisFormation_${uid}`) || getDefaultMonthValue();

  loadData();
  bindEvents();
  render();
  await loadProfileFormation();
});