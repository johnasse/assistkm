import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const STORAGE_KEY = "parkingModuleEasyFrais";

let currentUser = null;
let entries = [];
let justificatifDataUrl = "";

const moisInput = document.getElementById("moisParking");
const assistantInput = document.getElementById("assistantNomParking");
const dateInput = document.getElementById("dateParking");
const enfantInput = document.getElementById("enfantParking");
const typeInput = document.getElementById("typeParking");
const lieuInput = document.getElementById("lieuParking");
const objetInput = document.getElementById("objetParking");
const montantInput = document.getElementById("montantParking");
const justificatifInput = document.getElementById("justificatifParking");
const btnPhoto = document.getElementById("btnPhotoParking");
const nomJustificatif = document.getElementById("nomJustificatifParking");

const btnAjouter = document.getElementById("btnAjouterParking");
const btnReset = document.getElementById("btnResetParking");
const btnPdf = document.getElementById("btnPdfParking");
const btnVider = document.getElementById("btnViderParking");

const body = document.getElementById("parkingBody");
const totalLignes = document.getElementById("totalLignesParking");
const totalMontant = document.getElementById("totalMontantParking");
const toast = document.getElementById("toastParking");

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2).replace(".", ",")} €`;
}

function getCurrentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function getFileNameMonth(monthValue) {
  return monthValue || getCurrentMonthValue();
}

function saveModule() {
  const payload = {
    mois: moisInput?.value || "",
    assistantNom: assistantInput?.value || "",
    entries
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function loadModule() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

    if (moisInput && parsed?.mois) moisInput.value = parsed.mois;
    if (assistantInput && parsed?.assistantNom) assistantInput.value = parsed.assistantNom;
  } catch (error) {
    console.error("Erreur chargement parking :", error);
  }
}

function resetForm() {
  if (dateInput) dateInput.value = "";
  if (enfantInput) enfantInput.value = "";
  if (typeInput) typeInput.value = "";
  if (lieuInput) lieuInput.value = "";
  if (objetInput) objetInput.value = "";
  if (montantInput) montantInput.value = "";
  if (justificatifInput) justificatifInput.value = "";
  justificatifDataUrl = "";
  if (nomJustificatif) nomJustificatif.textContent = "";
}

function getTotal() {
  return entries.reduce((sum, item) => sum + Number(item.montant || 0), 0);
}

function renderTable() {
  if (!body) return;

  if (!entries.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
  } else {
    body.innerHTML = entries.map((item) => `
      <tr>
        <td>${escapeHtml(item.date || "-")}</td>
        <td>${escapeHtml(item.enfant || "-")}</td>
        <td>${escapeHtml(item.type || "-")}</td>
        <td>${escapeHtml(item.lieu || "-")}</td>
        <td>${escapeHtml(item.objet || "-")}</td>
        <td>${formatMoney(item.montant)}</td>
        <td>${item.justificatifName ? "Oui" : "-"}</td>
        <td>
          <button type="button" class="table-action-btn btn-delete-entry" data-id="${escapeHtml(String(item.id))}">
            Supprimer
          </button>
        </td>
      </tr>
    `).join("");
  }

  if (totalLignes) totalLignes.textContent = String(entries.length);
  if (totalMontant) totalMontant.textContent = formatMoney(getTotal());

  document.querySelectorAll(".btn-delete-entry").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      entries = entries.filter((item) => item.id !== id);
      saveModule();
      renderTable();
      showToast("Dépense supprimée");
    });
  });
}

function validateForm() {
  if (!dateInput?.value) {
    alert("Merci de renseigner la date.");
    return false;
  }

  if (!enfantInput?.value.trim()) {
    alert("Merci de renseigner le nom de l’enfant.");
    return false;
  }

  if (!typeInput?.value.trim()) {
    alert("Merci de choisir le type de frais.");
    return false;
  }

  if (!lieuInput?.value.trim()) {
    alert("Merci de renseigner le lieu.");
    return false;
  }

  if (!objetInput?.value.trim()) {
    alert("Merci de renseigner l’objet / description.");
    return false;
  }

  if (!montantInput?.value || Number(montantInput.value) <= 0) {
    alert("Merci de renseigner un montant valide.");
    return false;
  }

  return true;
}

function addEntry() {
  if (!validateForm()) return;

  const entry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    date: dateInput.value,
    enfant: enfantInput.value.trim(),
    type: typeInput.value.trim(),
    lieu: lieuInput.value.trim(),
    objet: objetInput.value.trim(),
    montant: Number(montantInput.value),
    justificatifDataUrl,
    justificatifName: justificatifInput?.files?.[0]?.name || ""
  };

  entries.push(entry);
  saveModule();
  renderTable();
  resetForm();
  showToast("Dépense ajoutée");
}

function clearAllEntries() {
  if (!entries.length) {
    showToast("Aucune dépense à supprimer");
    return;
  }

  const ok = confirm("Voulez-vous vraiment vider toute la liste des frais de parking ?");
  if (!ok) return;

  entries = [];
  saveModule();
  renderTable();
  showToast("Liste vidée");
}

function dataUriToUint8Array(dataUri) {
  const parts = String(dataUri || "").split(",");
  if (parts.length < 2) {
    throw new Error("Data URI invalide");
  }

  const base64 = parts[1];
  const raw = atob(base64);
  const uint8Array = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i += 1) {
    uint8Array[i] = raw.charCodeAt(i);
  }

  return uint8Array;
}

function addPdfToGlobalHistory(blob, fileName, monthLabel) {
  if (!currentUser) return;

  const historyKey = `historiquePDF_${currentUser.uid}`;
  const historique = JSON.parse(localStorage.getItem(historyKey) || "[]");

  const reader = new FileReader();
  reader.onloadend = function () {
    historique.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      mois: monthLabel,
      nom: fileName,
      data: reader.result,
      dateGeneration: new Date().toLocaleString("fr-FR"),
      type: "Frais de parking"
    });

    localStorage.setItem(historyKey, JSON.stringify(historique));
  };
  reader.readAsDataURL(blob);
}

async function generatePdf() {
  if (!entries.length) {
    alert("Ajoute au moins une dépense avant de générer le PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const moisValue = moisInput?.value || getCurrentMonthValue();
  const moisLabel = getMonthLabel(moisValue);
  const assistantNom = assistantInput?.value?.trim() || "";
  const total = getTotal();

  let y = 15;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("ETAT DE FRAIS - PARKING", 105, y, { align: "center" });

  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text(`Mois : ${moisLabel}`, 14, y);
  pdf.text(`Assistant familial : ${assistantNom || "-"}`, 14, y + 7);

  y += 18;

  const colX = {
    date: 10,
    enfant: 32,
    type: 64,
    lieu: 95,
    objet: 126,
    montant: 170
  };

  pdf.setFont("helvetica", "bold");
  pdf.setFillColor(230, 235, 245);
  pdf.rect(10, y, 190, 8, "F");
  pdf.text("Date", colX.date + 2, y + 5.5);
  pdf.text("Enfant", colX.enfant + 2, y + 5.5);
  pdf.text("Type", colX.type + 2, y + 5.5);
  pdf.text("Lieu", colX.lieu + 2, y + 5.5);
  pdf.text("Objet", colX.objet + 2, y + 5.5);
  pdf.text("Montant", colX.montant + 2, y + 5.5);

  y += 10;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);

  for (const item of entries) {
    if (y > 270) {
      pdf.addPage();
      y = 15;
    }

    pdf.text(String(item.date || "-"), colX.date + 2, y);
    pdf.text(String(item.enfant || "-").slice(0, 18), colX.enfant + 2, y);
    pdf.text(String(item.type || "-").slice(0, 18), colX.type + 2, y);
    pdf.text(String(item.lieu || "-").slice(0, 18), colX.lieu + 2, y);
    pdf.text(String(item.objet || "-").slice(0, 22), colX.objet + 2, y);
    pdf.text(formatMoney(item.montant), colX.montant + 2, y);

    y += 7;
  }

  y += 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text(`Nombre de dépenses : ${entries.length}`, 14, y);
  pdf.text(`Total : ${formatMoney(total)}`, 140, y);

  const fileName = `parking_${getFileNameMonth(moisValue)}.pdf`;
  const pdfBlob = pdf.output("blob");

  addPdfToGlobalHistory(pdfBlob, fileName, moisLabel);
  pdf.save(fileName);
  showToast("PDF généré et ajouté à l’historique");
}

async function loadProfileParking() {
  if (!currentUser) return;

  try {
    const profileRef = doc(db, "users", currentUser.uid, "profile", "main");
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    const profileName = String(data.fullName || "").trim();
    const children = String(data.childrenList || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (assistantInput && !assistantInput.value.trim() && profileName) {
      assistantInput.value = profileName;
      saveModule();
    }

    const datalist = document.getElementById("profileChildrenList");
    if (datalist) {
      datalist.innerHTML = "";
      children.forEach((child) => {
        const option = document.createElement("option");
        option.value = child;
        datalist.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Erreur chargement profil parking :", error);
  }
}

function bindEvents() {
  if (btnPhoto && justificatifInput) {
    btnPhoto.addEventListener("click", () => justificatifInput.click());
  }

  if (justificatifInput) {
    justificatifInput.addEventListener("change", () => {
      const file = justificatifInput.files?.[0];
      if (!file) {
        justificatifDataUrl = "";
        if (nomJustificatif) nomJustificatif.textContent = "";
        return;
      }

      if (nomJustificatif) nomJustificatif.textContent = file.name;

      const reader = new FileReader();
      reader.onload = () => {
        justificatifDataUrl = reader.result || "";
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnAjouter) btnAjouter.addEventListener("click", addEntry);
  if (btnReset) btnReset.addEventListener("click", resetForm);
  if (btnPdf) btnPdf.addEventListener("click", generatePdf);
  if (btnVider) btnVider.addEventListener("click", clearAllEntries);

  if (moisInput) {
    moisInput.addEventListener("change", saveModule);
  }

  if (assistantInput) {
    assistantInput.addEventListener("input", saveModule);
  }
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user || null;

  if (!currentUser) {
    window.location.href = "connexion.html";
    return;
  }

  if (moisInput && !moisInput.value) {
    moisInput.value = getCurrentMonthValue();
  }

  loadModule();
  renderTable();
  bindEvents();
  await loadProfileParking();
});