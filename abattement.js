import { requirePremium } from "./premium.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let lignesAbattement = [];
let listeEnfantsAbattementMemo = [];
let uid = null;
let eventsBound = false;

const SMIC_DATA = {
  2024: { avant: 11.65, apres: 11.88 },
  2025: { avant: 11.88, apres: 11.88 },
  2026: { avant: 11.88, apres: 11.88 }
};

function getLignesKey() {
  return `lignesAbattement_${uid}`;
}

function getEnfantsKey() {
  return `listeEnfantsAbattementMemo_${uid}`;
}

function getField(id) {
  return document.getElementById(id);
}

function getYearField() {
  return getField("anneeFiscale");
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatEuro(v) {
  return Number(v || 0).toFixed(2).replace(".", ",") + " €";
}

function lireNombre(id) {
  const el = getField(id);
  if (!el) return 0;
  const parsed = parseFloat(String(el.value || "0").replace(",", "."));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function lireTexteMontant(id) {
  const el = getField(id);
  if (!el) return 0;

  const text = String(el.textContent || "0")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const parsed = parseFloat(text);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getCoefficient(type) {
  switch (type) {
    case "non_permanent":
      return 3;
    case "non_permanent_majore":
      return 4;
    case "permanent":
      return 4;
    case "permanent_majore":
      return 5;
    default:
      return 0;
  }
}

function getPeriodeLabel(value) {
  return value === "apres" ? "Novembre → décembre" : "Janvier → octobre";
}

function getTypeAccueilLabel(value) {
  switch (value) {
    case "non_permanent":
      return "Non permanent";
    case "non_permanent_majore":
      return "Non permanent majoré";
    case "permanent":
      return "Permanent 24h";
    case "permanent_majore":
      return "Permanent 24h majoré";
    default:
      return value || "-";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const allowed = await requirePremium();
  if (!allowed) return;
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  uid = user.uid;
  lignesAbattement = JSON.parse(localStorage.getItem(getLignesKey()) || "[]");
  listeEnfantsAbattementMemo = JSON.parse(localStorage.getItem(getEnfantsKey()) || "[]");

  chargerInfosAbattement();

  if (!eventsBound) {
    bindAbattementEvents();
    eventsBound = true;
  }

  renderListeEnfantsAbattement();
  renderLignesAbattement();
  calculerAbattement();
});

function saveLignesAbattement() {
  if (!uid) return;
  localStorage.setItem(getLignesKey(), JSON.stringify(lignesAbattement));
}

function saveListeEnfants() {
  if (!uid) return;
  localStorage.setItem(getEnfantsKey(), JSON.stringify(listeEnfantsAbattementMemo));
}

function chargerInfosAbattement() {
  const assistantNom =
    localStorage.getItem(`assistantNomAbattement_${uid}`) ||
    localStorage.getItem(`assistantNom_${uid}`) ||
    "";

  const champ = getField("assistantNomAbattement");
  if (champ) champ.value = assistantNom;

  updateSmicParAnnee();
  updateCasesFiscales();
}

function saveAssistantNomAbattement() {
  const el = getField("assistantNomAbattement");
  if (!el || !uid) return;
  localStorage.setItem(`assistantNomAbattement_${uid}`, el.value.trim());
}

function ajouterEnfantMemo(nom) {
  const clean = String(nom || "").trim();
  if (!clean) return;

  const exists = listeEnfantsAbattementMemo.some(
    (e) => e.toLowerCase() === clean.toLowerCase()
  );

  if (!exists) {
    listeEnfantsAbattementMemo.push(clean);
    listeEnfantsAbattementMemo.sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
    saveListeEnfants();
  }
}

function renderListeEnfantsAbattement() {
  const datalist = getField("listeEnfantsAbattement");
  if (!datalist) return;

  datalist.innerHTML = "";
  listeEnfantsAbattementMemo.forEach((nom) => {
    const option = document.createElement("option");
    option.value = nom;
    datalist.appendChild(option);
  });
}

function updateSmicParAnnee() {
  const yearField = getYearField();
  const yearValue = Number(yearField?.value || new Date().getFullYear());
  const config = SMIC_DATA[yearValue] || SMIC_DATA[2026];

  const smicAvant = getField("smicAvantNov");
  const smicApres = getField("smicApresNov");

  if (smicAvant && !smicAvant.dataset.manualEdited) {
    smicAvant.value = Number(config.avant).toFixed(2);
  }

  if (smicApres && !smicApres.dataset.manualEdited) {
    smicApres.value = Number(config.apres).toFixed(2);
  }
}

function updateCasesFiscales() {
  const caseAbattement = getField("caseAbattement");
  const caseImposable = getField("caseImposable");

  if (caseAbattement) caseAbattement.textContent = "1GA à 1JA";
  if (caseImposable) caseImposable.textContent = "1AJ à 1DJ";
}

function ajouterLigneAbattement() {
  const enfant = getField("nomEnfantLigne")?.value.trim() || "";
  const periode = getField("periodeLigne")?.value || "avant";
  const typeAccueil = getField("typeAccueilLigne")?.value || "non_permanent";
  const jours = parseFloat(String(getField("joursLigne")?.value || "0").replace(",", "."));

  if (!enfant || !periode || !typeAccueil || Number.isNaN(jours) || jours <= 0) {
    alert("Merci de remplir correctement la ligne enfant.");
    return;
  }

  ajouterEnfantMemo(enfant);
  renderListeEnfantsAbattement();

  lignesAbattement.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    enfant,
    periode,
    typeAccueil,
    jours: Number(jours)
  });

  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
  resetLigneAbattement();
}

function supprimerLigneAbattement(id) {
  lignesAbattement = lignesAbattement.filter((ligne) => String(ligne.id) !== String(id));
  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
}

function viderLignesAbattement() {
  if (!lignesAbattement.length) return;
  if (!confirm("Voulez-vous vraiment vider toutes les lignes ?")) return;

  lignesAbattement = [];
  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
}

function resetLigneAbattement() {
  if (getField("nomEnfantLigne")) getField("nomEnfantLigne").value = "";
  if (getField("periodeLigne")) getField("periodeLigne").value = "avant";
  if (getField("typeAccueilLigne")) getField("typeAccueilLigne").value = "non_permanent";
  if (getField("joursLigne")) getField("joursLigne").value = "0";
}

function resetAbattement() {
  lignesAbattement = [];
  saveLignesAbattement();
  renderLignesAbattement();

  if (getField("totalSommesRecues")) getField("totalSommesRecues").value = "0";
  if (getField("detailCalculAbattement")) {
    getField("detailCalculAbattement").textContent = "Aucun calcul effectué.";
  }

  calculerAbattement();
}

window.resetAbattement = resetAbattement;

function calculerAbattement() {
  const totalSommesRecues = lireNombre("totalSommesRecues");
  const smicAvant = lireNombre("smicAvantNov");
  const smicApres = lireNombre("smicApresNov");

  let abattement = 0;
  let totalJours = 0;
  const details = [];

  lignesAbattement.forEach((ligne) => {
    const coef = getCoefficient(ligne.typeAccueil);
    const smic = ligne.periode === "apres" ? smicApres : smicAvant;
    const montant = Number(ligne.jours || 0) * coef * smic;

    totalJours += Number(ligne.jours || 0);
    abattement += montant;

    details.push(
      `${ligne.enfant} | ${getPeriodeLabel(ligne.periode)} | ${getTypeAccueilLabel(ligne.typeAccueil)} | ${ligne.jours} j | coef ${coef} | SMIC ${smic.toFixed(2)} | ${montant.toFixed(2)} €`
    );
  });

  const retenu = Math.min(abattement, totalSommesRecues);
  const imposable = Math.max(0, totalSommesRecues - retenu);

  if (getField("nbLignesAbattement")) {
    getField("nbLignesAbattement").textContent = String(lignesAbattement.length);
  }
  if (getField("totalJoursAbattement")) {
    getField("totalJoursAbattement").textContent = totalJours.toFixed(2).replace(".", ",");
  }
  if (getField("abattementCalcule")) {
    getField("abattementCalcule").textContent = formatEuro(abattement);
  }
  if (getField("abattementRetenu")) {
    getField("abattementRetenu").textContent = formatEuro(retenu);
  }
  if (getField("montantImposable")) {
    getField("montantImposable").textContent = formatEuro(imposable);
  }
  if (getField("detailCalculAbattement")) {
    getField("detailCalculAbattement").textContent =
      details.length > 0 ? details.join("\n") : "Aucun calcul effectué.";
  }

  updateCasesFiscales();
}

function renderLignesAbattement() {
  const body = getField("abattementBody");
  if (!body) return;

  body.innerHTML = "";

  if (lignesAbattement.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune ligne enregistrée</td>
      </tr>
    `;
    return;
  }

  lignesAbattement.forEach((ligne) => {
    const coef = getCoefficient(ligne.typeAccueil);
    const smic = ligne.periode === "apres" ? lireNombre("smicApresNov") : lireNombre("smicAvantNov");
    const montant = Number(ligne.jours || 0) * coef * smic;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ligne.enfant)}</td>
      <td>${escapeHtml(getPeriodeLabel(ligne.periode))}</td>
      <td>${escapeHtml(getTypeAccueilLabel(ligne.typeAccueil))}</td>
      <td>${Number(ligne.jours || 0).toFixed(2).replace(".", ",")}</td>
      <td>${coef}</td>
      <td>${smic.toFixed(2).replace(".", ",")} €</td>
      <td>${formatEuro(montant)}</td>
      <td>
        <button type="button" class="table-action-btn btn-delete-ligne" data-id="${escapeHtml(String(ligne.id))}">
          Supprimer
        </button>
      </td>
    `;
    body.appendChild(tr);
  });

  body.querySelectorAll(".btn-delete-ligne").forEach((btn) => {
    btn.addEventListener("click", () => supprimerLigneAbattement(btn.dataset.id));
  });
}

function drawSummaryBox(pdf, x, y, w, h, label, value) {
  pdf.setDrawColor(210, 214, 220);
  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(x, y, w, h, 3, 3, "FD");

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(label, x + 4, y + 7);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(17, 24, 39);
  pdf.text(value, x + 4, y + 16);
}

function drawTableHeader(pdf, y) {
  const headers = ["Enfant", "Période", "Type", "Jours", "Coef", "Montant"];
  const colX = [10, 42, 81, 129, 147, 162];

  pdf.setFillColor(241, 245, 249);
  pdf.rect(10, y - 5, 190, 8, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  headers.forEach((header, index) => {
    pdf.text(header, colX[index], y);
  });

  pdf.setDrawColor(203, 213, 225);
  pdf.line(10, y + 3, 200, y + 3);
}

async function genererPdfAbattement() {
  try {
    const jsPDFClass = window.jspdf?.jsPDF || window.jsPDF;

    if (!jsPDFClass) {
      console.error("jsPDF introuvable :", window.jspdf, window.jsPDF);
      alert("La librairie PDF n'est pas chargée.");
      return;
    }

    const pdf = new jsPDFClass();
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 16;

    const assistant = getField("assistantNomAbattement")?.value || "-";
    const annee = getField("anneeFiscale")?.value || "-";
    const totalRecu = lireNombre("totalSommesRecues");
    const abattementCalcule = lireTexteMontant("abattementCalcule");
    const abattementRetenu = lireTexteMontant("abattementRetenu");
    const imposable = lireTexteMontant("montantImposable");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("ABATTEMENT FISCAL", pageWidth / 2, y, { align: "center" });
    y += 10;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(31, 41, 55);
    pdf.text(`Assistant : ${assistant}`, 14, y);
    y += 6;
    pdf.text(`Année fiscale : ${annee}`, 14, y);
    y += 10;

    const boxY = y;
    const boxW = 58;
    const boxH = 22;
    drawSummaryBox(pdf, 10, boxY, boxW, boxH, "Total reçu", formatEuro(totalRecu));
    drawSummaryBox(pdf, 76, boxY, boxW, boxH, "Abattement retenu", formatEuro(abattementRetenu));
    drawSummaryBox(pdf, 142, boxY, boxW, boxH, "Montant imposable", formatEuro(imposable));
    y += 30;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(17, 24, 39);
    pdf.text("Résumé du calcul", 14, y);
    y += 8;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Abattement calculé : ${formatEuro(abattementCalcule)}`, 14, y);
    y += 6;
    pdf.text(`Nombre de lignes : ${lignesAbattement.length}`, 14, y);
    y += 6;
    pdf.text(`Total jours : ${getField("totalJoursAbattement")?.textContent || "0"}`, 14, y);
    y += 10;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Détail des lignes", 14, y);
    y += 8;

    drawTableHeader(pdf, y);
    y += 10;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);

    if (!lignesAbattement.length) {
      pdf.text("Aucune ligne enregistrée.", 14, y);
    } else {
      for (const ligne of lignesAbattement) {
        const coef = getCoefficient(ligne.typeAccueil);
        const smic = ligne.periode === "apres" ? lireNombre("smicApresNov") : lireNombre("smicAvantNov");
        const montant = Number(ligne.jours || 0) * coef * smic;

        const row = [
          String(ligne.enfant || "-"),
          getPeriodeLabel(ligne.periode),
          getTypeAccueilLabel(ligne.typeAccueil),
          Number(ligne.jours || 0).toFixed(2).replace(".", ","),
          String(coef),
          formatEuro(montant)
        ];

        const wrapped = [
          pdf.splitTextToSize(row[0], 28),
          pdf.splitTextToSize(row[1], 35),
          pdf.splitTextToSize(row[2], 44),
          pdf.splitTextToSize(row[3], 16),
          pdf.splitTextToSize(row[4], 12),
          pdf.splitTextToSize(row[5], 26)
        ];

        const rowHeight = Math.max(...wrapped.map((w) => w.length)) * 5 + 2;

        if (y + rowHeight > 280) {
          pdf.addPage();
          y = 18;
          drawTableHeader(pdf, y);
          y += 10;
          pdf.setFont("helvetica", "normal");
          pdf.setFontSize(8.5);
        }

        const colX = [10, 42, 81, 129, 147, 162];
        wrapped.forEach((cellLines, index) => {
          pdf.text(cellLines, colX[index], y);
        });

        pdf.setDrawColor(241, 245, 249);
        pdf.line(10, y + rowHeight - 2, 200, y + rowHeight - 2);

        y += rowHeight;
      }
    }

    pdf.setFont("helvetica", "italic");
    pdf.setFontSize(8);
    pdf.setTextColor(100, 116, 139);
    pdf.text("Document généré par EasyFrais", pageWidth / 2, 290, { align: "center" });

    pdf.save(`abattement_${annee || "fiscal"}.pdf`);
  } catch (error) {
    console.error("Erreur PDF abattement :", error);
    alert("Impossible de générer le PDF.");
  }
}

function bindAbattementEvents() {
  const btnAjouter = getField("btnAjouterLigneAbattement");
  const btnReset = getField("btnResetLigneAbattement");
  const btnVider = getField("btnViderLignesAbattement");
  const btnCalculer = getField("btnCalculerAbattement");
  const btnPdf = getField("btnPdfAbattement");

  const inputNom = getField("assistantNomAbattement");
  const smicAvant = getField("smicAvantNov");
  const smicApres = getField("smicApresNov");
  const totalSommesRecues = getField("totalSommesRecues");
  const yearField = getYearField();

  if (btnAjouter) {
    btnAjouter.addEventListener("click", (e) => {
      e.preventDefault();
      ajouterLigneAbattement();
    });
  }

  if (btnReset) {
    btnReset.addEventListener("click", (e) => {
      e.preventDefault();
      resetLigneAbattement();
    });
  }

  if (btnVider) {
    btnVider.addEventListener("click", (e) => {
      e.preventDefault();
      viderLignesAbattement();
    });
  }

  if (btnCalculer) {
    btnCalculer.addEventListener("click", (e) => {
      e.preventDefault();
      calculerAbattement();
    });
  }

  if (btnPdf) {
    btnPdf.addEventListener("click", (e) => {
      e.preventDefault();
      genererPdfAbattement();
    });
  }

  if (inputNom) {
    inputNom.addEventListener("input", saveAssistantNomAbattement);
  }

  if (smicAvant) {
    smicAvant.addEventListener("input", () => {
      smicAvant.dataset.manualEdited = "1";
      renderLignesAbattement();
      calculerAbattement();
    });
  }

  if (smicApres) {
    smicApres.addEventListener("input", () => {
      smicApres.dataset.manualEdited = "1";
      renderLignesAbattement();
      calculerAbattement();
    });
  }

  if (totalSommesRecues) {
    totalSommesRecues.addEventListener("input", calculerAbattement);
  }

  if (yearField) {
    yearField.addEventListener("change", () => {
      const smicAvantField = getField("smicAvantNov");
      const smicApresField = getField("smicApresNov");
      if (smicAvantField) delete smicAvantField.dataset.manualEdited;
      if (smicApresField) delete smicApresField.dataset.manualEdited;

      updateSmicParAnnee();
      renderLignesAbattement();
      calculerAbattement();
    });
  }
}