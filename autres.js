import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisAutres = [];
let autresDb = null;
let currentUid = null;
let eventsBound = false;

function getUid() {
  return currentUid || auth.currentUser?.uid || "guest";
}

function getAutresKey() {
  return `fraisAutres_${getUid()}`;
}

function getHistoriquePdfKey() {
  return `historiquePDF_${getUid()}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initDB();
    bindEvents();
  } catch (error) {
    console.error("Erreur initialisation autres.js :", error);
    alert("Erreur lors du chargement du module.");
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUid = user.uid;
  fraisAutres = JSON.parse(localStorage.getItem(getAutresKey()) || "[]");
  renderAutres();
  updateTotals();
});

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("btnAjouterAutres")?.addEventListener("click", ajouterDepense);
  document.getElementById("btnResetAutres")?.addEventListener("click", resetForm);
  document.getElementById("btnPdfAutres")?.addEventListener("click", genererPdfMensuel);
  document.getElementById("btnViderAutres")?.addEventListener("click", viderListe);

  document.getElementById("btnPhotoAutres")?.addEventListener("click", () => {
    document.getElementById("justificatifAutres")?.click();
  });

  document.getElementById("justificatifAutres")?.addEventListener("change", updateNomJustificatif);
}

function updateNomJustificatif() {
  const file = document.getElementById("justificatifAutres")?.files?.[0];
  document.getElementById("nomJustificatifAutres").textContent = file ? file.name : "";
}

async function ajouterDepense() {
  try {
    const date = document.getElementById("dateAutres").value;
    const enfant = document.getElementById("enfantAutres").value.trim();
    const type = document.getElementById("typeAutres").value.trim();
    const lieu = document.getElementById("lieuAutres").value.trim();
    const objet = document.getElementById("objetAutres").value.trim();
    const montant = parseFloat(document.getElementById("montantAutres").value);
    const file = document.getElementById("justificatifAutres").files[0] || null;

    if (!date || !objet || Number.isNaN(montant) || montant <= 0) {
      alert("Merci de renseigner la date, l'objet et un montant valide.");
      return;
    }

    let justificatifId = null;
    let justificatifNom = "";

    if (file) {
      justificatifId = `justif-autres-${Date.now()}`;
      justificatifNom = file.name;

      await saveFile({
        id: justificatifId,
        name: file.name,
        file,
        createdAt: Date.now()
      });
    }

    fraisAutres.push({
      id: Date.now(),
      date,
      enfant,
      type,
      lieu,
      objet,
      montant: Number(montant.toFixed(2)),
      justificatifId,
      justificatifNom
    });

    saveAutres();
    renderAutres();
    updateTotals();
    resetForm();
    showToast("Dépense ajoutée");
  } catch (error) {
    console.error("Erreur ajout dépense :", error);
    alert("Impossible d'ajouter la dépense.");
  }
}

function renderAutres() {
  const body = document.getElementById("autresBody");
  if (!body) return;

  body.innerHTML = "";

  if (fraisAutres.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    return;
  }

  fraisAutres.forEach((item) => {
    const tr = document.createElement("tr");

    const justifHtml = item.justificatifId
      ? `
          <button type="button" class="table-action-btn btnView" data-id="${item.justificatifId}">Voir</button>
          <button type="button" class="table-action-btn btnDown" data-id="${item.justificatifId}">Télécharger</button>
        `
      : "Aucun";

    tr.innerHTML = `
      <td>${formatDateFr(item.date)}</td>
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.lieu)}</td>
      <td>${escapeHtml(item.objet)}</td>
      <td>${item.montant.toFixed(2).replace(".", ",")} €</td>
      <td>${justifHtml}</td>
      <td><button type="button" class="table-action-btn btnDel" data-id="${item.id}">Supprimer</button></td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btnDel").forEach((btn) => {
    btn.addEventListener("click", () => supprimerDepense(Number(btn.dataset.id)));
  });

  document.querySelectorAll(".btnView").forEach((btn) => {
    btn.addEventListener("click", () => voirJustificatif(btn.dataset.id));
  });

  document.querySelectorAll(".btnDown").forEach((btn) => {
    btn.addEventListener("click", () => telechargerJustificatif(btn.dataset.id));
  });
}

function supprimerDepense(id) {
  fraisAutres = fraisAutres.filter((item) => item.id !== id);
  saveAutres();
  renderAutres();
  updateTotals();
  showToast("Dépense supprimée");
}

function viderListe() {
  if (fraisAutres.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  fraisAutres = [];
  saveAutres();
  renderAutres();
  updateTotals();
  showToast("Liste vidée");
}

function saveAutres() {
  localStorage.setItem(getAutresKey(), JSON.stringify(fraisAutres));
}

function updateTotals() {
  const total = fraisAutres.reduce((sum, item) => sum + (Number(item.montant) || 0), 0);

  document.getElementById("totalLignesAutres").textContent = fraisAutres.length;
  document.getElementById("totalMontantAutres").textContent = `${total.toFixed(2).replace(".", ",")} €`;
}

function resetForm() {
  document.getElementById("dateAutres").value = "";
  document.getElementById("enfantAutres").value = "";
  document.getElementById("typeAutres").value = "";
  document.getElementById("lieuAutres").value = "";
  document.getElementById("objetAutres").value = "";
  document.getElementById("montantAutres").value = "";
  document.getElementById("justificatifAutres").value = "";
  document.getElementById("nomJustificatifAutres").textContent = "";
}

async function genererPdfMensuel() {
  if (fraisAutres.length === 0) {
    alert("Aucune dépense à exporter.");
    return;
  }

  try {
    if (window.EasyFraisPremium?.canGeneratePdf) {
      const access = await window.EasyFraisPremium.canGeneratePdf();
      if (!access.allowed) {
        alert(access.message || "Quota PDF atteint.");
        window.location.href = "premium.html";
        return;
      }
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("La librairie PDF n'est pas chargée.");
      return;
    }

    const moisAutres = document.getElementById("moisAutres").value;
    const assistantNom = document.getElementById("assistantNomAutres").value.trim() || "-";

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("landscape", "mm", "a4");

    const margin = 10;
    let y = 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`ETAT DES AUTRES FRAIS DU MOIS DE : ${formatMonthFr(moisAutres)}`, margin, y);

    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

    y += 8;

    const cols = [
      { key: "date", title: "Date", width: 22, align: "center" },
      { key: "enfant", title: "Enfant", width: 35, align: "left" },
      { key: "type", title: "Type", width: 40, align: "left" },
      { key: "lieu", title: "Magasin / lieu", width: 55, align: "left" },
      { key: "objet", title: "Objet / description", width: 90, align: "left" },
      { key: "montant", title: "Montant", width: 22, align: "right" }
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

    fraisAutres.forEach((item) => {
      const rowValues = [
        formatDateFr(item.date),
        safeText(item.enfant),
        safeText(item.type),
        safeText(item.lieu),
        safeText(item.objet),
        `${Number(item.montant).toFixed(2).replace(".", ",")} €`
      ];

      const rowLines = rowValues.map((value, i) => {
        const col = cols[i];

        if (col.key === "date" || col.key === "montant") {
          return [String(value)];
        }

        return doc.splitTextToSize(String(value), col.width - 3);
      });

      const maxLines = Math.max(...rowLines.map((lines) => lines.length));
      const rowHeight = Math.max(8, maxLines * lineHeight + 2);

      if (y + rowHeight > 175) {
        doc.addPage("landscape", "a4");
        y = 14;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.text(`ETAT DES AUTRES FRAIS DU MOIS DE : ${formatMonthFr(moisAutres)}`, margin, y);

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
        const col = cols[i];
        doc.rect(x, y, col.width, rowHeight);
        drawCellText(doc, rowLines[i], x, y, col.width, rowHeight, col.align);
        x += col.width;
      });

      y += rowHeight;
    });

    y += 10;

    if (y > 178) {
      doc.addPage("landscape", "a4");
      y = 20;
    }

    const totalMontant = fraisAutres.reduce((sum, item) => sum + (Number(item.montant) || 0), 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text(`Nombre de dépenses : ${fraisAutres.length}`, margin, y);

    y += 7;
    doc.text(`Total du mois : ${totalMontant.toFixed(2).replace(".", ",")} €`, margin, y);

    y += 12;
    doc.setFont("helvetica", "normal");
    doc.text("Certifié exact le : ____________________", margin, y);

    y += 10;
    doc.text("Signature assistant familial : ____________________", margin, y);

    const fileName = `autres-frais-${moisAutres || "sans-mois"}.pdf`;
    const pdfBlob = doc.output("blob");

    doc.save(fileName);

    await enregistrerPdfHistorique(pdfBlob, fileName, moisAutres);

    if (window.EasyFraisPremium?.registerPdfGeneration) {
      await window.EasyFraisPremium.registerPdfGeneration({ module: "autres" });
    }

    showToast("PDF mensuel généré et enregistré");
  } catch (error) {
    console.error("Erreur génération PDF autres :", error);
    alert("Impossible de générer le PDF.");
  }
}

function enregistrerPdfHistorique(pdfBlob, fileName, moisAutres) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = function () {
      try {
        let historique = JSON.parse(localStorage.getItem(getHistoriquePdfKey()) || "[]");

        historique.push({
          id: Date.now(),
          type: "Autres frais",
          mois: formatMonthFr(moisAutres),
          nom: fileName,
          data: reader.result,
          dateGeneration: new Date().toLocaleString("fr-FR")
        });

        localStorage.setItem(getHistoriquePdfKey(), JSON.stringify(historique));
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsDataURL(pdfBlob);
  });
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("gestionFraisDB", 1);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains("justificatifs")) {
        db.createObjectStore("justificatifs", { keyPath: "id" });
      }
    };

    request.onsuccess = () => {
      autresDb = request.result;
      resolve();
    };

    request.onerror = () => reject(request.error);
  });
}

function saveFile(fileRecord) {
  return new Promise((resolve, reject) => {
    if (!autresDb) {
      reject(new Error("Base IndexedDB indisponible"));
      return;
    }

    const tx = autresDb.transaction(["justificatifs"], "readwrite");
    const store = tx.objectStore("justificatifs");
    const req = store.put(fileRecord);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function getFile(id) {
  return new Promise((resolve, reject) => {
    if (!autresDb) {
      reject(new Error("Base IndexedDB indisponible"));
      return;
    }

    const tx = autresDb.transaction(["justificatifs"], "readonly");
    const store = tx.objectStore("justificatifs");
    const req = store.get(id);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function voirJustificatif(id) {
  try {
    const record = await getFile(id);

    if (!record?.file) {
      alert("Justificatif introuvable.");
      return;
    }

    const url = URL.createObjectURL(record.file);
    window.open(url, "_blank");
  } catch (error) {
    console.error("Erreur ouverture justificatif :", error);
    alert("Impossible d'ouvrir le justificatif.");
  }
}

async function telechargerJustificatif(id) {
  try {
    const record = await getFile(id);

    if (!record?.file) {
      alert("Justificatif introuvable.");
      return;
    }

    const url = URL.createObjectURL(record.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = record.name || "justificatif";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Erreur téléchargement justificatif :", error);
    alert("Impossible de télécharger le justificatif.");
  }
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

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toastAutres");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}
