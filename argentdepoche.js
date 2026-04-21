import { savePdfToHistory } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
const DEFAULT_RATES = {
  "0-11": 10.00,
  "12-15": 20.00,
  "16-21": 30.00
};

let currentUid = null;
let eventsBound = false;

const $ = (id) => document.getElementById(id);

function formatEuro(value) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR"
  }).format(Number(value || 0));
}

function safeParseNumber(value, fallback = 0) {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function getUID() {
  return currentUid || auth.currentUser?.uid || "guest";
}

function getRatesKey() {
  return `argentdepoche_rates_${getUID()}`;
}

function getSettingsKey() {
  return `argentdepoche_settings_${getUID()}`;
}

function normalizeChildName(name) {
  return (name || "enfant")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function getStorageKey() {
  const child = normalizeChildName($("childName")?.value || "");
  const year = ($("yearSelect")?.value || new Date().getFullYear()).toString().trim();
  return `argentdepoche_${getUID()}_${child}_${year}`;
}

function getSavedRates() {
  const savedRates = localStorage.getItem(getRatesKey());
  if (!savedRates) return { ...DEFAULT_RATES };

  try {
    const parsed = JSON.parse(savedRates);
    return {
      "0-11": safeParseNumber(parsed["0-11"], DEFAULT_RATES["0-11"]),
      "12-15": safeParseNumber(parsed["12-15"], DEFAULT_RATES["12-15"]),
      "16-21": safeParseNumber(parsed["16-21"], DEFAULT_RATES["16-21"])
    };
  } catch (error) {
    console.error("Erreur chargement barèmes argent de poche :", error);
    return { ...DEFAULT_RATES };
  }
}

function getCurrentRatesFromInputs() {
  return {
    "0-11": safeParseNumber($("rate0_11")?.value, DEFAULT_RATES["0-11"]),
    "12-15": safeParseNumber($("rate12_15")?.value, DEFAULT_RATES["12-15"]),
    "16-21": safeParseNumber($("rate16_21")?.value, DEFAULT_RATES["16-21"])
  };
}

function loadRatesIntoInputs() {
  const rates = getSavedRates();
  $("rate0_11").value = rates["0-11"].toFixed(2);
  $("rate12_15").value = rates["12-15"].toFixed(2);
  $("rate16_21").value = rates["16-21"].toFixed(2);
}

function saveRates() {
  const rate0_11 = parseFloat($("rate0_11")?.value);
  const rate12_15 = parseFloat($("rate12_15")?.value);
  const rate16_21 = parseFloat($("rate16_21")?.value);

  if (Number.isNaN(rate0_11) || rate0_11 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 0 à 11 ans.");
    return;
  }

  if (Number.isNaN(rate12_15) || rate12_15 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 12 à 15 ans.");
    return;
  }

  if (Number.isNaN(rate16_21) || rate16_21 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 16 à 21 ans.");
    return;
  }

  const rates = {
    "0-11": Number(rate0_11.toFixed(2)),
    "12-15": Number(rate12_15.toFixed(2)),
    "16-21": Number(rate16_21.toFixed(2))
  };

  localStorage.setItem(getRatesKey(), JSON.stringify(rates));
  updateSummary();
  alert("Barèmes enregistrés avec succès.");
}

function getCurrentMonthlyRate() {
  const rates = getCurrentRatesFromInputs();
  return Number(rates[$("ageBracket")?.value] || 0);
}

function getAnnualBudget() {
  return Number((getCurrentMonthlyRate() * 12).toFixed(2));
}

function saveSettings() {
  const settings = {
    childName: $("childName")?.value.trim() || "",
    year: $("yearSelect")?.value || "",
    ageBracket: $("ageBracket")?.value || ""
  };

  localStorage.setItem(getSettingsKey(), JSON.stringify(settings));
}

function loadSettings() {
  const raw = localStorage.getItem(getSettingsKey());
  if (!raw) return;

  try {
    const settings = JSON.parse(raw);

    if (settings.childName) $("childName").value = settings.childName;
    if (settings.year) $("yearSelect").value = settings.year;
    if (settings.ageBracket) $("ageBracket").value = settings.ageBracket;
  } catch (error) {
    console.error("Erreur chargement paramètres argent de poche :", error);
  }
}

function getMovements() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Erreur chargement mouvements argent de poche :", error);
    return [];
  }
}

function saveMovements(movements) {
  localStorage.setItem(getStorageKey(), JSON.stringify(movements));
}

function getUsedAmount(movements) {
  return movements.reduce((sum, item) => {
    const amount = Number(item.amount || 0);
    return item.type === "versement" ? sum - amount : sum + amount;
  }, 0);
}

function updateSummary() {
  const monthly = getCurrentMonthlyRate();
  const annual = getAnnualBudget();
  const movements = getMovements();

  const totalUsed = getUsedAmount(movements);
  const remaining = Number((annual - totalUsed).toFixed(2));

  $("monthlyBudget").textContent = formatEuro(monthly);
  $("annualBudget").textContent = formatEuro(annual);
  $("totalSpent").textContent = formatEuro(totalUsed);
  $("remainingBudget").textContent = formatEuro(remaining);

  $("remainingBudget").classList.remove("green", "red");
  $("remainingBudget").classList.add(remaining < 0 ? "red" : "green");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function updateNomJustificatif() {
  const file = $("expenseFiles").files[0];
  $("nomJustificatifArgentPoche").textContent = file ? `Fichier sélectionné : ${file.name}` : "";
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

function clearExpenseForm() {
  $("expenseDate").value = "";
  $("expenseMonth").value = "";
  $("movementType").value = "depense";
  $("expenseLabel").value = "";
  $("expenseAmount").value = "";
  $("expenseNotes").value = "";
  $("expenseFiles").value = "";
  $("nomJustificatifArgentPoche").textContent = "";
}

async function addMovement(event) {
  if (event) event.preventDefault();

  const childName = $("childName")?.value.trim() || "";
  const year = $("yearSelect")?.value.trim() || "";
  const date = $("expenseDate")?.value || "";
  const month = $("expenseMonth")?.value || "";
  const type = $("movementType")?.value || "depense";
  const label = $("expenseLabel")?.value.trim() || "";
  const amount = parseFloat($("expenseAmount")?.value);
  const notes = $("expenseNotes")?.value.trim() || "";
  const file = $("expenseFiles")?.files[0] || null;

  if (!auth.currentUser) {
    alert("Utilisateur non connecté.");
    window.location.href = "login.html";
    return;
  }

  if (!childName) {
    alert("Merci de renseigner le nom de l’enfant.");
    return;
  }

  if (!year) {
    alert("Merci de renseigner l’année.");
    return;
  }

  if (!date) {
    alert("Merci de renseigner la date.");
    return;
  }

  if (!month) {
    alert("Merci de sélectionner le mois concerné.");
    return;
  }

  if (!label) {
    alert("Merci de renseigner un libellé.");
    return;
  }

  if (Number.isNaN(amount) || amount <= 0) {
    alert("Merci de renseigner un montant valide.");
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
      console.error("Erreur lecture justificatif argent de poche :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  const movements = getMovements();

  movements.push({
    id: Date.now().toString(),
    date,
    month,
    type,
    label,
    amount: Number(amount.toFixed(2)),
    notes,
    justificatif
  });

  saveMovements(movements);
  saveSettings();
  clearExpenseForm();
  $("expenseDate").value = new Date().toISOString().split("T")[0];

  updateSummary();
  renderHistory();
}

function viewJustificatif(id) {
  const movement = getMovements().find((item) => item.id === id);

  if (!movement?.justificatif?.data) {
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
      <head><title>${escapeHtml(movement.justificatif.name || "Justificatif")}</title></head>
      <body style="margin:0;display:flex;justify-content:center;align-items:center;background:#111;">
        <img src="${movement.justificatif.data}" style="max-width:100%;max-height:100vh;" />
      </body>
    </html>
  `);
  win.document.close();
}

function deleteMovement(id) {
  const confirmation = confirm("Voulez-vous vraiment supprimer ce mouvement ?");
  if (!confirmation) return;

  const updatedMovements = getMovements().filter((item) => item.id !== id);
  saveMovements(updatedMovements);
  updateSummary();
  renderHistory();
}

function renderHistory() {
  const historyContainer = $("historyContainer");
  const movements = getMovements().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!movements.length) {
    historyContainer.innerHTML = `<div class="empty-state">Aucun mouvement enregistré pour le moment.</div>`;
    return;
  }

  let html = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Mois</th>
          <th>Type</th>
          <th>Libellé</th>
          <th>Montant</th>
          <th>Commentaire</th>
          <th>Justificatif</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  movements.forEach((item) => {
    html += `
      <tr>
        <td>${escapeHtml(formatDateFr(item.date))}</td>
        <td>${escapeHtml(item.month)}</td>
        <td>${item.type === "versement" ? "Versement" : "Dépense"}</td>
        <td>${escapeHtml(item.label)}</td>
        <td>${formatEuro(item.amount)}</td>
        <td>${escapeHtml(item.notes)}</td>
        <td>
          ${
            item.justificatif?.data
              ? `<button type="button" class="btn btn-secondary btn-view-justif" data-id="${escapeHtml(item.id)}">Voir</button>`
              : "Aucun"
          }
        </td>
        <td>
          <button type="button" class="btn btn-danger btn-delete-expense" data-id="${escapeHtml(item.id)}">
            Supprimer
          </button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  historyContainer.innerHTML = html;

  historyContainer.querySelectorAll(".btn-delete-expense").forEach((btn) => {
    btn.addEventListener("click", () => deleteMovement(btn.dataset.id));
  });

  historyContainer.querySelectorAll(".btn-view-justif").forEach((btn) => {
    btn.addEventListener("click", () => viewJustificatif(btn.dataset.id));
  });
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

async function ajouterImagesAuPdf(pdf, movements) {
  for (const item of movements) {
    if (!item.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

      pdf.setFontSize(10);
      const meta = `${formatDateFr(item.date)} - ${item.month} - ${item.type === "versement" ? "Versement" : "Dépense"} - ${item.label} - ${item.amount.toFixed(2).replace(".", ",")} €`;
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
      console.error("Erreur ajout image PDF argent de poche :", error);
    }
  }
}

async function genererPDFArgentPoche() {
  const movements = getMovements();

  if (!movements.length) {
    alert("Aucun mouvement à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();

  let y = 10;

  pdf.setFontSize(14);
  pdf.text("Argent de poche", 10, y);
  y += 10;

  const child = $("childName").value || "-";
  const year = $("yearSelect").value || "-";
  const annual = getAnnualBudget();
  const totalUsed = getUsedAmount(movements);
  const remaining = annual - totalUsed;

  pdf.setFontSize(10);
  pdf.text(`Enfant : ${child}`, 10, y);
  y += 6;
  pdf.text(`Année : ${year}`, 10, y);
  y += 6;
  pdf.text(`Budget annuel : ${formatEuro(annual)}`, 10, y);
  y += 6;
  pdf.text(`Total utilisé : ${formatEuro(totalUsed)}`, 10, y);
  y += 6;
  pdf.text(`Reste disponible : ${formatEuro(remaining)}`, 10, y);
  y += 10;

  movements.forEach((item) => {
    const line = `${formatDateFr(item.date)} - ${item.month} - ${item.type === "versement" ? "Versement" : "Dépense"} - ${item.label} - ${item.amount.toFixed(2).replace(".", ",")} €`;
    const lines = pdf.splitTextToSize(line, 180);
    pdf.text(lines, 10, y);
    y += lines.length * 6 + 2;

    if (y > 280) {
      pdf.addPage();
      y = 10;
    }
  });

  await ajouterImagesAuPdf(pdf, movements);

  const filename = `argentdepoche_${new Date().toISOString().slice(0, 10)}.pdf`;

  savePdfToHistory(pdf, {
    mois: year,
    nom: filename,
    type: "Argent de poche"
  });

  pdf.save(filename);
}

function initDefaultValues() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const todayIso = today.toISOString().split("T")[0];

  if (!$("yearSelect").value) $("yearSelect").value = String(currentYear);
  if (!$("expenseDate").value) $("expenseDate").value = todayIso;
}

function refreshAll() {
  loadSettings();
  initDefaultValues();
  loadRatesIntoInputs();
  updateSummary();
  renderHistory();
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  $("childName").addEventListener("input", () => {
    saveSettings();
    updateSummary();
    renderHistory();
  });

  $("yearSelect").addEventListener("input", () => {
    saveSettings();
    updateSummary();
    renderHistory();
  });

  $("ageBracket").addEventListener("change", () => {
    saveSettings();
    updateSummary();
    renderHistory();
  });

  $("rate0_11").addEventListener("input", updateSummary);
  $("rate12_15").addEventListener("input", updateSummary);
  $("rate16_21").addEventListener("input", updateSummary);

  $("saveRatesBtn").addEventListener("click", (e) => {
    e.preventDefault();
    saveRates();
  });

  $("addExpenseBtn").addEventListener("click", addMovement);
  $("resetExpenseBtn").addEventListener("click", clearExpenseForm);
  $("btnPdfArgentPoche").addEventListener("click", genererPDFArgentPoche);
  $("expenseFiles").addEventListener("change", updateNomJustificatif);
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  currentUid = user.uid;
  bindEvents();
  refreshAll();
});