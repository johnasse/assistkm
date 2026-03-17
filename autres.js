import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisAutres = [];
let autresDb = null;
let uid = null;
let eventsBound = false;

function getStorageKey() {
  return `fraisAutres_${uid}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initDB();
    bindEvents();
  } catch (error) {
    console.error("Erreur initDB :", error);
    showToast("Erreur lors de l'initialisation des justificatifs.");
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  fraisAutres = JSON.parse(localStorage.getItem(getStorageKey()) || "[]");
  render();
});

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;

  const btnAjouter = document.getElementById("btnAjouterAutres");
  const btnReset = document.getElementById("btnResetAutres");
  const btnPdf = document.getElementById("btnPdfAutres");
  const btnVider = document.getElementById("btnViderAutres");
  const btnPhoto = document.getElementById("btnPhotoAutres");
  const inputJustificatif = document.getElementById("justificatifAutres");

  if (btnAjouter) btnAjouter.addEventListener("click", ajouter);
  if (btnReset) btnReset.addEventListener("click", resetForm);
  if (btnPdf) btnPdf.addEventListener("click", genererPDF);
  if (btnVider) btnVider.addEventListener("click", vider);

  if (btnPhoto) {
    btnPhoto.addEventListener("click", () => {
      inputJustificatif?.click();
    });
  }

  if (inputJustificatif) {
    inputJustificatif.addEventListener("change", updateNom);
  }
}

function updateNom() {
  const file = document.getElementById("justificatifAutres")?.files?.[0];
  document.getElementById("nomJustificatifAutres").textContent = file ? file.name : "";
}

async function ajouter() {
  try {
    const date = document.getElementById("dateAutres").value.trim();
    const enfant = document.getElementById("enfantAutres").value.trim();
    const type = document.getElementById("typeAutres").value.trim();
    const lieu = document.getElementById("lieuAutres").value.trim();
    const objet = document.getElementById("objetAutres").value.trim();
    const montantValue = document.getElementById("montantAutres").value;
    const montant = parseFloat(montantValue);
    const file = document.getElementById("justificatifAutres").files[0] || null;

    if (!date || !objet || Number.isNaN(montant) || montant <= 0) {
      alert("Merci de remplir au minimum la date, l'objet et un montant valide.");
      return;
    }

    let justificatifId = null;
    let justificatifNom = "";

    if (file) {
      if (!autresDb) {
        alert("Base justificatifs non disponible.");
        return;
      }

      justificatifId = `justif-autres-${Date.now()}`;
      justificatifNom = file.name;

      await saveFile({
        id: justificatifId,
        name: file.name,
        file: file,
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
      montant,
      justificatifId,
      justificatifNom
    });

    save();
    render();
    resetForm();
    showToast("Dépense ajoutée");
  } catch (error) {
    console.error("Erreur ajout :", error);
    alert("Impossible d'ajouter la dépense.");
  }
}

function render() {
  const body = document.getElementById("autresBody");
  if (!body) return;

  body.innerHTML = "";

  if (!fraisAutres.length) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
      </tr>
    `;
    updateTotals();
    return;
  }

  fraisAutres.forEach((item) => {
    const tr = document.createElement("tr");

    const justif = item.justificatifId
      ? `
        <button type="button" class="btnView" data-id="${item.justificatifId}">Voir</button>
        <button type="button" class="btnDown" data-id="${item.justificatifId}">Télécharger</button>
      `
      : "Aucun";

    tr.innerHTML = `
      <td>${escapeHtml(item.date || "")}</td>
      <td>${escapeHtml(item.enfant || "")}</td>
      <td>${escapeHtml(item.type || "")}</td>
      <td>${escapeHtml(item.lieu || "")}</td>
      <td>${escapeHtml(item.objet || "")}</td>
      <td>${formatMoney(item.montant)}</td>
      <td>${justif}</td>
      <td>
        <button type="button" class="btnDel" data-id="${item.id}">Supprimer</button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btnDel").forEach((btn) => {
    btn.onclick = () => supprimer(btn.dataset.id);
  });

  document.querySelectorAll(".btnView").forEach((btn) => {
    btn.onclick = () => voir(btn.dataset.id);
  });

  document.querySelectorAll(".btnDown").forEach((btn) => {
    btn.onclick = () => download(btn.dataset.id);
  });

  updateTotals();
}

function supprimer(id) {
  fraisAutres = fraisAutres.filter((f) => String(f.id) !== String(id));
  save();
  render();
  showToast("Dépense supprimée");
}

function updateTotals() {
  const total = fraisAutres.reduce((somme, item) => somme + (Number(item.montant) || 0), 0);

  document.getElementById("totalLignesAutres").textContent = fraisAutres.length;
  document.getElementById("totalMontantAutres").textContent = formatMoney(total);
}

function save() {
  if (!uid) return;
  localStorage.setItem(getStorageKey(), JSON.stringify(fraisAutres));
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

async function genererPDF() {
  try {
    if (!fraisAutres.length) {
      alert("Aucune dépense à exporter.");
      return;
    }

    const allowed = await requirePdfAccess();
    if (!allowed) return;

    const mois = document.getElementById("moisAutres").value || "";
    const assistantNom = document.getElementById("assistantNomAutres").value.trim() || "";
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF("landscape");
    let y = 14;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("État des autres frais", 14, y);

    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Mois : ${mois || "-"}`, 14, y);
    doc.text(`Assistant familial : ${assistantNom || "-"}`, 110, y);

    y += 10;

    doc.setFont("helvetica", "bold");
    doc.text("Date", 14, y);
    doc.text("Enfant", 40, y);
    doc.text("Type", 75, y);
    doc.text("Lieu", 120, y);
    doc.text("Objet", 175, y);
    doc.text("Montant", 250, y);

    y += 6;
    doc.setFont("helvetica", "normal");

    fraisAutres.forEach((f) => {
      if (y > 185) {
        doc.addPage("landscape");
        y = 20;
      }

      doc.text(String(f.date || ""), 14, y);
      doc.text(cutText(doc, f.enfant || "", 25), 40, y);
      doc.text(cutText(doc, f.type || "", 35), 75, y);
      doc.text(cutText(doc, f.lieu || "", 45), 120, y);
      doc.text(cutText(doc, f.objet || "", 55), 175, y);
      doc.text(formatMoney(f.montant), 250, y);

      y += 7;
    });

    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text(`Nombre de dépenses : ${fraisAutres.length}`, 14, y);
    doc.text(`Total : ${formatMoney(fraisAutres.reduce((s, i) => s + (Number(i.montant) || 0), 0))}`, 120, y);

    savePdfToHistory(doc, {
      type: "Autres frais",
      nom: "autres-frais.pdf"
    });

    doc.save("autres-frais.pdf");
    showToast("PDF généré");
  } catch (error) {
    console.error("Erreur PDF :", error);
    alert("Impossible de générer le PDF.");
  }
}

function vider() {
  if (!fraisAutres.length) {
    alert("La liste est déjà vide.");
    return;
  }

  if (confirm("Tout supprimer ?")) {
    fraisAutres = [];
    save();
    render();
    showToast("Liste vidée");
  }
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

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function saveFile(fileRecord) {
  return new Promise((resolve, reject) => {
    if (!autresDb) {
      reject(new Error("Base IndexedDB non disponible"));
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
      reject(new Error("Base IndexedDB non disponible"));
      return;
    }

    const tx = autresDb.transaction(["justificatifs"], "readonly");
    const store = tx.objectStore("justificatifs");
    const req = store.get(id);

    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function voir(id) {
  try {
    const record = await getFile(id);

    if (!record || !record.file) {
      alert("Justificatif introuvable.");
      return;
    }

    const url = URL.createObjectURL(record.file);
    window.open(url, "_blank");
  } catch (error) {
    console.error("Erreur voir justificatif :", error);
    alert("Impossible d'ouvrir le justificatif.");
  }
}

async function download(id) {
  try {
    const record = await getFile(id);

    if (!record || !record.file) {
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
    console.error("Erreur téléchargement :", error);
    alert("Impossible de télécharger le justificatif.");
  }
}

function formatMoney(value) {
  return `${(Number(value) || 0).toFixed(2)} €`;
}

function cutText(doc, text, maxLength) {
  const value = String(text || "");
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 3) + "...";
}

function escapeHtml(str) {
  return String(str)
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
  }, 2000);
}
