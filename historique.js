import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

let historique = [];
let storageKey = "historiquePDF_guest";

const body = document.getElementById("historiqueBody");
const filtreType = document.getElementById("filtreType");
const filtreMois = document.getElementById("filtreMois");
const filtreRecherche = document.getElementById("filtreRecherche");
const nbResultats = document.getElementById("nbResultatsHistorique");
const btnResetFiltres = document.getElementById("btnResetFiltres");
const btnMergeSelected = document.getElementById("btnMergeSelected");
const btnSelectAll = document.getElementById("btnSelectAllHistorique");
const btnUnselectAll = document.getElementById("btnUnselectAllHistorique");

bindHistoriqueEvents();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  storageKey = `historiquePDF_${user.uid}`;
  historique = JSON.parse(localStorage.getItem(storageKey) || "[]");

  let modified = false;
  historique = historique.map((item, index) => {
    if (!item.id) {
      modified = true;
      return {
        ...item,
        id: `${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`
      };
    }
    return item;
  });

  if (modified) {
    saveHistorique();
  }

  renderHistorique();
});

function bindHistoriqueEvents() {
  if (filtreType) filtreType.addEventListener("change", renderHistorique);
  if (filtreMois) filtreMois.addEventListener("input", renderHistorique);
  if (filtreRecherche) filtreRecherche.addEventListener("input", renderHistorique);
  if (btnResetFiltres) btnResetFiltres.addEventListener("click", resetFiltres);
  if (btnMergeSelected) btnMergeSelected.addEventListener("click", fusionnerSelection);
  if (btnSelectAll) btnSelectAll.addEventListener("click", cocherToutVisible);
  if (btnUnselectAll) btnUnselectAll.addEventListener("click", decocherToutVisible);
}

function saveHistorique() {
  localStorage.setItem(storageKey, JSON.stringify(historique));
}

function resetFiltres() {
  if (filtreType) filtreType.value = "";
  if (filtreMois) filtreMois.value = "";
  if (filtreRecherche) filtreRecherche.value = "";
  renderHistorique();
}

function getDocumentType(item) {
  if (item.type && String(item.type).trim() !== "") {
    if (String(item.type).startsWith("Fusion")) return "Fusion";
    return item.type;
  }

  const nom = String(item.nom || "").toLowerCase();

  if (nom.includes("fiche_presence") || nom.includes("presence")) return "Fiche de présence";
  if (nom.includes("kilometrique") || nom.includes("deplacements")) return "Frais kilométriques";
  if (nom.includes("parking")) return "Frais de parking";
  if (nom.includes("habillement")) return "Habillement";
  if (nom.includes("abattement")) return "Abattement";
  if (nom.includes("formation")) return "Formation";
  if (nom.includes("noel")) return "Frais de Noël";
  if (nom.includes("scolaire")) return "Frais scolaires";
  if (nom.includes("loisir") || nom.includes("sports")) return "Sports et loisirs";
  if (nom.includes("autres")) return "Autres frais";
  if (nom.includes("note")) return "Note de frais";
  if (nom.includes("fusion")) return "Fusion";

  return "Non classé";
}

function getHistoriqueFiltre() {
  const typeValue = (filtreType?.value || "").trim().toLowerCase();
  const moisValue = (filtreMois?.value || "").trim().toLowerCase();
  const rechercheValue = (filtreRecherche?.value || "").trim().toLowerCase();

  return historique
    .slice()
    .reverse()
    .filter((item) => {
      const type = getDocumentType(item).toLowerCase();
      const mois = String(item.mois || "").toLowerCase();
      const nom = String(item.nom || "").toLowerCase();
      const dateGeneration = String(item.dateGeneration || item.date || "").toLowerCase();

      const matchType = !typeValue || type === typeValue;
      const matchMois = !moisValue || mois.includes(moisValue);
      const matchRecherche =
        !rechercheValue ||
        nom.includes(rechercheValue) ||
        type.includes(rechercheValue) ||
        mois.includes(rechercheValue) ||
        dateGeneration.includes(rechercheValue);

      return matchType && matchMois && matchRecherche;
    });
}

function renderHistorique() {
  if (!body || !nbResultats) return;

  const liste = getHistoriqueFiltre();
  body.innerHTML = "";
  nbResultats.textContent = String(liste.length);

  if (liste.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">Aucun PDF trouvé</td>
      </tr>
    `;
    return;
  }

  liste.forEach((item) => {
    const typeAffiche = getDocumentType(item);
    const tr = document.createElement("tr");

    const hasData = !!item.data;
    const dateAffiche = item.dateGeneration || item.date || "-";

    tr.innerHTML = `
      <td class="checkbox-cell">
        ${hasData ? `<input type="checkbox" class="pdf-checkbox" data-id="${escapeHtml(String(item.id))}">` : ""}
      </td>
      <td>${escapeHtml(item.mois || "-")}</td>
      <td>${escapeHtml(typeAffiche)}</td>
      <td>${escapeHtml(item.nom || "-")}</td>
      <td>${escapeHtml(dateAffiche)}</td>
      <td>
        ${hasData ? `
          <button class="table-action-btn btn-download" data-id="${escapeHtml(String(item.id))}" style="background:#16a34a;">
            Télécharger
          </button>
        ` : `
          <button class="table-action-btn" type="button" disabled style="background:#64748b; cursor:not-allowed;">
            Télécharger
          </button>
        `}
        <button class="table-action-btn btn-delete" data-id="${escapeHtml(String(item.id))}" style="margin-left:8px;">
          Supprimer
        </button>
      </td>
    `;

    body.appendChild(tr);
  });

  document.querySelectorAll(".btn-download").forEach((btn) => {
    btn.addEventListener("click", () => telechargerPdf(btn.dataset.id));
  });

  document.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => supprimerPdf(btn.dataset.id));
  });
}

function telechargerPdf(id) {
  const item = historique.find((pdf) => String(pdf.id) === String(id));
  if (!item) return;

  if (!item.data) {
    alert("Ce PDF est présent dans l’historique, mais le téléchargement local n’est pas disponible pour cette entrée.");
    return;
  }

  const link = document.createElement("a");
  link.href = item.data;
  link.download = item.nom || "document.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function supprimerPdf(id) {
  const item = historique.find((pdf) => String(pdf.id) === String(id));
  if (!item) return;

  const ok = confirm(`Voulez-vous vraiment supprimer "${item.nom || "ce PDF"}" de l’historique ?`);
  if (!ok) return;

  historique = historique.filter((pdf) => String(pdf.id) !== String(id));
  saveHistorique();
  renderHistorique();
}

function cocherToutVisible() {
  document.querySelectorAll(".pdf-checkbox").forEach((cb) => {
    cb.checked = true;
  });
}

function decocherToutVisible() {
  document.querySelectorAll(".pdf-checkbox").forEach((cb) => {
    cb.checked = false;
  });
}

function getSelectedItems() {
  const checkedIds = [...document.querySelectorAll(".pdf-checkbox:checked")].map((cb) => String(cb.dataset.id));
  return getHistoriqueFiltre().filter((item) => checkedIds.includes(String(item.id)) && item.data);
}

async function fusionnerSelection() {
  const selectedItems = getSelectedItems();

  if (selectedItems.length === 0) {
    alert("Merci de cocher au moins un PDF téléchargeable.");
    return;
  }

  if (!window.PDFLib) {
    alert("La librairie PDF-Lib n'est pas chargée.");
    return;
  }

  try {
    const { PDFDocument } = window.PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const item of selectedItems) {
      const bytes = dataUriToUint8Array(item.data);
      const pdf = await PDFDocument.load(bytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], { type: "application/pdf" });

    const today = new Date();
    const dateIso = today.toISOString().slice(0, 10);
    const fileName = `fusion-historique-${dateIso}.pdf`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1500);

    await ajouterFusionDansHistorique(blob, fileName, selectedItems);
    alert("PDF fusionné avec succès.");
  } catch (error) {
    console.error("Erreur fusion PDF :", error);
    alert("Impossible de fusionner les PDF sélectionnés.");
  }
}

function ajouterFusionDansHistorique(blob, fileName, selectedItems) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = function () {
      try {
        historique.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          mois: "Fusion",
          nom: fileName,
          data: reader.result,
          dateGeneration: new Date().toLocaleString("fr-FR"),
          type: `Fusion (${selectedItems.length} PDF)`
        });

        saveHistorique();
        renderHistorique();
        resolve();
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = function (error) {
      reject(error);
    };

    reader.readAsDataURL(blob);
  });
}

function dataUriToUint8Array(dataUri) {
  const parts = String(dataUri || "").split(",");
  if (parts.length < 2) {
    throw new Error("Data URI invalide");
  }

  const base64 = parts[1];
  const raw = atob(base64);
  const uint8Array = new Uint8Array(raw.length);

  for (let i = 0; i < raw.length; i++) {
    uint8Array[i] = raw.charCodeAt(i);
  }

  return uint8Array;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}