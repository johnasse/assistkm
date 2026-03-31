import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const STORAGE_KEY = "congesAvecEnfantsModule";
let currentUser = null;
let profileChildren = [];
let eventsBound = false;

const state = {
  assistantNom: "",
  mois: "",
  dateDepart: "",
  dateRetour: "",
  destination: "",
  transport: "",
  commentaire: "",
  enfants: ["", ""]
};

function getSignatureDataKey() {
  return `signatureCongesAvecData_${currentUser?.uid || "guest"}`;
}

function getSignatureNameKey() {
  return `signatureCongesAvecName_${currentUser?.uid || "guest"}`;
}

function showToast(message) {
  const toast = document.getElementById("toastAvec");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

function getDefaultMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(monthValue) {
  if (!monthValue) return "";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw);
    state.assistantNom = parsed.assistantNom || "";
    state.mois = parsed.mois || "";
    state.dateDepart = parsed.dateDepart || "";
    state.dateRetour = parsed.dateRetour || "";
    state.destination = parsed.destination || "";
    state.transport = parsed.transport || "";
    state.commentaire = parsed.commentaire || "";
    state.enfants = Array.isArray(parsed.enfants) && parsed.enfants.length ? parsed.enfants : ["", ""];
  } catch (error) {
    console.error("Erreur chargement congés avec enfants :", error);
  }
}

function renderChildrenFields() {
  const wrap = document.getElementById("childrenListAvec");
  if (!wrap) return;

  wrap.innerHTML = state.enfants.map((child, index) => `
    <div class="child-row">
      <input
        type="text"
        list="profileChildrenListAvec"
        data-child-index="${index}"
        value="${escapeHtml(child)}"
        placeholder="Nom de l’enfant"
      />
      ${state.enfants.length > 1 ? `<button class="btn btn-danger btn-remove-child" type="button" data-child-index="${index}">Supprimer</button>` : ""}
    </div>
  `).join("");

  wrap.querySelectorAll("input[data-child-index]").forEach((input) => {
    input.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.childIndex);
      state.enfants[idx] = e.target.value;
      saveState();
    });
  });

  wrap.querySelectorAll(".btn-remove-child").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.childIndex);
      state.enfants.splice(idx, 1);
      if (!state.enfants.length) state.enfants.push("");
      renderChildrenFields();
      saveState();
      showToast("Enfant supprimé");
    });
  });
}

function fillFromState() {
  document.getElementById("assistantNomAvec").value = state.assistantNom || "";
  document.getElementById("moisAvec").value = state.mois || getDefaultMonthValue();
  document.getElementById("dateDepartAvec").value = state.dateDepart || "";
  document.getElementById("dateRetourAvec").value = state.dateRetour || "";
  document.getElementById("destinationAvec").value = state.destination || "";
  document.getElementById("transportAvec").value = state.transport || "";
  document.getElementById("commentaireAvec").value = state.commentaire || "";
  renderChildrenFields();
}

function bindFields() {
  if (eventsBound) return;
  eventsBound = true;

  document.getElementById("assistantNomAvec").addEventListener("input", (e) => {
    state.assistantNom = e.target.value;
    saveState();
  });

  document.getElementById("moisAvec").addEventListener("change", (e) => {
    state.mois = e.target.value;
    saveState();
  });

  document.getElementById("dateDepartAvec").addEventListener("change", (e) => {
    state.dateDepart = e.target.value;
    saveState();
  });

  document.getElementById("dateRetourAvec").addEventListener("change", (e) => {
    state.dateRetour = e.target.value;
    saveState();
  });

  document.getElementById("destinationAvec").addEventListener("input", (e) => {
    state.destination = e.target.value;
    saveState();
  });

  document.getElementById("transportAvec").addEventListener("input", (e) => {
    state.transport = e.target.value;
    saveState();
  });

  document.getElementById("commentaireAvec").addEventListener("input", (e) => {
    state.commentaire = e.target.value;
    saveState();
  });

  document.getElementById("btnAddChildAvec").addEventListener("click", () => {
    state.enfants.push("");
    renderChildrenFields();
    saveState();
    showToast("Nouvel enfant ajouté");
  });

  document.getElementById("btnSaveAvec").addEventListener("click", () => {
    saveState();
    showToast("Formulaire enregistré");
  });

  document.getElementById("btnPdfAvec").addEventListener("click", generatePdf);

  document.getElementById("btnSignatureAvec").addEventListener("click", () => {
    document.getElementById("signatureFileAvec").click();
  });

  document.getElementById("signatureFileAvec").addEventListener("change", handleSignatureChange);
  document.getElementById("btnClearSignatureAvec").addEventListener("click", clearSignature);
}

function populateChildrenSuggestions(children) {
  const datalist = document.getElementById("profileChildrenListAvec");
  if (!datalist) return;

  datalist.innerHTML = "";
  children.forEach((child) => {
    const option = document.createElement("option");
    option.value = child;
    datalist.appendChild(option);
  });
}

async function loadProfile() {
  if (!currentUser) return;

  try {
    const profileRef = doc(db, "users", currentUser.uid, "profile", "main");
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    const fullName = String(data.fullName || "").trim();

    profileChildren = String(data.childrenList || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!state.assistantNom && fullName) {
      state.assistantNom = fullName;
    }

    state.enfants = state.enfants.map((child, index) => child || profileChildren[index] || "");

    populateChildrenSuggestions(profileChildren);
    fillFromState();
    saveState();
  } catch (error) {
    console.error("Erreur chargement profil congés avec enfants :", error);
  }
}

function loadSignatureInfo() {
  const data = localStorage.getItem(getSignatureDataKey());
  const name = localStorage.getItem(getSignatureNameKey()) || "";
  const info = document.getElementById("signatureInfoAvec");
  const preview = document.getElementById("signaturePreviewAvec");

  if (!info || !preview) return;

  if (data) {
    info.textContent = name ? `Signature enregistrée : ${name}` : "Signature enregistrée";
    preview.src = data;
    preview.style.display = "block";
  } else {
    info.textContent = "";
    preview.src = "";
    preview.style.display = "none";
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handleSignatureChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!(file.type && file.type.startsWith("image/"))) {
    alert("Merci de choisir une image pour la signature.");
    event.target.value = "";
    return;
  }

  try {
    const data = await fileToBase64(file);
    localStorage.setItem(getSignatureDataKey(), data);
    localStorage.setItem(getSignatureNameKey(), file.name);
    loadSignatureInfo();
    showToast("Signature enregistrée");
  } catch (error) {
    console.error("Erreur signature :", error);
    alert("Impossible de lire la signature.");
  } finally {
    event.target.value = "";
  }
}

function clearSignature() {
  localStorage.removeItem(getSignatureDataKey());
  localStorage.removeItem(getSignatureNameKey());
  loadSignatureInfo();
  showToast("Signature supprimée");
}

function addPdfToHistory(blob, fileName, monthLabel) {
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
      type: "Vacances avec enfants confiés"
    });

    localStorage.setItem(storageKey, JSON.stringify(historique));
  };

  reader.readAsDataURL(blob);
}

async function convertImageDataUrlToJpeg(dataUrl, quality = 0.92) {
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

async function generatePdf() {
  if (!state.assistantNom || !state.dateDepart || !state.dateRetour || !state.destination) {
    alert("Merci de remplir au minimum le nom, les dates et la destination.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const signatureData = localStorage.getItem(getSignatureDataKey());
  const enfantsFiltres = state.enfants.map((e) => e.trim()).filter(Boolean);
  const monthLabel = formatMonthLabel(state.mois);

  let y = 15;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.text("DEMANDE DE CONGES / VACANCES AVEC ENFANTS CONFIES", 105, y, { align: "center" });

  y += 12;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  pdf.text(`Nom de l'assistant familial : ${state.assistantNom}`, 12, y);
  y += 8;
  pdf.text(`Mois : ${monthLabel || "-"}`, 12, y);
  y += 8;
  pdf.text(`Date de départ : ${state.dateDepart || "-"}`, 12, y);
  y += 8;
  pdf.text(`Date de retour : ${state.dateRetour || "-"}`, 12, y);
  y += 8;
  pdf.text(`Lieu de destination : ${state.destination || "-"}`, 12, y);
  y += 8;
  pdf.text(`Moyen de transport : ${state.transport || "-"}`, 12, y);

  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.text("Enfants concernés :", 12, y);

  y += 8;
  pdf.setFont("helvetica", "normal");
  if (enfantsFiltres.length) {
    enfantsFiltres.forEach((child) => {
      pdf.text(`- ${child}`, 18, y);
      y += 7;
    });
  } else {
    pdf.text("- Aucun enfant renseigné", 18, y);
    y += 7;
  }

  y += 8;
  pdf.setFont("helvetica", "bold");
  pdf.text("Observations :", 12, y);
  y += 6;
  pdf.setFont("helvetica", "normal");
  pdf.rect(12, y, 186, 40);
  pdf.text(pdf.splitTextToSize(state.commentaire || "", 178), 15, y + 6);

  y += 55;
  pdf.text(`Fait le : ${new Date().toLocaleDateString("fr-FR")}`, 12, y);
  pdf.text("Signature :", 140, y);
  pdf.rect(140, y + 2, 50, 25);

  if (signatureData) {
    try {
      const converted = await convertImageDataUrlToJpeg(signatureData, 0.92);
      pdf.addImage(converted.dataUrl, "JPEG", 142, y + 4, 46, 18);
    } catch (error) {
      console.error("Erreur ajout signature PDF :", error);
    }
  }

  const fileName = `conges_avec_enfants_${state.mois || "sans-mois"}.pdf`;
  const pdfBlob = pdf.output("blob");

  addPdfToHistory(pdfBlob, fileName, monthLabel);
  pdf.save(fileName);
  showToast("PDF généré et ajouté à l’historique");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUser = user;
  loadState();
  fillFromState();
  bindFields();
  loadSignatureInfo();
  await loadProfile();
});