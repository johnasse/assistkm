import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { requirePdfAccess } from "./premium.js";

const DEFAULT_RATES = {
  "0-11": 47.33,
  "12-21": 56.83
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
  return `habillement_rates_${getUID()}`;
}

function getSettingsKey() {
  return `habillement_settings_${getUID()}`;
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
  return `habillement_${getUID()}_${child}_${year}`;
}
function getProfileLogoData() {
  return localStorage.getItem(`profileLogoData_${getUID()}`) || "";
}

function getProfileSignatureData() {
  return localStorage.getItem(`profileSignatureData_${getUID()}`) || "";
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}
function getSavedRates() {
  const savedRates = localStorage.getItem(getRatesKey());
  if (!savedRates) return { ...DEFAULT_RATES };

  try {
    const parsed = JSON.parse(savedRates);
    return {
      "0-11": safeParseNumber(parsed["0-11"], DEFAULT_RATES["0-11"]),
      "12-21": safeParseNumber(parsed["12-21"], DEFAULT_RATES["12-21"])
    };
  } catch (error) {
    console.error("Erreur chargement barèmes habillement :", error);
    return { ...DEFAULT_RATES };
  }
}

function getCurrentRatesFromInputs() {
  return {
    "0-11": safeParseNumber($("rate0_11")?.value, DEFAULT_RATES["0-11"]),
    "12-21": safeParseNumber($("rate12_21")?.value, DEFAULT_RATES["12-21"])
  };
}

function loadRatesIntoInputs() {
  const rates = getSavedRates();
  $("rate0_11").value = rates["0-11"].toFixed(2);
  $("rate12_21").value = rates["12-21"].toFixed(2);
}

function saveRates() {
  const rate0_11 = parseFloat($("rate0_11")?.value);
  const rate12_21 = parseFloat($("rate12_21")?.value);

  if (Number.isNaN(rate0_11) || rate0_11 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 0 à 11 ans.");
    return;
  }

  if (Number.isNaN(rate12_21) || rate12_21 < 0) {
    alert("Merci de renseigner un montant valide pour la tranche 12 à 21 ans.");
    return;
  }

  const rates = {
    "0-11": Number(rate0_11.toFixed(2)),
    "12-21": Number(rate12_21.toFixed(2))
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
    console.error("Erreur chargement paramètres habillement :", error);
  }
}

function getExpenses() {
  const raw = localStorage.getItem(getStorageKey());
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Erreur chargement dépenses habillement :", error);
    return [];
  }
}

function saveExpenses(expenses) {
  localStorage.setItem(getStorageKey(), JSON.stringify(expenses));
}

function updateSummary() {
  const monthly = getCurrentMonthlyRate();
  const annual = getAnnualBudget();
  const expenses = getExpenses();

  const totalSpent = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const remaining = Number((annual - totalSpent).toFixed(2));

  $("monthlyBudget").textContent = formatEuro(monthly);
  $("annualBudget").textContent = formatEuro(annual);
  $("totalSpent").textContent = formatEuro(totalSpent);
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
  $("nomJustificatifHabillement").textContent = file ? `Fichier sélectionné : ${file.name}` : "";
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
  $("expenseLabel").value = "";
  $("expenseAmount").value = "";
  $("expenseNotes").value = "";
  $("expenseFiles").value = "";
  $("nomJustificatifHabillement").textContent = "";
}

async function addExpense(event) {
  if (event) event.preventDefault();

  const childName = $("childName")?.value.trim() || "";
  const year = $("yearSelect")?.value.trim() || "";
  const date = $("expenseDate")?.value || "";
  const month = $("expenseMonth")?.value || "";
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
      console.error("Erreur lecture justificatif habillement :", error);
      alert("Impossible de lire le justificatif image.");
      return;
    }
  }

  const expenses = getExpenses();

  expenses.push({
    id: Date.now().toString(),
    date,
    month,
    label,
    amount: Number(amount.toFixed(2)),
    notes,
    justificatif
  });

  saveExpenses(expenses);
  saveSettings();
  clearExpenseForm();

  $("expenseDate").value = new Date().toISOString().split("T")[0];

  updateSummary();
  renderHistory();
}

function viewJustificatif(id) {
  const expense = getExpenses().find((item) => item.id === id);

  if (!expense?.justificatif?.data) {
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
      <head><title>${escapeHtml(expense.justificatif.name || "Justificatif")}</title></head>
      <body style="margin:0;display:flex;justify-content:center;align-items:center;background:#111;">
        <img src="${expense.justificatif.data}" style="max-width:100%;max-height:100vh;" />
      </body>
    </html>
  `);
  win.document.close();
}

function deleteExpense(id) {
  const confirmation = confirm("Voulez-vous vraiment supprimer cette dépense ?");
  if (!confirmation) return;

  const updatedExpenses = getExpenses().filter((item) => item.id !== id);
  saveExpenses(updatedExpenses);
  updateSummary();
  renderHistory();
}

function renderHistory() {
  const historyContainer = $("historyContainer");
  const expenses = getExpenses().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!expenses.length) {
    historyContainer.innerHTML = `<div class="empty-state">Aucune dépense enregistrée pour le moment.</div>`;
    return;
  }

  let html = `
    <table class="history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Mois</th>
          <th>Libellé</th>
          <th>Montant</th>
          <th>Commentaire</th>
          <th>Justificatif</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  expenses.forEach((expense) => {
    html += `
      <tr>
        <td>${escapeHtml(formatDateFr(expense.date))}</td>
        <td>${escapeHtml(expense.month)}</td>
        <td>${escapeHtml(expense.label)}</td>
        <td>${formatEuro(expense.amount)}</td>
        <td>${escapeHtml(expense.notes)}</td>
        <td>
          ${
            expense.justificatif?.data
              ? `<button type="button" class="btn btn-secondary btn-view-justif" data-id="${escapeHtml(expense.id)}">Voir</button>`
              : "Aucun"
          }
        </td>
        <td>
          <button type="button" class="btn btn-danger btn-delete-expense" data-id="${escapeHtml(expense.id)}">
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
    btn.addEventListener("click", () => deleteExpense(btn.dataset.id));
  });

  historyContainer.querySelectorAll(".btn-view-justif").forEach((btn) => {
    btn.addEventListener("click", () => viewJustificatif(btn.dataset.id));
  });
}

async function convertImageDataUrlToJpeg(dataUrl, quality = 0.88) {
  const img = new Image();
  img.crossOrigin = "anonymous";
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

async function ajouterImagesAuPdf(pdf, expenses) {
  for (const expense of expenses) {
    if (!expense.justificatif?.data) continue;

    try {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 10;

      pdf.addPage();
      pdf.setFontSize(13);
      pdf.text("Justificatif", margin, 12);

      pdf.setFontSize(10);
      const meta = `${formatDateFr(expense.date)} - ${expense.month} - ${expense.label} - ${expense.amount.toFixed(2).replace(".", ",")} €`;
      const lines = pdf.splitTextToSize(meta, pageWidth - margin * 2);
      pdf.text(lines, margin, 22);

      const startY = 22 + lines.length * 5 + 6;
      const converted = await convertImageDataUrlToJpeg(expense.justificatif.data);

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
      console.error("Erreur ajout image PDF habillement :", error);
    }
  }
}
async function drawLogo(pdf) {
  const logoData = getProfileLogoData();

  if (
    !logoData ||
    (
      !isImageDataUrl(logoData) &&
      !logoData.startsWith("http")
    )
  ) return;

  try {
    const converted = await convertImageDataUrlToJpeg(logoData, 0.9);

    let w = converted.width;
    let h = converted.height;

    const ratio = Math.min(30 / w, 20 / h, 1);
    w *= ratio;
    h *= ratio;

    pdf.addImage(converted.dataUrl, "JPEG", 10, 8, w, h);
  } catch (error) {
    console.error("Erreur logo PDF habillement :", error);
  }
}

  async function genererPDFHabillement() {

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const expenses = getExpenses();

  if (!expenses.length) {
    alert("Aucune dépense à exporter.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  await drawLogo(pdf);

const signature = getProfileSignatureData();

  let y = 10;

  pdf.setFontSize(14);
  pdf.text("Frais d'habillement", 10, y);
  y += 10;

  const child = $("childName").value || "-";
  const year = $("yearSelect").value || "-";
  const total = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  pdf.setFontSize(10);
  pdf.text(`Enfant : ${child}`, 10, y);
  y += 6;
  pdf.text(`Année : ${year}`, 10, y);
  y += 6;
  pdf.text(`Budget annuel : ${formatEuro(getAnnualBudget())}`, 10, y);
  y += 6;
  pdf.text(`Total dépensé : ${formatEuro(total)}`, 10, y);
  y += 6;
  pdf.text(`Reste disponible : ${formatEuro(getAnnualBudget() - total)}`, 10, y);
  y += 10;

  expenses.forEach((item) => {
    const line = `${formatDateFr(item.date)} - ${item.month} - ${item.label} - ${item.amount.toFixed(2).replace(".", ",")} €`;
    const lines = pdf.splitTextToSize(line, 180);
    pdf.text(lines, 10, y);
    y += lines.length * 6 + 2;

    if (y > 280) {
      pdf.addPage();
      y = 10;
    }
  });
  if (
  signature &&
  (
    isImageDataUrl(signature) ||
    signature.startsWith("http")
  )
) {
  try {
    const img = await convertImageDataUrlToJpeg(signature);
    pdf.text("Signature :", 10, 260);
    pdf.addImage(img.dataUrl, "JPEG", 10, 263, 50, 15);
  } catch (error) {
    console.error("Erreur signature PDF habillement :", error);
  }
}

  await ajouterImagesAuPdf(pdf, expenses);

  const filename = `habillement_${new Date().toISOString().slice(0, 10)}.pdf`;

  savePdfToHistory(pdf, {
    mois: year,
    nom: filename,
    type: "Habillement"
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
  $("rate12_21").addEventListener("input", updateSummary);

  $("saveRatesBtn").addEventListener("click", (e) => {
    e.preventDefault();
    saveRates();
  });

  $("addExpenseBtn").addEventListener("click", addExpense);
  $("resetExpenseBtn").addEventListener("click", clearExpenseForm);
  $("btnPdfHabillement").addEventListener("click", genererPDFHabillement);
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