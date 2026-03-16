import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let historique = [];
let storageKey = "historiquePDF_guest";

const body = document.getElementById("historiqueBody");
const filtreType = document.getElementById("filtreType");
const filtreMois = document.getElementById("filtreMois");
const filtreRecherche = document.getElementById("filtreRecherche");
const nbResultats = document.getElementById("nbResultatsHistorique");
const btnResetFiltres = document.getElementById("btnResetFiltres");

bindHistoriqueEvents();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  storageKey = `historiquePDF_${user.uid}`;
  historique = JSON.parse(localStorage.getItem(storageKey) || "[]");
  renderHistorique();
});

function bindHistoriqueEvents() {
  if (filtreType) {
    filtreType.addEventListener("change", renderHistorique);
  }

  if (filtreMois) {
    filtreMois.addEventListener("input", renderHistorique);
  }

  if (filtreRecherche) {
    filtreRecherche.addEventListener("input", renderHistorique);
  }

  if (btnResetFiltres) {
    btnResetFiltres.addEventListener("click", resetFiltres);
  }
}

function resetFiltres() {
  if (filtreType) filtreType.value = "";
  if (filtreMois) filtreMois.value = "";
  if (filtreRecherche) filtreRecherche.value = "";
  renderHistorique();
}

function getDocumentType(item) {
  if (item.type && String(item.type).trim() !== "") {
    return item.type;
  }

  const nom = String(item.nom || "").toLowerCase();

  if (nom.includes("kilometrique") || nom.includes("deplacements")) {
    return "Frais kilométriques";
  }

  if (nom.includes("parking")) {
    return "Frais de parking";
  }

  if (nom.includes("habillement")) {
    return "Habillement";
  }

  if (nom.includes("abattement")) {
    return "Abattement";
  }

  if (nom.includes("formation")) {
    return "Formation";
  }

  if (nom.includes("noel")) {
    return "Frais de Noël";
  }

  if (nom.includes("scolaire")) {
    return "Frais scolaires";
  }

  if (nom.includes("loisir") || nom.includes("sports")) {
    return "Sports et loisirs";
  }

  if (nom.includes("autres")) {
    return "Autres frais";
  }

  if (nom.includes("note")) {
    return "Note de frais";
  }

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
      const dateGeneration = String(item.dateGeneration || "").toLowerCase();

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
        <td colspan="5" class="empty-cell">Aucun PDF trouvé</td>
      </tr>
    `;
    return;
  }

  liste.forEach((item) => {
    const typeAffiche = getDocumentType(item);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(item.mois || "-")}</td>
      <td>${escapeHtml(typeAffiche)}</td>
      <td>${escapeHtml(item.nom || "-")}</td>
      <td>${escapeHtml(item.dateGeneration || "-")}</td>
      <td>
        <button class="table-action-btn btn-download" data-id="${escapeHtml(String(item.id))}" style="background:#16a34a;">
          Télécharger
        </button>
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
  if (!item || !item.data) return;

  const link = document.createElement("a");
  link.href = item.data;
  link.download = item.nom || "document.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function supprimerPdf(id) {
  const ok = confirm("Voulez-vous vraiment supprimer ce PDF de l’historique ?");
  if (!ok) return;

  historique = historique.filter((pdf) => String(pdf.id) !== String(id));
  localStorage.setItem(storageKey, JSON.stringify(historique));
  renderHistorique();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}