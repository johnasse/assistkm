import { auth, db } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

let map = null;
let directionsService = null;
let directionsRenderer = null;

let totalDistanceKm = 0;
let totalDurationSeconds = 0;
let totalAmount = 0;

let deplacements = [];
let currentUid = null;
let currentProfile = null;
let eventsBound = false;
let baremesUnlocked = false;
let googleInitAttempted = false;

const DEFAULT_BAREMES = {
  3: 0.529,
  4: 0.606,
  5: 0.636,
  6: 0.665,
  7: 0.697
};

function getUid() {
  return currentUid || auth.currentUser?.uid || "guest";
}

function getDeplacementsKey() {
  return `deplacementsMensuels_${getUid()}`;
}

function getDomicileKey() {
  return `adresseDomicile_${getUid()}`;
}

function getAssistantNomKey() {
  return `assistantNom_${getUid()}`;
}

function getMoisEtatKey() {
  return `moisEtat_${getUid()}`;
}

function getBaremesKey() {
  return `baremesKilometriques_${getUid()}`;
}

function getSignatureDataKey() {
  return `signatureKilometriqueData_${getUid()}`;
}

function getSignatureNameKey() {
  return `signatureKilometriqueName_${getUid()}`;
}

function getCarteGriseDataKey() {
  return `carteGriseKilometriqueData_${getUid()}`;
}

function getCarteGriseNameKey() {
  return `carteGriseKilometriqueName_${getUid()}`;
}

function getDestinationsKey() {
  return `destinationsKilometrique_${getUid()}`;
}

function normalizeDestination(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function ensureDestinationsDatalist() {
  let datalist = document.getElementById("destinationsSuggestions");

  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "destinationsSuggestions";
    document.body.appendChild(datalist);
  }

  return datalist;
}

function saveDestinationToHistory(destination) {
  const normalized = normalizeDestination(destination);
  if (!normalized) return;

  const list = JSON.parse(localStorage.getItem(getDestinationsKey()) || "[]");
  const exists = list.some((item) => item.toLowerCase() === normalized.toLowerCase());

  if (!exists) {
    list.push(normalized);
    list.sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
    localStorage.setItem(getDestinationsKey(), JSON.stringify(list));
  }
}

function loadDestinationsSuggestions() {
  const datalist = ensureDestinationsDatalist();
  const list = JSON.parse(localStorage.getItem(getDestinationsKey()) || "[]");

  datalist.innerHTML = "";

  list.forEach((dest) => {
    const option = document.createElement("option");
    option.value = dest;
    datalist.appendChild(option);
  });

  document.querySelectorAll(".destination-input").forEach((input) => {
    input.setAttribute("list", "destinationsSuggestions");
  });
}

function saveCurrentDestinationsToHistory() {
  const destinations = [...document.querySelectorAll(".destination-input")]
    .map((input) => normalizeDestination(input.value))
    .filter(Boolean);

  destinations.forEach(saveDestinationToHistory);
  loadDestinationsSuggestions();
}

function isGoogleMapsAvailable() {
  return !!(window.google && google.maps && google.maps.DirectionsService);
}

function initGoogleServicesIfAvailable() {
  if (!isGoogleMapsAvailable()) return false;
  if (googleInitAttempted && directionsService) return true;

  googleInitAttempted = true;

  try {
    const mapElement = document.getElementById("map");

    if (mapElement) {
      map = new google.maps.Map(mapElement, {
        center: { lat: 49.7579, lng: 0.3746 },
        zoom: 10
      });

      directionsRenderer = new google.maps.DirectionsRenderer({
        map,
        suppressMarkers: false
      });
    }

    directionsService = new google.maps.DirectionsService();

    bindAutocomplete(document.getElementById("domicile"));
    bindAutocomplete(document.getElementById("depart"));
    document.querySelectorAll(".destination-input").forEach((input) => {
      bindAutocomplete(input);
    });

    return true;
  } catch (error) {
    console.error("Erreur initialisation Google Maps :", error);
    return false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.querySelectorAll(".destination-input").length === 0) {
    addDestination();
  }

  if (!eventsBound) {
    bindEvents();
    eventsBound = true;
  }

  initGoogleServicesIfAvailable();
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUid = user.uid;
  loadUserData();
});

async function loadUserData() {
  if (!currentUid) return;

  deplacements = JSON.parse(localStorage.getItem(getDeplacementsKey()) || "[]");

  loadSavedInfos();
  loadBaremes();
  loadSignatureInfo();
  loadCarteGriseInfo();
  loadDestinationsSuggestions();
  await loadProfileData();

  renderDeplacements();
  updateTotals();

  baremesUnlocked = false;
  updateBaremesLockUI();

  initGoogleServicesIfAvailable();
}

async function loadProfileData() {
  try {
    const profileRef = doc(db, "users", currentUid, "profile", "main");
    const snap = await getDoc(profileRef);

    if (!snap.exists()) {
      currentProfile = null;
      populateChildrenSuggestions([]);
      return;
    }

    currentProfile = snap.data() || {};
    applyProfileToKilometrique();
  } catch (error) {
    console.error("Erreur chargement profil kilométrique :", error);
  }
}

function applyProfileToKilometrique() {
  if (!currentProfile) return;

  const assistantNomInput = document.getElementById("assistantNom");
  const domicileInput = document.getElementById("domicile");
  const cvSelect = document.getElementById("cv");

  const savedAssistantNom = localStorage.getItem(getAssistantNomKey()) || "";
  const savedDomicile = localStorage.getItem(getDomicileKey()) || "";

  const profileName = String(currentProfile.fullName || "").trim();
  const profileHomeAddress = String(
    currentProfile.homeAddress || currentProfile.address || ""
  ).trim();

  if (!savedAssistantNom && !assistantNomInput.value.trim() && profileName) {
    assistantNomInput.value = profileName;
    localStorage.setItem(getAssistantNomKey(), profileName);
  }

  if (!savedDomicile && !domicileInput.value.trim() && profileHomeAddress) {
    domicileInput.value = profileHomeAddress;
    localStorage.setItem(getDomicileKey(), profileHomeAddress);

    const savedMsg = document.getElementById("domicileSaved");
    if (savedMsg) {
      savedMsg.textContent = "Adresse du profil chargée automatiquement.";
    }
  }

  const fiscalPower = parseFiscalPower(currentProfile.fiscalPower);
  if (fiscalPower && cvSelect) {
    cvSelect.value = String(fiscalPower);
  }

  const children = parseChildrenList(currentProfile.childrenList || "");
  populateChildrenSuggestions(children);

  syncDepartIfNeeded();
}

function parseFiscalPower(value) {
  if (!value) return 7;

  const match = String(value).match(/\d+/);
  if (!match) return 7;

  const numeric = Number(match[0]);
  if (Number.isNaN(numeric)) return 7;

  return Math.min(Math.max(numeric, 3), 7);
}

function parseChildrenList(value) {
  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function populateChildrenSuggestions(children) {
  const datalist = document.getElementById("childrenSuggestions");
  if (!datalist) return;

  datalist.innerHTML = "";
  children.forEach((child) => {
    const option = document.createElement("option");
    option.value = child;
    datalist.appendChild(option);
  });
}

function useServiceAddressAsDestination() {
  const serviceAddress = String(currentProfile?.serviceAddress || "").trim();

  if (!serviceAddress) {
    alert("Aucune adresse de service n’est enregistrée dans le profil.");
    return;
  }

  const normalized = normalizeDestination(serviceAddress);
  const destinationInputs = [...document.querySelectorAll(".destination-input")];
  const emptyInput = destinationInputs.find((input) => !input.value.trim());

  if (emptyInput) {
    emptyInput.value = normalized;
    saveDestinationToHistory(normalized);
    loadDestinationsSuggestions();
    return;
  }

  addDestination(normalized);
  saveDestinationToHistory(normalized);
  loadDestinationsSuggestions();
}

function bindEvents() {
  document.getElementById("btnAddDestination")?.addEventListener("click", () => addDestination());
  document.getElementById("btnUseServiceDestination")?.addEventListener("click", useServiceAddressAsDestination);
  document.getElementById("btnSaveDomicile")?.addEventListener("click", saveDomicile);
  document.getElementById("btnCalculer")?.addEventListener("click", calculerTrajet);
  document.getElementById("btnAjouterDeplacement")?.addEventListener("click", ajouterDeplacement);
  document.getElementById("btnReset")?.addEventListener("click", resetForm);
  document.getElementById("btnPdfMensuel")?.addEventListener("click", genererPDFMensuel);
  document.getElementById("btnViderListe")?.addEventListener("click", viderListe);
  document.getElementById("departDomicile")?.addEventListener("change", toggleDepartDomicile);
  document.getElementById("domicile")?.addEventListener("input", () => {
    syncDepartIfNeeded();
    initGoogleServicesIfAvailable();
    bindAutocomplete(document.getElementById("domicile"));
  });
  document.getElementById("assistantNom")?.addEventListener("input", saveAssistantNom);
  document.getElementById("moisEtat")?.addEventListener("change", saveMoisEtat);
  document.getElementById("btnSaveBaremes")?.addEventListener("click", saveBaremes);
  document.getElementById("btnResetBaremes")?.addEventListener("click", resetBaremes);
  document.getElementById("btnToggleBaremes")?.addEventListener("click", toggleBaremesLock);

  document.getElementById("btnSignature")?.addEventListener("click", () => {
    document.getElementById("signatureFile")?.click();
  });
  document.getElementById("signatureFile")?.addEventListener("change", handleSignatureChange);
  document.getElementById("btnClearSignature")?.addEventListener("click", clearSignature);

  document.getElementById("btnCarteGrise")?.addEventListener("click", () => {
    document.getElementById("carteGriseFile")?.click();
  });
  document.getElementById("carteGriseFile")?.addEventListener("change", handleCarteGriseChange);
  document.getElementById("btnClearCarteGrise")?.addEventListener("click", clearCarteGrise);
}

function updateBaremesLockUI() {
  const wrapper = document.getElementById("baremesWrapper");
  const btnToggle = document.getElementById("btnToggleBaremes");

  if (!wrapper || !btnToggle) return;

  if (baremesUnlocked) {
    wrapper.classList.remove("baremes-locked");
    wrapper.classList.add("baremes-unlocked");
    btnToggle.textContent = "🔒 Verrouiller";
  } else {
    wrapper.classList.remove("baremes-unlocked");
    wrapper.classList.add("baremes-locked");
    btnToggle.textContent = "✏️ Modifier";
  }
}

function toggleBaremesLock() {
  baremesUnlocked = !baremesUnlocked;
  updateBaremesLockUI();
}

function bindAutocomplete(input) {
  if (!input || !window.google?.maps?.places) return;

  try {
    new google.maps.places.Autocomplete(input, {
      types: ["geocode"],
      componentRestrictions: { country: "fr" }
    });
  } catch (error) {
    console.error("Erreur autocomplete :", error);
  }
}

function loadSavedInfos() {
  const domicile = localStorage.getItem(getDomicileKey());
  const assistantNom = localStorage.getItem(getAssistantNomKey());
  const moisEtat = localStorage.getItem(getMoisEtatKey());

  const domicileInput = document.getElementById("domicile");
  const savedMsg = document.getElementById("domicileSaved");

  if (domicile) {
    domicileInput.value = domicile;
    if (savedMsg) savedMsg.textContent = "Domicile chargé automatiquement.";
  } else {
    domicileInput.value = "";
    if (savedMsg) savedMsg.textContent = "";
  }

  document.getElementById("assistantNom").value = assistantNom || "";

  if (moisEtat) {
    document.getElementById("moisEtat").value = moisEtat;
  } else {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    document.getElementById("moisEtat").value = `${year}-${month}`;
  }

  toggleDepartDomicile();
}

function loadBaremes() {
  const saved = JSON.parse(localStorage.getItem(getBaremesKey()) || "null");

  const baremes = {
    3: Number(saved?.[3] ?? DEFAULT_BAREMES[3]),
    4: Number(saved?.[4] ?? DEFAULT_BAREMES[4]),
    5: Number(saved?.[5] ?? DEFAULT_BAREMES[5]),
    6: Number(saved?.[6] ?? DEFAULT_BAREMES[6]),
    7: Number(saved?.[7] ?? DEFAULT_BAREMES[7])
  };

  document.getElementById("bareme3cv").value = baremes[3].toFixed(3);
  document.getElementById("bareme4cv").value = baremes[4].toFixed(3);
  document.getElementById("bareme5cv").value = baremes[5].toFixed(3);
  document.getElementById("bareme6cv").value = baremes[6].toFixed(3);
  document.getElementById("bareme7cv").value = baremes[7].toFixed(3);
}

function getBaremesFromInputs() {
  return {
    3: parseFloat(document.getElementById("bareme3cv").value || DEFAULT_BAREMES[3]),
    4: parseFloat(document.getElementById("bareme4cv").value || DEFAULT_BAREMES[4]),
    5: parseFloat(document.getElementById("bareme5cv").value || DEFAULT_BAREMES[5]),
    6: parseFloat(document.getElementById("bareme6cv").value || DEFAULT_BAREMES[6]),
    7: parseFloat(document.getElementById("bareme7cv").value || DEFAULT_BAREMES[7])
  };
}

function saveBaremes() {
  const baremes = getBaremesFromInputs();
  const values = [baremes[3], baremes[4], baremes[5], baremes[6], baremes[7]];
  const invalid = values.some((value) => Number.isNaN(value) || value <= 0);

  if (invalid) {
    alert("Merci de renseigner des barèmes valides.");
    return;
  }

  localStorage.setItem(getBaremesKey(), JSON.stringify(baremes));
  showToast("Barèmes enregistrés");
  baremesUnlocked = false;
  updateBaremesLockUI();
}

function resetBaremes() {
  localStorage.setItem(getBaremesKey(), JSON.stringify(DEFAULT_BAREMES));
  loadBaremes();
  showToast("Barèmes par défaut rétablis");
  baremesUnlocked = false;
  updateBaremesLockUI();
}

function saveAssistantNom() {
  localStorage.setItem(getAssistantNomKey(), document.getElementById("assistantNom").value.trim());
}

function saveMoisEtat() {
  localStorage.setItem(getMoisEtatKey(), document.getElementById("moisEtat").value);
}

function addDestination(value = "") {
  const container = document.getElementById("destinations");
  const index = container.querySelectorAll(".dest-row").length + 1;

  ensureDestinationsDatalist();

  const row = document.createElement("div");
  row.className = "dest-row";
  row.innerHTML = `
    <input type="text" class="destination-input" list="destinationsSuggestions" placeholder="Destination ${index}" value="${escapeHtmlAttr(value)}">
    <button type="button" class="btn btn-danger">Supprimer</button>
  `;

  container.appendChild(row);

  const input = row.querySelector(".destination-input");
  const btnDelete = row.querySelector(".btn-danger");

  bindAutocomplete(input);

  input.addEventListener("change", () => {
    const normalized = normalizeDestination(input.value);
    if (normalized) {
      input.value = normalized;
      saveDestinationToHistory(normalized);
      loadDestinationsSuggestions();
    }
  });

  input.addEventListener("blur", () => {
    const normalized = normalizeDestination(input.value);
    if (normalized) {
      input.value = normalized;
      saveDestinationToHistory(normalized);
      loadDestinationsSuggestions();
    }
  });

  btnDelete.addEventListener("click", () => {
    row.remove();
    refreshDestinationPlaceholders();

    if (container.querySelectorAll(".dest-row").length === 0) {
      addDestination();
    }
  });

  loadDestinationsSuggestions();
}

function refreshDestinationPlaceholders() {
  const inputs = document.querySelectorAll(".destination-input");
  inputs.forEach((input, index) => {
    input.placeholder = `Destination ${index + 1}`;
  });
}

function saveDomicile() {
  const domicile = document.getElementById("domicile").value.trim();

  if (!domicile) {
    alert("Merci de saisir l'adresse du domicile.");
    return;
  }

  localStorage.setItem(getDomicileKey(), domicile);
  document.getElementById("domicileSaved").textContent = "Domicile enregistré avec succès.";
  syncDepartIfNeeded();
  showToast("Domicile enregistré");
}

function toggleDepartDomicile() {
  const checkbox = document.getElementById("departDomicile");
  const departInput = document.getElementById("depart");
  const domicile = document.getElementById("domicile").value.trim();

  if (checkbox.checked && !departInput.value.trim()) {
    departInput.value = domicile;
  }

  departInput.disabled = false;
}

function syncDepartIfNeeded() {
  const checkbox = document.getElementById("departDomicile");
  const departInput = document.getElementById("depart");
  const domicile = document.getElementById("domicile").value.trim();

  if (!checkbox.checked) return;

  if (!departInput.value.trim() || departInput.value.trim() === domicile) {
    departInput.value = domicile;
  }
}

function buildRouteRequest(depart, destinations, retourDomicile, domicile) {
  if (retourDomicile) {
    if (!domicile) {
      alert("Merci de renseigner l'adresse du domicile pour le retour.");
      return null;
    }

    return {
      origin: depart,
      destination: domicile,
      waypoints: destinations.map((dest) => ({
        location: dest,
        stopover: true
      })),
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false
    };
  }

  if (destinations.length === 1) {
    return {
      origin: depart,
      destination: destinations[0],
      travelMode: google.maps.TravelMode.DRIVING,
      optimizeWaypoints: false
    };
  }

  return {
    origin: depart,
    destination: destinations[destinations.length - 1],
    waypoints: destinations.slice(0, -1).map((dest) => ({
      location: dest,
      stopover: true
    })),
    travelMode: google.maps.TravelMode.DRIVING,
    optimizeWaypoints: false
  };
}

function calculerTrajet() {
  initGoogleServicesIfAvailable();

  if (!directionsService) {
    alert("Le calcul d’itinéraire Google Maps n’est pas disponible sur cette page.");
    return;
  }

  const depart = document.getElementById("depart").value.trim();
  const domicile = document.getElementById("domicile").value.trim();
  const retourDomicile = document.getElementById("retourDomicile").checked;
  const destinations = [...document.querySelectorAll(".destination-input")]
    .map((input) => normalizeDestination(input.value))
    .filter(Boolean);

  if (!depart) {
    alert("Merci de renseigner l'adresse de départ.");
    return;
  }

  if (destinations.length === 0) {
    alert("Merci d'ajouter au moins une destination.");
    return;
  }

  const request = buildRouteRequest(depart, destinations, retourDomicile, domicile);
  if (!request) return;

  directionsService.route(request, (result, status) => {
    if (status !== "OK") {
      alert("Impossible de calculer le trajet : " + status);
      return;
    }

    if (directionsRenderer) {
      directionsRenderer.setDirections(result);
    }

    totalDistanceKm = 0;
    totalDurationSeconds = 0;

    result.routes[0].legs.forEach((leg) => {
      totalDistanceKm += leg.distance.value / 1000;
      totalDurationSeconds += leg.duration.value;
    });

    totalAmount = calculBareme(totalDistanceKm, Number(document.getElementById("cv").value));

    document.getElementById("distanceTotale").textContent =
      totalDistanceKm.toFixed(1).replace(".", ",") + " km";

    document.getElementById("tempsTotal").textContent = formatDuration(totalDurationSeconds);

    document.getElementById("montantTotal").textContent =
      totalAmount.toFixed(2).replace(".", ",") + " €";
  });
}

function ajouterDeplacement() {
  if (totalDistanceKm <= 0) {
    alert("Merci de calculer le trajet avant d'ajouter le déplacement.");
    return;
  }

  const enfant = document.getElementById("enfant").value.trim();
  const motif = document.getElementById("motif").value.trim();
  const dateTrajet = document.getElementById("dateTrajet").value;
  const heureDebut = document.getElementById("heureDebut").value;
  const heureFin = document.getElementById("heureFin").value;
  const depart = document.getElementById("depart").value.trim();

  const destinations = [...document.querySelectorAll(".destination-input")]
    .map((input) => normalizeDestination(input.value))
    .filter(Boolean);

  if (!enfant || !motif || !dateTrajet || !depart || destinations.length === 0) {
    alert("Merci de remplir les informations principales avant d'ajouter le déplacement.");
    return;
  }

  saveCurrentDestinationsToHistory();

  const lieuRdv = destinations.join(" / ");

  deplacements.push({
    id: Date.now(),
    enfant,
    motif,
    dateTrajet,
    heureDebut,
    heureFin,
    depart,
    professionnel: document.getElementById("professionnel").value.trim(),
    lieuRdv,
    km: Number(totalDistanceKm.toFixed(1)),
    montant: Number(totalAmount.toFixed(2))
  });

  saveDeplacements();
  renderDeplacements();
  showToast("Déplacement ajouté");
  resetFormAfterAdd();
}

function renderDeplacements() {
  const body = document.getElementById("deplacementsBody");
  body.innerHTML = "";

  if (deplacements.length === 0) {
    body.innerHTML = `
      <tr id="emptyRow">
        <td colspan="9" class="empty-cell">Aucun déplacement enregistré</td>
      </tr>
    `;
    updateTotals();
    return;
  }

  deplacements.forEach((item) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.motif)}</td>
      <td>${formatDateFr(item.dateTrajet)}</td>
      <td>${escapeHtml(item.heureDebut || "-")}</td>
      <td>${escapeHtml(item.heureFin || "-")}</td>
      <td>${escapeHtml(item.depart)}</td>
      <td>${escapeHtml(item.lieuRdv)}</td>
      <td>${item.km.toFixed(1).replace(".", ",")}</td>
      <td><button class="btn btn-danger table-action-btn" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
  });

  document.querySelectorAll(".table-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      supprimerDeplacement(Number(btn.dataset.id));
    });
  });

  updateTotals();
}

function supprimerDeplacement(id) {
  deplacements = deplacements.filter((item) => item.id !== id);
  saveDeplacements();
  renderDeplacements();
  showToast("Déplacement supprimé");
}

function viderListe() {
  if (deplacements.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  deplacements = [];
  saveDeplacements();
  renderDeplacements();
  showToast("Liste vidée");
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
      id: Date.now() + Math.floor(Math.random() * 1000),
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

function updateTotals() {
  const totalKm = deplacements.reduce((sum, item) => sum + item.km, 0);
  const totalMontant = deplacements.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalKmMois").textContent =
    totalKm.toFixed(1).replace(".", ",") + " km";

  document.getElementById("totalMontantMois").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

async function genererPDFMensuel() {
  if (deplacements.length === 0) {
    alert("Aucun déplacement à exporter.");
    return;
  }

  const allowed = await requirePdfAccess();
  if (!allowed) return;

  const { jsPDF } = window.jspdf;
  const docPdf = new jsPDF("landscape", "mm", "a4");

  const moisEtat = document.getElementById("moisEtat").value;
  const assistantNom = document.getElementById("assistantNom").value.trim() || "-";
  const totalKm = deplacements.reduce((sum, item) => sum + item.km, 0);
  const baremes = getBaremesFromInputs();
  const dateCreationPdf = new Date().toLocaleDateString("fr-FR");
  const signatureData = localStorage.getItem(getSignatureDataKey());
  const carteGriseData = localStorage.getItem(getCarteGriseDataKey());

  const margin = 10;
  let y = 14;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(13);
  docPdf.text(
    `ETAT DE FRAIS DE DEPLACEMENTS DU MOIS DE : ${formatMonthFr(moisEtat)}`,
    margin,
    y
  );

  y += 8;
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10.5);
  docPdf.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

  y += 8;

  const cols = [
    { key: "enfant", title: "Enfant", width: 35, align: "left" },
    { key: "motif", title: "Motif", width: 40, align: "left" },
    { key: "dateTrajet", title: "Date", width: 20, align: "center" },
    { key: "heureDebut", title: "H. début", width: 18, align: "center" },
    { key: "heureFin", title: "H. fin", width: 18, align: "center" },
    { key: "depart", title: "Lieu départ", width: 60, align: "left" },
    { key: "lieuRdv", title: "Lieu RDV", width: 60, align: "left" },
    { key: "km", title: "KM A/R", width: 18, align: "right" }
  ];

  const headerHeight = 9;
  const lineHeight = 4.5;

  function drawHeader() {
    let x = margin;
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(9.5);

    cols.forEach((col) => {
      docPdf.rect(x, y, col.width, headerHeight);
      drawCellText(docPdf, col.title, x, y, col.width, headerHeight, "center");
      x += col.width;
    });

    y += headerHeight;
  }

  drawHeader();

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9);

  deplacements.forEach((item) => {
    const rowValues = [
      safeText(item.enfant),
      safeText(item.motif),
      formatDateFr(item.dateTrajet),
      item.heureDebut || "-",
      item.heureFin || "-",
      safeText(item.depart),
      safeText(item.lieuRdv),
      item.km.toFixed(1).replace(".", ",")
    ];

    const rowLines = rowValues.map((value, i) => {
      const col = cols[i];

      if (
        col.key === "dateTrajet" ||
        col.key === "heureDebut" ||
        col.key === "heureFin" ||
        col.key === "km"
      ) {
        return [String(value)];
      }

      return docPdf.splitTextToSize(String(value), col.width - 3);
    });

    const maxLines = Math.max(...rowLines.map((lines) => lines.length));
    const rowHeight = Math.max(8, maxLines * lineHeight + 2);

    if (y + rowHeight > 175) {
      docPdf.addPage("landscape", "a4");
      y = 14;

      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(13);
      docPdf.text(
        `ETAT DE FRAIS DE DEPLACEMENTS DU MOIS DE : ${formatMonthFr(moisEtat)}`,
        margin,
        y
      );

      y += 8;
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(10.5);
      docPdf.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

      y += 8;
      drawHeader();
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(9);
    }

    let x = margin;

    rowValues.forEach((value, i) => {
      const col = cols[i];
      docPdf.rect(x, y, col.width, rowHeight);
      drawCellText(docPdf, rowLines[i], x, y, col.width, rowHeight, col.align);
      x += col.width;
    });

    y += rowHeight;
  });

  y += 10;

  if (y > 170) {
    docPdf.addPage("landscape", "a4");
    y = 20;
  }

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10.5);
  docPdf.text(`Total kilomètres : ${totalKm.toFixed(1).replace(".", ",")} km`, margin, y);

  y += 12;

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(10);
  docPdf.text(`Certifié exact le : ${dateCreationPdf}`, margin, y);

  y += 10;
  docPdf.text("Signature assistant familial :", margin, y);

  if (signatureData && isImageDataUrl(signatureData)) {
    try {
      const converted = await convertImageDataUrlToJpeg(signatureData, 0.92);
      let imgWidth = 45;
      let imgHeight = (converted.height / converted.width) * imgWidth;

      if (imgHeight > 22) {
        imgHeight = 22;
        imgWidth = (converted.width / converted.height) * imgHeight;
      }

      docPdf.addImage(converted.dataUrl, "JPEG", margin + 55, y - 7, imgWidth, imgHeight);
    } catch (error) {
      console.error("Erreur ajout signature PDF :", error);
    }
  }

  y += 22;

  if (carteGriseData && isImageDataUrl(carteGriseData)) {
    if (y > 150) {
      docPdf.addPage("landscape", "a4");
      y = 20;
    }

    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(10);
    docPdf.text("Carte grise du véhicule :", margin, y);

    y += 6;

    try {
      const convertedCarte = await convertImageDataUrlToJpeg(carteGriseData, 0.92);

      let imgWidth = 90;
      let imgHeight = (convertedCarte.height / convertedCarte.width) * imgWidth;

      if (imgHeight > 55) {
        imgHeight = 55;
        imgWidth = (convertedCarte.width / convertedCarte.height) * imgHeight;
      }

      docPdf.addImage(
        convertedCarte.dataUrl,
        "JPEG",
        margin,
        y,
        imgWidth,
        imgHeight
      );

      y += imgHeight + 8;
    } catch (error) {
      console.error("Erreur ajout carte grise PDF :", error);
    }
  }

  docPdf.setFont("helvetica", "bold");
  docPdf.text("Barèmes kilométriques utilisés", margin, y);

  y += 7;
  docPdf.setFont("helvetica", "normal");
  docPdf.text(`3 CV : d x ${baremes[3].toFixed(3)} €`, margin, y);
  y += 5.5;
  docPdf.text(`4 CV : d x ${baremes[4].toFixed(3)} €`, margin, y);
  y += 5.5;
  docPdf.text(`5 CV : d x ${baremes[5].toFixed(3)} €`, margin, y);
  y += 5.5;
  docPdf.text(`6 CV : d x ${baremes[6].toFixed(3)} €`, margin, y);
  y += 5.5;
  docPdf.text(`7 CV et plus : d x ${baremes[7].toFixed(3)} €`, margin, y);

  const fileName = `etat-frais-deplacements-${moisEtat || "sans-mois"}.pdf`;
  const monthLabel = formatMonthLabel(moisEtat);

  try {
    await savePdfToHistory(docPdf, {
      mois: monthLabel,
      nom: fileName,
      type: "Frais kilométriques"
    });
  } catch (error) {
    console.error("Erreur enregistrement historique distant :", error);

    try {
      const pdfBlob = docPdf.output("blob");
      addPdfToGlobalHistory(pdfBlob, fileName, monthLabel);
    } catch (fallbackError) {
      console.error("Erreur enregistrement historique local :", fallbackError);
    }
  }

  docPdf.save(fileName);
  showToast("PDF mensuel généré et enregistré");
}

function drawCellText(docPdf, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  const fontSize = docPdf.getFontSize();
  const lineGap = fontSize * 0.35;
  const totalTextHeight = lines.length * lineGap;
  let currentY = y + (height - totalTextHeight) / 2 + 2.2;

  lines.forEach((line) => {
    let textX = x + 1.5;
    if (align === "center") textX = x + width / 2;
    if (align === "right") textX = x + width - 1.5;

    docPdf.text(String(line), textX, currentY, { align });
    currentY += lineGap;
  });
}

function calculBareme(distanceKm, cv) {
  const baremes = getBaremesFromInputs();
  const key = cv >= 7 ? 7 : Math.max(3, Math.min(7, cv));
  return distanceKm * baremes[key];
}

function formatDuration(seconds) {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function formatMonthFr(monthValue) {
  if (!monthValue) return "-";
  const [year, month] = monthValue.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function safeText(value) {
  return String(value || "").trim() || "-";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2200);
}

function handleSignatureChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem(getSignatureDataKey(), reader.result);
    localStorage.setItem(getSignatureNameKey(), file.name);
    loadSignatureInfo();
    showToast("Signature importée");
  };
  reader.readAsDataURL(file);
}

function clearSignature() {
  localStorage.removeItem(getSignatureDataKey());
  localStorage.removeItem(getSignatureNameKey());
  loadSignatureInfo();
  showToast("Signature supprimée");
}

function loadSignatureInfo() {
  const preview = document.getElementById("signaturePreview");
  const info = document.getElementById("signatureInfo");
  const data = localStorage.getItem(getSignatureDataKey());
  const name = localStorage.getItem(getSignatureNameKey());

  if (preview) {
    if (data) {
      preview.src = data;
      preview.style.display = "block";
    } else {
      preview.removeAttribute("src");
      preview.style.display = "none";
    }
  }

  if (info) {
    info.textContent = name ? `Signature chargée : ${name}` : "";
  }
}

function handleCarteGriseChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    localStorage.setItem(getCarteGriseDataKey(), reader.result);
    localStorage.setItem(getCarteGriseNameKey(), file.name);
    loadCarteGriseInfo();
    showToast("Carte grise importée");
  };
  reader.readAsDataURL(file);
}

function clearCarteGrise() {
  localStorage.removeItem(getCarteGriseDataKey());
  localStorage.removeItem(getCarteGriseNameKey());
  loadCarteGriseInfo();
  showToast("Carte grise supprimée");
}

function loadCarteGriseInfo() {
  const info = document.getElementById("carteGriseInfo");
  const name = localStorage.getItem(getCarteGriseNameKey());

  if (info) {
    info.textContent = name ? `Carte grise chargée : ${name}` : "";
  }
}

function isImageDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}

async function convertImageDataUrlToJpeg(dataUrl, quality = 0.92) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          dataUrl: jpegDataUrl,
          width: canvas.width,
          height: canvas.height
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = reject;
    img.src = dataUrl;
  });
}

function resetFormAfterAdd() {
  document.getElementById("dateTrajet").value = "";
  document.getElementById("enfant").value = "";
  document.getElementById("professionnel").value = "";
  document.getElementById("motif").value = "";
  document.getElementById("heureDebut").value = "";
  document.getElementById("heureFin").value = "";
  document.getElementById("retourDomicile").checked = false;

  const departInput = document.getElementById("depart");
  departInput.value = "";
  departInput.disabled = false;

  document.getElementById("destinations").innerHTML = "";
  addDestination();

  totalDistanceKm = 0;
  totalDurationSeconds = 0;
  totalAmount = 0;

  document.getElementById("distanceTotale").textContent = "0 km";
  document.getElementById("tempsTotal").textContent = "0 min";
  document.getElementById("montantTotal").textContent = "0 €";
}

function resetForm() {
  document.getElementById("dateTrajet").value = "";
  document.getElementById("enfant").value = "";
  document.getElementById("professionnel").value = "";
  document.getElementById("motif").value = "";
  document.getElementById("heureDebut").value = "";
  document.getElementById("heureFin").value = "";
  document.getElementById("retourDomicile").checked = false;

  const departInput = document.getElementById("depart");
  departInput.value = "";
  departInput.disabled = false;

  document.getElementById("destinations").innerHTML = "";
  addDestination();

  totalDistanceKm = 0;
  totalDurationSeconds = 0;
  totalAmount = 0;

  document.getElementById("distanceTotale").textContent = "0 km";
  document.getElementById("tempsTotal").textContent = "0 min";
  document.getElementById("montantTotal").textContent = "0 €";

  showToast("Formulaire réinitialisé");
}