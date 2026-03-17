import { requirePdfAccess } from "./premium.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

let fraisLoisirs = [];
let currentUid = null;
let eventsBound = false;

function getUid() {
  return currentUid || auth.currentUser?.uid || "guest";
}

function getStorageKey() {
  return `fraisLoisirsMensuels_${getUid()}`;
}

function getAssistantNomKey() {
  return `assistantNomLoisirs_${getUid()}`;
}

function getFallbackAssistantNomKey() {
  return `assistantNom_${getUid()}`;
}

function getMoisKey() {
  return `moisLoisirs_${getUid()}`;
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUid = user.uid;
  loadUserDataIfReady();
});

function loadUserDataIfReady() {
  if (!currentUid) return;

  fraisLoisirs = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");

  chargerInfosLoisirs();

  if (!eventsBound) {
    bindEvents();
    eventsBound = true;
  }

  renderLoisirs();
  updateTotalsLoisirs();
}

function bindEvents() {
  const btnAjouter = document.getElementById("btnAjouterLoisirs");
  const btnReset = document.getElementById("btnResetLoisirs");
  const btnPdf = document.getElementById("btnPdfLoisirs");
  const btnVider = document.getElementById("btnViderLoisirs");
  const btnPhoto = document.getElementById("btnPhotoLoisirs");

  const assistantNom = document.getElementById("assistantNomLoisirs");
  const moisLoisirs = document.getElementById("moisLoisirs");
  const justificatifInput = document.getElementById("justificatifLoisirs");

  if (btnAjouter) {
    btnAjouter.addEventListener("click", async (e) => {
      e.preventDefault();
      await ajouterFraisLoisirs();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      resetFormLoisirs();
    });
  }

  if (btnPdf) {
    btnPdf.addEventListener("click", async (e) => {
      e.preventDefault();
      await genererPDFLoisirs();
    });
  }

  if (btnVider) {
    btnVider.addEventListener("click", (e) => {
      e.preventDefault();
      viderListeLoisirs();
    });
  }

  if (assistantNom) {
    assistantNom.addEventListener("input", saveAssistantNomLoisirs);
  }

  if (moisLoisirs) {
    moisLoisirs.addEventListener("change", saveMoisLoisirs);
  }

  if (btnPhoto && justificatifInput) {
    btnPhoto.addEventListener("click", (e) => {
      e.preventDefault();
      justificatifInput.click();
    });

    justificatifInput.addEventListener("change", updateNomJustificatifLoisirs);
  }
}

function chargerInfosLoisirs() {
  const assistantNom =
    localStorage.getItem(getAssistantNomKey()) ||
    localStorage.getItem(getFallbackAssistantNomKey()) ||
    "";

  const moisLoisirs = localStorage.getItem(getMoisKey());

  const assistantInput = document.getElementById("assistantNomLoisirs");
  const moisInput = document.getElementById("moisLoisirs");

  if (assistantInput) {
    assistantInput.value = assistantNom;
  }

  if (moisInput) {
    if (moisLoisirs) {
      moisInput.value = moisLoisirs;
    } else {
      const now = new Date();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      moisInput.value = `${year}-${month}`;
    }
  }
}

function saveAssistantNomLoisirs() {
  const input = document.getElementById("assistantNomLoisirs");
  if (!input) return;

  localStorage.setItem(getAssistantNomKey(), input.value.trim());
}

function saveMoisLoisirs() {
  const input = document.getElementById("moisLoisirs");
  if (!input) return;

  localStorage.setItem(getMoisKey(), input.value);
}

function updateNomJustificatifLoisirs() {
  const input = document.getElementById("justificatifLoisirs");
  const label = document.getElementById("nomJustificatifLoisirs");

  if (!input || !label) return;

  const file = input.files[0];
  label.textContent = file ? `Fichier sélectionné : ${file.name}` : "";
}

function filesToBase64(fileList) {
  return Promise.all(
    Array.from(fileList).map((file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
          resolve({
            name: file.name,
            type: file.type,
            data: reader.result
          });
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    })
  );
}

async function ajouterFraisLoisirs() {
  const date = document.getElementById("dateLoisirs")?.value || "";
  const enfant = document.getElementById("enfantLoisirs")?.value.trim() || "";
  const type = document.getElementById("typeLoisirs")?.value || "";
  const lieu = document.getElementById("lieuLoisirs")?.value.trim() || "";
  const objet = document.getElementById("objetLoisirs")?.value.trim() || "";
  const montant = parseFloat(document.getElementById("montantLoisirs")?.value || "");
  const justificatifFiles = document.getElementById("justificatifLoisirs")?.files || [];

  if (!date || !enfant || !type || !lieu || !objet || Number.isNaN(montant) || montant <= 0) {
    alert("Merci de remplir tous les champs correctement.");
    return;
  }

  let justificatifs = [];

  try {
    if (justificatifFiles.length > 0) {
      justificatifs = await filesToBase64(justificatifFiles);
    }
  } catch (error) {
    console.error("Erreur lecture justificatif loisirs :", error);
    alert("Impossible de lire le justificatif.");
    return;
  }

  fraisLoisirs.push({
    id: Date.now(),
    date,
    enfant,
    type,
    lieu,
    objet,
    montant: Number(montant.toFixed(2)),
    justificatifs
  });

  saveFraisLoisirs();
  renderLoisirs();
  updateTotalsLoisirs();
  resetFormLoisirs();
  showToastLoisirs("Dépense ajoutée");
}

function renderLoisirs() {
  const body = document.getElementById("loisirsBody");
  if (!body) return;

  body.innerHTML = "";

  if (fraisLoisirs.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    return;
  }

  fraisLoisirs.forEach((item) => {
    const tr = document.createElement("tr");

    const justificatifsHtml =
      item.justificatifs && item.justificatifs.length
        ? `
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${item.justificatifs
              .map(
                (file, index) => `
                  <a href="${file.data}" download="${escapeHtmlAttr(file.name)}" style="color:#2563eb; text-decoration:underline;">
                    📎 ${escapeHtml(file.name || `Justificatif ${index + 1}`)}
                  </a>
                `
              )
              .join("")}
          </div>
        `
        : `<span style="color:#6b7280;">Aucun</span>`;

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${justificatifsHtml}</td>
      <td>
        <button type="button" class="table-action-btn btn-delete-loisirs" data-id="${item.id}">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  body.querySelectorAll(".btn-delete-loisirs").forEach((btn) => {
    btn.addEventListener("click", () => {
      supprimerFraisLoisirs(Number(btn.dataset.id));
    });
  });
}

function supprimerFraisLoisirs(id) {
  fraisLoisirs = fraisLoisirs.filter((item) => item.id !== id);
  saveFraisLoisirs();
  renderLoisirs();
  updateTotalsLoisirs();
  showToastLoisirs("Dépense supprimée");
}

function viderListeLoisirs() {
  if (fraisLoisirs.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisLoisirs = [];
  saveFraisLoisirs();
  renderLoisirs();
  updateTotalsLoisirs();
  showToastLoisirs("Liste vidée");
}

function saveFraisLoisirs() {
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisLoisirs));
}

function updateTotalsLoisirs() {
  const totalLignes = document.getElementById("totalLignesLoisirs");
  const totalMontant = document.getElementById("totalMontantLoisirs");

  const total = fraisLoisirs.reduce((sum, item) => sum + item.montant, 0);

  if (totalLignes) {
    totalLignes.textContent = String(fraisLoisirs.length);
  }

  if (totalMontant) {
    totalMontant.textContent = total.toFixed(2).replace(".", ",") + " €";
  }
}

function resetFormLoisirs() {
  document.getElementById("dateLoisirs").value = "";
  document.getElementById("enfantLoisirs").value = "";
  document.getElementById("typeLoisirs").value = "";
  document.getElementById("lieuLoisirs").value = "";
  document.getElementById("objetLoisirs").value = "";
  document.getElementById("montantLoisirs").value = "";
  document.getElementById("justificatifLoisirs").value = "";
  document.getElementById("nomJustificatifLoisirs").textContent = "";
}

async function genererPDFLoisirs() {
  const allowed = await requirePdfAccess();
  if (!allowed) return;

  if (fraisLoisirs.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie PDF n'est pas chargée.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("landscape", "mm", "a4");

  const mois = document.getElementById("moisLoisirs").value;
  const assistantNom = document.getElementById("assistantNomLoisirs").value.trim() || "-";
  const totalMontant = fraisLoisirs.reduce((sum, item) => sum + item.montant, 0);

  const margin = 10;
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`ETAT DE FRAIS SPORTS ET LOISIRS DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { title: "Date", width: 20, align: "center" },
    { title: "Enfant", width: 28, align: "left" },
    { title: "Type", width: 26, align: "left" },
    { title: "Magasin / lieu", width: 42, align: "left" },
    { title: "Objet", width: 82, align: "left" },
    { title: "Montant", width: 22, align: "right" },
    { title: "Justificatif", width: 45, align: "left" }
  ];

  const headerHeight = 9;
  const lineHeight = 4.5;

  function drawHeader() {
    let x = margin;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);

    cols.forEach((col) => {
      doc.rect(x, y, col.width, headerHeight);
      drawCellText(doc, col.title, x, y, col.width, headerHeight, "center");
      x += col.width;
    });

    y += headerHeight;
  }

  drawHeader();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  fraisLoisirs.forEach((item) => {
    const rowValues = [
      formatDateFr(item.date),
      safeText(item.enfant),
      safeText(item.type),
      safeText(item.lieu),
      safeText(item.objet),
      item.montant.toFixed(2).replace(".", ",") + " €",
      item.justificatifs?.length ? safeText(item.justificatifs[0].name) : "Aucun"
    ];

    const rowLines = rowValues.map((value, i) => {
      if (i === 0 || i === 5) return [String(value)];
      return doc.splitTextToSize(String(value), cols[i].width - 3);
    });

    const maxLines = Math.max(...rowLines.map((lines) => lines.length));
    const rowHeight = Math.max(8, maxLines * lineHeight + 2);

    if (y + rowHeight > 175) {
      doc.addPage("landscape", "a4");
      y = 14;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`ETAT DE FRAIS SPORTS ET LOISIRS DU MOIS DE : ${formatMonthFr(mois)}`, margin, y);

      y += 8;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

      y += 8;
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }

    let x = margin;

    rowValues.forEach((value, i) => {
      doc.rect(x, y, cols[i].width, rowHeight);
      drawCellText(doc, rowLines[i], x, y, cols[i].width, rowHeight, cols[i].align);
      x += cols[i].width;
    });

    y += rowHeight;
  });

  y += 10;

  if (y > 178) {
    doc.addPage("landscape", "a4");
    y = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(`Total du mois : ${totalMontant.toFixed(2).replace(".", ",")} €`, margin, y);

  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Certifié exact le : ____________________", margin, y);

  y += 10;
  doc.text("Signature assistant familial : ____________________", margin, y);

  const fileName = `etat-frais-loisirs-${mois || "sans-mois"}.pdf`;
  doc.save(fileName);

  const pdfBlob = doc.output("blob");
  const reader = new FileReader();

  reader.onloadend = function () {
    const historiqueKey = `historiquePDF_${getUid()}`;
    let historique = JSON.parse(localStorage.getItem(historiqueKey) || "[]");

    historique.push({
      id: Date.now(),
      type: "Sports et loisirs",
      mois: formatMonthFr(mois),
      nom: fileName,
      data: reader.result,
      dateGeneration: new Date().toLocaleString("fr-FR")
    });

    localStorage.setItem(historiqueKey, JSON.stringify(historique));
    showToastLoisirs("PDF mensuel généré et enregistré");
  };

  reader.readAsDataURL(pdfBlob);
}

function drawCellText(doc, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  const fontSize = doc.getFontSize();
  const lineGap = fontSize * 0.35;
  const totalTextHeight = lines.length * lineGap;
  let currentY = y + (height - totalTextHeight) / 2 + 2.2;

  lines.forEach((line) => {
    let textX = x + 1.5;

    if (align === "center") {
      textX = x + width / 2;
      doc.text(line, textX, currentY, { align: "center" });
    } else if (align === "right") {
      textX = x + width - 1.5;
      doc.text(line, textX, currentY, { align: "right" });
    } else {
      doc.text(line, textX, currentY);
    }

    currentY += lineGap;
  });
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatMonthFr(monthStr) {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  return `${months[Number(month) - 1]} ${year}`;
}

function safeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function showToastLoisirs(message) {
  const toast = document.getElementById("toastLoisirs");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
