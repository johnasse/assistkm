import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

let deplacements = [];
let currentUid = null;

function getUid() {
  return currentUid || auth.currentUser?.uid || "guest";
}

function getDeplacementsKey() {
  return `deplacementsMensuels_${getUid()}`;
}

function getSignatureDataKey() {
  return `signatureKilometriqueData_${getUid()}`;
}

function getCarteGriseDataKey() {
  return `carteGriseKilometriqueData_${getUid()}`;
}

function saveDeplacements() {
  localStorage.setItem(getDeplacementsKey(), JSON.stringify(deplacements));
}

function addPdfToGlobalHistory(blob, fileName, monthLabel) {
  const uid = getUid();
  if (!uid || uid === "guest") return;

  const storageKey = `historiquePDF_${uid}`;
  const historique = JSON.parse(localStorage.getItem(storageKey) || "[]");

  const reader = new FileReader();
  reader.onloadend = function () {
    historique.push({
      id: Date.now(),
      mois: monthLabel || "",
      nom: fileName,
      data: reader.result,
      dateGeneration: new Date().toLocaleString("fr-FR"),
      type: "Frais kilométriques"
    });

    localStorage.setItem(storageKey, JSON.stringify(historique));
  };

  reader.readAsDataURL(blob);
}

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUid = user.uid;
  loadUserData();
});

function loadUserData() {
  deplacements = JSON.parse(localStorage.getItem(getDeplacementsKey()) || "[]");
  renderDeplacements();
}

function renderDeplacements() {
  const body = document.getElementById("deplacementsBody");
  body.innerHTML = "";

  if (deplacements.length === 0) {
    body.innerHTML = `<tr><td colspan="9">Aucun déplacement</td></tr>`;
    return;
  }

  deplacements.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.enfant}</td>
      <td>${item.motif}</td>
      <td>${item.dateTrajet}</td>
      <td>${item.heureDebut}</td>
      <td>${item.heureFin}</td>
      <td>${item.depart}</td>
      <td>${item.lieuRdv}</td>
      <td>${item.km}</td>
      <td><button onclick="supprimerDeplacement(${item.id})">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });
}

function supprimerDeplacement(id) {
  deplacements = deplacements.filter((d) => d.id !== id);
  saveDeplacements();
  renderDeplacements();
}

async function genererPDFMensuel() {
  if (deplacements.length === 0) {
    alert("Aucun déplacement");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF("landscape", "mm", "a4");

  const moisEtat = document.getElementById("moisEtat").value;
  const assistantNom = document.getElementById("assistantNom").value.trim() || "-";
  const signatureData = localStorage.getItem(getSignatureDataKey());
  const carteGriseData = localStorage.getItem(getCarteGriseDataKey());

  let y = 15;

  docPdf.setFontSize(14);
  docPdf.text("ETAT DE FRAIS DE DEPLACEMENTS", 10, y);
  y += 10;

  docPdf.setFontSize(10);
  docPdf.text("Assistant familial : " + assistantNom, 10, y);
  y += 10;

  deplacements.forEach((d) => {
    docPdf.text(
      `${d.dateTrajet} - ${d.enfant} - ${d.motif} - ${d.km} km`,
      10,
      y
    );
    y += 6;
  });

  y += 10;
  docPdf.text("Signature :", 10, y);

  if (signatureData) {
    docPdf.addImage(signatureData, "JPEG", 40, y - 5, 40, 20);
  }

  y += 30;

  if (carteGriseData) {
    docPdf.text("Carte grise :", 10, y);
    y += 5;
    docPdf.addImage(carteGriseData, "JPEG", 10, y, 80, 40);
  }

  const fileName = `etat-frais-${moisEtat}.pdf`;
  const monthLabel = formatMonthLabel(moisEtat);

  try {
    await savePdfToHistory(docPdf, {
      mois: monthLabel,
      nom: fileName,
      type: "Frais kilométriques"
    });
  } catch (error) {
    console.log("Erreur Firebase historique, fallback local");

    const blob = docPdf.output("blob");
    addPdfToGlobalHistory(blob, fileName, monthLabel);
  }

  docPdf.save(fileName);
  alert("PDF généré et enregistré dans l'historique");
}

document.getElementById("btnPdfMensuel")?.addEventListener("click", genererPDFMensuel);