import { requirePremium } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";

let lignesAbattement = JSON.parse(localStorage.getItem("lignesAbattement") || "[]");
let listeEnfantsAbattementMemo = JSON.parse(localStorage.getItem("listeEnfantsAbattementMemo") || "[]");

document.addEventListener("DOMContentLoaded", async () => {
  const allowed = await requirePremium();
  if (!allowed) return;

  chargerInfosAbattement();
  bindAbattementEvents();
  renderListeEnfantsAbattement();
  renderLignesAbattement();
  calculerAbattement();
});

function bindAbattementEvents() {
  const assistantNom = document.getElementById("assistantNomAbattement");
  const anneeFiscale = document.getElementById("anneeFiscale");
  const typeEmployeur = document.getElementById("typeEmployeur");
  const btnAjouter = document.getElementById("btnAjouterLigneAbattement");
  const btnResetLigne = document.getElementById("btnResetLigneAbattement");
  const btnCalculer = document.getElementById("btnCalculerAbattement");
  const btnPdf = document.getElementById("btnPdfAbattement");
  const btnVider = document.getElementById("btnViderLignesAbattement");
  const totalSommesRecues = document.getElementById("totalSommesRecues");

  if (assistantNom) assistantNom.addEventListener("input", saveAssistantNomAbattement);

  if (anneeFiscale) {
    anneeFiscale.addEventListener("change", () => {
      updateSmicParAnnee();
      renderLignesAbattement();
      calculerAbattement();
    });
  }

  if (typeEmployeur) typeEmployeur.addEventListener("change", updateCasesFiscales);
  if (btnAjouter) btnAjouter.addEventListener("click", ajouterLigneAbattement);
  if (btnResetLigne) btnResetLigne.addEventListener("click", resetLigneAbattement);
  if (btnCalculer) btnCalculer.addEventListener("click", calculerAbattement);
  if (btnPdf) btnPdf.addEventListener("click", genererPDFAbattement);
  if (btnVider) btnVider.addEventListener("click", viderLignesAbattement);
  if (totalSommesRecues) totalSommesRecues.addEventListener("input", calculerAbattement);
}

function chargerInfosAbattement() {
  const assistantNom =
    localStorage.getItem("assistantNomAbattement") ||
    localStorage.getItem("assistantNom") ||
    "";

  const champAssistant = document.getElementById("assistantNomAbattement");
  if (champAssistant) champAssistant.value = assistantNom;

  updateSmicParAnnee();
  updateCasesFiscales();
}

function saveAssistantNomAbattement() {
  const el = document.getElementById("assistantNomAbattement");
  if (!el) return;
  localStorage.setItem("assistantNomAbattement", el.value.trim());
}

function updateSmicParAnnee() {
  const annee = document.getElementById("anneeFiscale")?.value;
  const smicAvant = document.getElementById("smicAvantNov");
  const smicApres = document.getElementById("smicApresNov");

  if (!smicAvant || !smicApres) return;

  if (annee === "2024") {
    smicAvant.value = "11.65";
    smicApres.value = "11.88";
  } else {
    smicAvant.value = "11.88";
    smicApres.value = "11.88";
  }
}

function updateCasesFiscales() {
  const typeEmployeur = document.getElementById("typeEmployeur")?.value;
  const caseImposable = document.getElementById("caseImposable");
  const caseAbattement = document.getElementById("caseAbattement");

  if (caseImposable) {
    caseImposable.textContent =
      typeEmployeur === "particulier" ? "1AA à 1DA" : "1AJ à 1DJ";
  }

  if (caseAbattement) {
    caseAbattement.textContent = "1GA à 1JA";
  }
}

function formatEuro(value) {
  return Number(value || 0).toFixed(2).replace(".", ",") + " €";
}

function lireNombre(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  return Number(parseFloat(el.value || "0"));
}

function getCoefficient(typeAccueil) {
  switch (typeAccueil) {
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

function getLabelTypeAccueil(typeAccueil) {
  switch (typeAccueil) {
    case "non_permanent":
      return "Non permanent";
    case "non_permanent_majore":
      return "Non permanent majore";
    case "permanent":
      return "Permanent 24h";
    case "permanent_majore":
      return "Permanent 24h majore";
    default:
      return "-";
  }
}

function getLabelPeriode(periode) {
  return periode === "avant" ? "Janvier -> octobre" : "Novembre -> decembre";
}

function ajouterEnfantMemo(nom) {
  const clean = String(nom || "").trim();
  if (!clean) return;

  const exists = listeEnfantsAbattementMemo.some(
    (item) => item.toLowerCase() === clean.toLowerCase()
  );

  if (!exists) {
    listeEnfantsAbattementMemo.push(clean);
    listeEnfantsAbattementMemo.sort((a, b) =>
      a.localeCompare(b, "fr", { sensitivity: "base" })
    );
    localStorage.setItem(
      "listeEnfantsAbattementMemo",
      JSON.stringify(listeEnfantsAbattementMemo)
    );
  }
}

function renderListeEnfantsAbattement() {
  const datalist = document.getElementById("listeEnfantsAbattement");
  if (!datalist) return;

  datalist.innerHTML = "";

  listeEnfantsAbattementMemo.forEach((nom) => {
    const option = document.createElement("option");
    option.value = nom;
    datalist.appendChild(option);
  });
}

function ajouterLigneAbattement() {
  const enfant = document.getElementById("nomEnfantLigne")?.value.trim() || "";
  const periode = document.getElementById("periodeLigne")?.value || "";
  const typeAccueil = document.getElementById("typeAccueilLigne")?.value || "";
  const jours = Number(parseFloat(document.getElementById("joursLigne")?.value || "0"));

  if (!enfant || !periode || !typeAccueil || jours <= 0) {
    alert("Merci de remplir correctement la ligne enfant.");
    return;
  }

  ajouterEnfantMemo(enfant);
  renderListeEnfantsAbattement();

  lignesAbattement.push({
    id: Date.now(),
    enfant,
    periode,
    typeAccueil,
    jours
  });

  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
  resetLigneAbattement();
  showToastAbattement("Ligne ajoutee");
}

function renderLignesAbattement() {
  const body = document.getElementById("abattementBody");
  const totalJoursEl = document.getElementById("totalJoursAbattement");
  const nbLignesEl = document.getElementById("nbLignesAbattement");

  if (!body) return;

  body.innerHTML = "";

  if (lignesAbattement.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">Aucune ligne enregistree</td>
      </tr>
    `;
    if (totalJoursEl) totalJoursEl.textContent = "0";
    if (nbLignesEl) nbLignesEl.textContent = "0";
    return;
  }

  const smicAvantNov = lireNombre("smicAvantNov");
  const smicApresNov = lireNombre("smicApresNov");

  lignesAbattement.forEach((ligne) => {
    const coefficient = getCoefficient(ligne.typeAccueil);
    const smic = ligne.periode === "avant" ? smicAvantNov : smicApresNov;
    const montant = ligne.jours * coefficient * smic;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ligne.enfant)}</td>
      <td>${escapeHtml(getLabelPeriode(ligne.periode))}</td>
      <td>${escapeHtml(getLabelTypeAccueil(ligne.typeAccueil))}</td>
      <td>${String(ligne.jours).replace(".", ",")}</td>
      <td>${coefficient}</td>
      <td>${smic.toFixed(2).replace(".", ",")} €</td>
      <td>${formatEuro(montant)}</td>
      <td><button class="table-action-btn btn-delete-ligne" data-id="${ligne.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-delete-ligne").forEach((btn) => {
    btn.addEventListener("click", () => {
      supprimerLigneAbattement(Number(btn.dataset.id));
    });
  });

  const totalJours = lignesAbattement.reduce(
    (sum, ligne) => sum + Number(ligne.jours || 0),
    0
  );

  if (totalJoursEl) totalJoursEl.textContent = String(totalJours).replace(".", ",");
  if (nbLignesEl) nbLignesEl.textContent = String(lignesAbattement.length);
}

function supprimerLigneAbattement(id) {
  lignesAbattement = lignesAbattement.filter((ligne) => ligne.id !== id);
  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
  showToastAbattement("Ligne supprimee");
}

function viderLignesAbattement() {
  if (lignesAbattement.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toutes les lignes ?");
  if (!ok) return;

  lignesAbattement = [];
  saveLignesAbattement();
  renderLignesAbattement();
  calculerAbattement();
  showToastAbattement("Lignes videes");
}

function saveLignesAbattement() {
  localStorage.setItem("lignesAbattement", JSON.stringify(lignesAbattement));
}

function resetLigneAbattement() {
  const nomEnfant = document.getElementById("nomEnfantLigne");
  const periode = document.getElementById("periodeLigne");
  const typeAccueil = document.getElementById("typeAccueilLigne");
  const jours = document.getElementById("joursLigne");

  if (nomEnfant) nomEnfant.value = "";
  if (periode) periode.value = "avant";
  if (typeAccueil) typeAccueil.value = "non_permanent";
  if (jours) jours.value = "0";
}

function calculerAbattement() {
  const totalSommesRecues = lireNombre("totalSommesRecues");
  const smicAvantNov = lireNombre("smicAvantNov");
  const smicApresNov = lireNombre("smicApresNov");

  let abattementCalcule = 0;
  const details = [];
  const totalJours = lignesAbattement.reduce(
    (sum, ligne) => sum + Number(ligne.jours || 0),
    0
  );

  lignesAbattement.forEach((ligne) => {
    const coefficient = getCoefficient(ligne.typeAccueil);
    const smic = ligne.periode === "avant" ? smicAvantNov : smicApresNov;
    const montant = ligne.jours * coefficient * smic;

    abattementCalcule += montant;

    details.push(
      `${ligne.enfant} - ${getLabelPeriode(ligne.periode)} - ${getLabelTypeAccueil(ligne.typeAccueil)} : ` +
      `${String(ligne.jours).replace(".", ",")} x ${coefficient} x ${smic.toFixed(2)} = ${formatEuro(montant)}`
    );
  });

  const abattementRetenu = Math.min(abattementCalcule, totalSommesRecues);
  const montantImposable = Math.max(0, totalSommesRecues - abattementRetenu);

  const abattementCalculeEl = document.getElementById("abattementCalcule");
  const abattementRetenuEl = document.getElementById("abattementRetenu");
  const montantImposableEl = document.getElementById("montantImposable");
  const totalJoursEl = document.getElementById("totalJoursAbattement");
  const detailEl = document.getElementById("detailCalculAbattement");

  if (abattementCalculeEl) abattementCalculeEl.textContent = formatEuro(abattementCalcule);
  if (abattementRetenuEl) abattementRetenuEl.textContent = formatEuro(abattementRetenu);
  if (montantImposableEl) montantImposableEl.textContent = formatEuro(montantImposable);
  if (totalJoursEl) totalJoursEl.textContent = String(totalJours).replace(".", ",");

  const detailTexte = [
    `Total jours : ${String(totalJours).replace(".", ",")}`,
    ``,
    ...details,
    ``,
    `Abattement calcule : ${formatEuro(abattementCalcule)}`,
    `Abattement retenu : ${formatEuro(abattementRetenu)}`,
    `Montant imposable : ${formatEuro(montantImposable)}`
  ].join("\n");

  if (detailEl) {
    detailEl.textContent =
      details.length > 0 ? detailTexte : "Aucun calcul effectue.";
  }

  return {
    abattementCalcule,
    abattementRetenu,
    montantImposable,
    totalJours,
    details
  };
}

function normalizePdfText(text) {
  return String(text || "")
    .replaceAll("’", "'")
    .replaceAll("‘", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("–", "-")
    .replaceAll("—", "-")
    .replaceAll("→", "->")
    .replaceAll("×", "x")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function genererPDFAbattement() {
  const assistantNom =
    document.getElementById("assistantNomAbattement")?.value.trim() || "-";
  const annee = document.getElementById("anneeFiscale")?.value || "";
  const typeEmployeur = document.getElementById("typeEmployeur")?.value || "";
  const caseImposable =
    document.getElementById("caseImposable")?.textContent || "-";
  const caseAbattement =
    document.getElementById("caseAbattement")?.textContent || "-";

  const result = calculerAbattement();

  if (lignesAbattement.length === 0) {
    alert("Aucune ligne enfant a exporter.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("La librairie PDF n'est pas chargee.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("portrait", "mm", "a4");

  let y = 18;
  const margin = 12;
  const maxY = 279;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(normalizePdfText("CALCUL DE L'ABATTEMENT FORFAITAIRE"), 105, y, { align: "center" });

  y += 10;
  doc.setFontSize(11);
  doc.text(normalizePdfText("Assistants familiaux"), 105, y, { align: "center" });

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(normalizePdfText(`Annee fiscale : ${annee}`), margin, y);

  y += 7;
  doc.text(normalizePdfText(`Nom / prenom : ${assistantNom}`), margin, y);

  y += 7;
  doc.text(
    normalizePdfText(
      `Type d'employeur : ${typeEmployeur === "particulier" ? "Particulier" : "Personne morale"}`
    ),
    margin,
    y
  );

  y += 10;
  doc.text(normalizePdfText(`Total jours : ${String(result.totalJours).replace(".", ",")}`), margin, y);

  y += 7;
  doc.text(normalizePdfText(`Abattement calcule : ${formatEuro(result.abattementCalcule)}`), margin, y);

  y += 7;
  doc.text(normalizePdfText(`Abattement retenu : ${formatEuro(result.abattementRetenu)}`), margin, y);

  y += 7;
  doc.text(normalizePdfText(`Montant imposable : ${formatEuro(result.montantImposable)}`), margin, y);

  y += 7;
  doc.text(normalizePdfText(`Case revenu imposable : ${caseImposable}`), margin, y);

  y += 7;
  doc.text(normalizePdfText(`Case abattement : ${caseAbattement}`), margin, y);

  y += 12;
  doc.setFont("helvetica", "bold");
  doc.text(normalizePdfText("Detail par enfant"), margin, y);

  y += 8;
  doc.setFont("helvetica", "normal");

  result.details.forEach((ligne) => {
    const safeLine = normalizePdfText(ligne);
    const lines = doc.splitTextToSize(safeLine, 180);

    if (y + lines.length * 5 > maxY) {
      doc.addPage();
      y = 20;
    }

    doc.text(lines, margin, y);
    y += lines.length * 5 + 2;
  });

  y += 8;

  if (y > maxY) {
    doc.addPage();
    y = 20;
  }

  doc.text(normalizePdfText("Signature : ________________________________"), margin, y);

  const fileName = `abattement-forfaitaire-${annee}.pdf`;

  savePdfToHistory(doc, {
    type: "Abattement fiscal",
    nom: fileName,
    mois: formatMonthLabel(annee)
  });

  doc.save(fileName);
  showToastAbattement("PDF genere");
}

function resetAbattement() {
  const totalSommes = document.getElementById("totalSommesRecues");
  const abattementCalculeEl = document.getElementById("abattementCalcule");
  const abattementRetenuEl = document.getElementById("abattementRetenu");
  const montantImposableEl = document.getElementById("montantImposable");
  const detailEl = document.getElementById("detailCalculAbattement");

  if (totalSommes) totalSommes.value = "";
  if (abattementCalculeEl) abattementCalculeEl.textContent = "0,00 €";
  if (abattementRetenuEl) abattementRetenuEl.textContent = "0,00 €";
  if (montantImposableEl) montantImposableEl.textContent = "0,00 €";
  if (detailEl) detailEl.textContent = "Aucun calcul effectue.";
}

function showToastAbattement(message) {
  const toast = document.getElementById("toastAbattement");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.resetAbattement = resetAbattement;
window.calculerAbattement = calculerAbattement;
window.genererPDFAbattement = genererPDFAbattement;