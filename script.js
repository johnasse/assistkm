import { auth, db, storage } from "./firebase-config.js";
import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { generateFileName } from "./utils.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { ensureGlobalPinExists, requireGlobalPin } from "./security-pin.js";
import { saveModuleData, loadModuleData } from "./cloud-sync.js";
import {
  ref,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

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

function getMotifsKey() {
  return `motifsKilometriques_${getUid()}`;
}

function getDestinationsKey() {
  return `destinationsKilometriques_${getUid()}`;
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
    document.querySelectorAll(".destination-input").forEach((input) => bindAutocomplete(input));

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

  setDefaultMonthIfNeeded();
  syncDateWithMonth(false);
  initGoogleServicesIfAvailable();
});

onAuthStateChanged(auth, async (user) => {

  if (!user) {
    window.location.href = "connexion.html";
    return;
  }

  currentUid = user.uid;

  if (!ensureGlobalPinExists()) {
    window.location.href = "index.html";
    return;
  }

  const ok = await requireGlobalPin({
    title: "Accès module kilométrique",
    message: "Entre ton code PIN pour accéder au module."
  });

  if (!ok) {
    window.location.href = "index.html";
    return;
  }

  await loadUserData();
});

async function loadUserData() {
  if (!currentUid) return;

  const cloudData = await loadModuleData(currentUid, "kilometrique");

if (Array.isArray(cloudData)) {
  deplacements = cloudData;
} else if (Array.isArray(cloudData?.deplacements)) {
  deplacements = cloudData.deplacements;
} else {
  deplacements = [];
}

// TOUJOURS vérifier qu'une destination existe
if (document.querySelectorAll(".destination-input").length === 0) {
  addDestination();
}


  loadSavedInfos();
  loadBaremes();
  loadSignatureInfo();
  loadCarteGriseInfo();
  loadLogoInfo();
  loadSavedMotifs();
  loadSavedDestinations();
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
      mergeMotifSuggestions([]);
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

  const profileMotifs = parseMotifsList(
    currentProfile.travelMotifs ||
    currentProfile.motifsDeplacement ||
    currentProfile.motifsKilometriques ||
    currentProfile.deplacementMotifs ||
    currentProfile.motifs ||
    ""
  );
  mergeMotifSuggestions(profileMotifs);

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

function parseMotifsList(value) {
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

function getSavedMotifs() {
  return JSON.parse(localStorage.getItem(getMotifsKey()) || "[]");
}

function saveMotifsList(list) {
  const unique = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
  localStorage.setItem(getMotifsKey(), JSON.stringify(unique));
}

function loadSavedMotifs() {
  mergeMotifSuggestions(getSavedMotifs());
}

function mergeMotifSuggestions(motifs) {
  const datalist = document.getElementById("motifSuggestions");
  if (!datalist) return;

  const current = [...datalist.querySelectorAll("option")].map((opt) => opt.value);
  const saved = getSavedMotifs();
  const merged = [...new Set([...current, ...saved, ...motifs].map((item) => String(item).trim()).filter(Boolean))];

  datalist.innerHTML = "";
  merged.forEach((motif) => {
    const option = document.createElement("option");
    option.value = motif;
    datalist.appendChild(option);
  });

  saveMotifsList(merged);
}

function memorizeMotif(motif) {
  const clean = String(motif || "").trim();
  if (!clean) return;

  const saved = getSavedMotifs();
  if (!saved.includes(clean)) {
    saved.unshift(clean);
    saveMotifsList(saved.slice(0, 100));
    mergeMotifSuggestions(saved.slice(0, 100));
  }
}

function getSavedDestinations() {
  return JSON.parse(localStorage.getItem(getDestinationsKey()) || "[]");
}

function saveDestinationsList(list) {
  const unique = [...new Set(list.map((item) => String(item).trim()).filter(Boolean))];
  localStorage.setItem(getDestinationsKey(), JSON.stringify(unique));
}

function loadSavedDestinations() {
  mergeDestinationSuggestions(getSavedDestinations());
}

function mergeDestinationSuggestions(destinations) {
  const datalist = document.getElementById("destinationSuggestions");
  if (!datalist) return;

  const current = [...datalist.querySelectorAll("option")].map((opt) => opt.value);
  const saved = getSavedDestinations();
  const merged = [...new Set([...current, ...saved, ...destinations].map((item) => String(item).trim()).filter(Boolean))];

  datalist.innerHTML = "";
  merged.forEach((destination) => {
    const option = document.createElement("option");
    option.value = destination;
    datalist.appendChild(option);
  });

  saveDestinationsList(merged);
}

function memorizeDestinations(destinations) {
  const cleanList = destinations.map((item) => String(item).trim()).filter(Boolean);
  if (!cleanList.length) return;

  const saved = getSavedDestinations();
  const merged = [...cleanList, ...saved];
  saveDestinationsList(merged.slice(0, 200));
  mergeDestinationSuggestions(merged.slice(0, 200));
}

function useServiceAddressAsDestination() {
  const serviceAddress = String(currentProfile?.serviceAddress || "").trim();

  if (!serviceAddress) {
    alert("Aucune adresse de service n’est enregistrée dans le profil.");
    return;
  }

  const destinationInputs = [...document.querySelectorAll(".destination-input")];
  const emptyInput = destinationInputs.find((input) => !input.value.trim());

  if (emptyInput) {
    emptyInput.value = serviceAddress;
    return;
  }

  addDestination(serviceAddress);
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
  document.getElementById("moisEtat")?.addEventListener("change", handleMonthChange);
  document.getElementById("dateTrajet")?.addEventListener("change", syncMonthFromDate);
  document.getElementById("motif")?.addEventListener("blur", () => {
    memorizeMotif(document.getElementById("motif")?.value || "");
  });

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
  // LOGO
document.getElementById("btnLogo")?.addEventListener("click", () => {
  document.getElementById("logoFile")?.click();
});

document.getElementById("logoFile")?.addEventListener("change", handleLogoChange);
document.getElementById("btnClearLogo")?.addEventListener("click", clearLogo);
}

function setDefaultMonthIfNeeded() {
  const moisInput = document.getElementById("moisEtat");
  if (!moisInput) return;

  if (!moisInput.value) {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    moisInput.value = `${year}-${month}`;
  }
}
function loadLogoInfo() {
  const logoData = localStorage.getItem(getLogoDataKey());
  const logoName = localStorage.getItem(getLogoNameKey()) || "";
  const info = document.getElementById("logoInfo");
  const preview = document.getElementById("logoPreview");

  if (!info || !preview) return;

  if (logoData) {
    info.textContent = logoName ? `Logo chargé : ${logoName}` : "Logo chargé";
    preview.src = logoData;
    preview.style.display = "block";
  } else {
    info.textContent = "";
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

function handleMonthChange() {
  saveMoisEtat();
  syncDateWithMonth(false);
}

function syncDateWithMonth(forceReplaceDay = false) {
  const moisEtat = document.getElementById("moisEtat")?.value || "";
  const dateInput = document.getElementById("dateTrajet");
  if (!moisEtat || !dateInput) return;

  const [year, month] = moisEtat.split("-");
  const currentDate = dateInput.value;

  if (!currentDate) {
    dateInput.value = `${year}-${month}-01`;
    return;
  }

  const [, currentMonth, currentDay] = currentDate.split("-");

  if (forceReplaceDay || currentMonth !== month) {
    const day = forceReplaceDay ? "01" : (currentDay || "01");
    dateInput.value = `${year}-${month}-${day}`;
  }
}

function syncMonthFromDate() {
  const dateValue = document.getElementById("dateTrajet")?.value || "";
  const moisInput = document.getElementById("moisEtat");
  if (!dateValue || !moisInput) return;

  moisInput.value = dateValue.slice(0, 7);
  saveMoisEtat();
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
    setDefaultMonthIfNeeded();
  }

  syncDateWithMonth(false);
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

  if (!container) {
    console.error("Container destinations introuvable");
    return;
  }

  const index = container.querySelectorAll(".dest-row").length + 1;

  const row = document.createElement("div");
  row.className = "dest-row";

  row.innerHTML = `
    <input
      type="text"
      class="destination-input"
      list="destinationSuggestions"
      placeholder="Destination ${index}"
      value="${escapeHtmlAttr(value)}"
    >

    <button type="button" class="btn btn-danger">
      Supprimer
    </button>
  `;

  container.appendChild(row);

  const input = row.querySelector(".destination-input");
  const btnDelete = row.querySelector(".btn-danger");

  if (input) {
    bindAutocomplete(input);
  }

  btnDelete.addEventListener("click", () => {
    row.remove();

    refreshDestinationPlaceholders();

    if (container.querySelectorAll(".dest-row").length === 0) {
      addDestination();
    }
  });
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

  if (checkbox.checked) {
    departInput.value = document.getElementById("domicile").value.trim();
  }

  departInput.disabled = false;
}

function syncDepartIfNeeded() {
  if (document.getElementById("departDomicile").checked) {
    document.getElementById("depart").value = document.getElementById("domicile").value.trim();
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
    .map((input) => input.value.trim())
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

async function ajouterDeplacement() {
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
  const retourDomicile = document.getElementById("retourDomicile").checked;
  const domicile = document.getElementById("domicile").value.trim();

  const destinations = [...document.querySelectorAll(".destination-input")]
    .map((input) => input.value.trim())
    .filter(Boolean);

  if (!enfant || !motif || !dateTrajet || !depart || destinations.length === 0) {
    alert("Merci de remplir les informations principales avant d'ajouter le déplacement.");
    return;
  }

  memorizeMotif(motif);
  memorizeDestinations(destinations);

  const lieuRdv = destinations.join(" / ");
  const lieuRetour = retourDomicile ? domicile : (destinations[destinations.length - 1] || "-");

  deplacements.push({
    id: Date.now(),
    enfant,
    motif,
    dateTrajet,
    heureDebut,
    heureFin,
    depart,
   professionnel: "",
    lieuRdv,
    lieuRetour,
    km: Number(totalDistanceKm.toFixed(1)),
    montant: Number(totalAmount.toFixed(2))
  });

  await saveDeplacements();
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
        <td colspan="10" class="empty-cell">Aucun déplacement enregistré</td>
      </tr>
    `;
    updateTotals();
    return;
  }

  const sorted = [...deplacements].sort(
  (a, b) => new Date(a.dateTrajet) - new Date(b.dateTrajet)
);

 for (const item of sorted) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td data-child>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.motif)}</td>
      <td>${formatDateFr(item.dateTrajet)}</td>
      <td>${escapeHtml(item.heureDebut || "-")}</td>
      <td>${escapeHtml(item.heureFin || "-")}</td>
      <td>${escapeHtml(item.depart)}</td>
      <td>${escapeHtml(item.lieuRdv)}</td>
      <td>${escapeHtml(item.lieuRetour || "-")}</td>
      <td>${item.km.toFixed(1).replace(".", ",")}</td>
      <td class="actions-cell">
  <button class="btn btn-primary btn-edit" data-id="${item.id}">
    Modifier
  </button>

  <button class="btn btn-danger table-action-btn" data-id="${item.id}">
    Supprimer
  </button>
</td>
    `;
    body.appendChild(tr);
}
if (typeof window.maskChildrenNames === "function") {
  window.maskChildrenNames();
}
  document.querySelectorAll(".table-action-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      supprimerDeplacement(Number(btn.dataset.id));
    });
  });
  document.querySelectorAll(".btn-edit").forEach((btn) => {
  btn.addEventListener("click", () => {
    modifierDeplacement(Number(btn.dataset.id));
  });
});

  updateTotals();
}


async function supprimerDeplacement(id) {
  deplacements = deplacements.filter((item) => item.id !== id);
  await saveDeplacements();
  renderDeplacements();
  showToast("Déplacement supprimé");
}

async function viderListe() {
  if (deplacements.length === 0) return;

  const ok = confirm("Voulez-vous vraiment vider toute la liste ?");
  if (!ok) return;

  deplacements = [];
  await saveDeplacements();
  renderDeplacements();
  showToast("Liste vidée");

}
async function handleLogoChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!(file.type && file.type.startsWith("image/"))) {
    alert("Merci de choisir une image pour le logo.");
    event.target.value = "";
    return;
  }

  try {
    const data = await fileToBase64(file);

    localStorage.setItem(getLogoDataKey(), data);
    localStorage.setItem(getLogoNameKey(), file.name);

    const preview = document.getElementById("logoPreview");
    const info = document.getElementById("logoInfo");

    if (preview) {
      preview.src = data;
      preview.style.display = "block";
    }

    if (info) {
      info.textContent = `Logo chargé : ${file.name}`;
    }

    showToast("Logo enregistré");
  } catch (error) {
    console.error("Erreur lecture logo :", error);
    alert("Impossible de lire le logo.");
  } finally {
    event.target.value = "";
  }
}
function modifierDeplacement(id) {
  const item = deplacements.find((d) => d.id === id);

  if (!item) return;

  document.getElementById("enfant").value = item.enfant || "";
  document.getElementById("motif").value = item.motif || "";
  document.getElementById("dateTrajet").value = item.dateTrajet || "";
  document.getElementById("heureDebut").value = item.heureDebut || "";
  document.getElementById("heureFin").value = item.heureFin || "";
  document.getElementById("depart").value = item.depart || "";

  document.getElementById("destinations").innerHTML = "";

  const destinations = item.lieuRdv.split("/");

  destinations.forEach((dest) => {
    addDestination(dest.trim());
  });

  totalDistanceKm = item.km || 0;
  totalAmount = item.montant || 0;

  document.getElementById("distanceTotale").textContent =
    totalDistanceKm.toFixed(1).replace(".", ",") + " km";

  document.getElementById("montantTotal").textContent =
    totalAmount.toFixed(2).replace(".", ",") + " €";

  deplacements = deplacements.filter((d) => d.id !== id);

  saveDeplacements();

  renderDeplacements();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });

  showToast("Déplacement chargé pour modification");
}

function clearLogo() {
  localStorage.removeItem(getLogoDataKey());
  localStorage.removeItem(getLogoNameKey());

  const preview = document.getElementById("logoPreview");
  const info = document.getElementById("logoInfo");

  if (preview) {
    preview.removeAttribute("src");
    preview.style.display = "none";
  }

  if (info) {
    info.textContent = "";
  }

  showToast("Logo supprimé");
}

async function saveDeplacements() {
  await saveModuleData(currentUid, "kilometrique", {
    deplacements
  });
}

function getLogoDataKey() {
  return `logoKilometriqueData_${getUid()}`;
}

function getLogoNameKey() {
  return `logoKilometriqueName_${getUid()}`;
}
function updateTotals() {
  const totalKm = deplacements.reduce((sum, item) => sum + item.km, 0);
  const totalMontant = deplacements.reduce((sum, item) => sum + item.montant, 0);

  document.getElementById("totalKmMois").textContent =
    totalKm.toFixed(1).replace(".", ",") + " km";

  document.getElementById("totalMontantMois").textContent =
    totalMontant.toFixed(2).replace(".", ",") + " €";
}

function addEasyfraisFooter(docPdf) {
  const pageHeight = docPdf.internal.pageSize.getHeight();
  const margin = 10;

  docPdf.setFont("helvetica", "italic");
  docPdf.setFontSize(8);
  docPdf.setTextColor(130, 130, 130);

  docPdf.text(
    "Document généré automatiquement par easyfrais.fr",
    margin,
    pageHeight - 6
  );

  docPdf.setTextColor(0, 0, 0);
}

function drawKmModel(pdf, background, items, month, assistant, signature, rates, date) {
  const cols = [10.43,66.12,117.14,133.66,151.02,168.38,212.26,256.14,279.64];
  const rows = [];
  pdf.setFont("helvetica","normal"); pdf.setFontSize(8);
  for (const item of items) {
    const destination = [item.lieuRdv, item.lieuRetour ? `Retour : ${item.lieuRetour}` : ""].filter(Boolean).join(" - ");
    const values = [item.enfant,item.motif,formatDateFr(item.dateTrajet),item.heureDebut,item.heureFin,item.depart,destination];
    const lines = values.map((v,i)=>pdf.splitTextToSize(String(v || "-"),cols[i+1]-cols[i]-2));
    for(let line=0;line<Math.max(...lines.map(x=>x.length));line++) rows.push({values:lines.map(x=>x[line]||""),km:line===0?Number(item.km):null});
  }
  function fill(value,x,y,w) {
    pdf.setFillColor(255,255,255);pdf.rect(x,y-3.5,w,4.5,"F");
    pdf.setFont("helvetica","normal");pdf.setFontSize(9);
    pdf.setFontSize(Math.min(9,9*w/Math.max(w,pdf.getTextWidth(value))));pdf.text(value,x,y);
  }
  for(let offset=0;offset<rows.length;offset+=14) {
    if(offset)pdf.addPage("a4","landscape");
    pdf.addImage(background,"PNG",0,0,297,210,"km-modele","FAST");
    fill(formatMonthFr(month),143,14.4,123);
    fill(assistant,137,21.7,129);
    let km=0;
    rows.slice(offset,offset+14).forEach((row,i)=>{
      const y=37.35+i*(89.99/14)+4;
      pdf.setFont("helvetica","normal");pdf.setFontSize(8);
      row.values.forEach((v,c)=>pdf.text(v,cols[c]+1,y));
      if(row.km!==null){km+=row.km;pdf.text(row.km.toFixed(1).replace('.',','),278,y,{align:'right'});}
    });
    fill(km.toFixed(1).replace('.',','),257,131.8,21);
    fill(date,34,144.5,34);
    if(signature){const r=Math.min(75/signature.width,30/signature.height);pdf.addImage(signature.dataUrl,'JPEG',12,156,signature.width*r,signature.height*r);}
    const rateEdges = [152.92,157.45,161.52,166.68,171.85,176.76];
    for(let cv=3;cv<=7;cv++) {
      const rate=Number(rates[cv]);
      if(Number.isFinite(rate)) {
        const top=rateEdges[cv-3],bottom=rateEdges[cv-2];
        pdf.setFillColor(255,255,255);pdf.rect(133.8,top+.25,33.8,bottom-top-.6,'F');
        pdf.setFont('helvetica','normal');pdf.setFontSize(7);
        pdf.text(`d x ${rate.toFixed(3).replace('.',',')} €`,150.7,(top+bottom)/2+.8,{align:'center'});
      }
    }
  }
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
  const totalMontantEstime = deplacements.reduce((sum, item) => sum + item.montant, 0);
  const baremes = getBaremesFromInputs();
  const dateCreationPdf = new Date().toLocaleDateString("fr-FR");
  const logoData =
  await getDownloadURL(ref(storage, `users/${currentUid}/profileLogoData_${currentUid}`)).catch(() =>
    localStorage.getItem(getLogoDataKey())
  );

const signatureData =
  await getDownloadURL(ref(storage, `users/${currentUid}/profileSignatureData_${currentUid}`)).catch(() =>
    localStorage.getItem(getSignatureDataKey())
  );

const carteGriseData =
  await getDownloadURL(ref(storage, `users/${currentUid}/profileCarteGriseData_${currentUid}`)).catch(() =>
    localStorage.getItem(getCarteGriseDataKey())
  );

  let signature = null;
  if (signatureData && (isImageDataUrl(signatureData) || signatureData.startsWith("http"))) {
    try {
      signature = await convertImageDataUrlToJpeg(signatureData, 0.92);
    } catch (error) {
      console.error("Erreur signature PDF :", error);
      alert("Impossible de charger la signature. Vérifiez votre connexion puis réessayez.");
      return;
    }
  }
  const background = "data:image/png;base64,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";
  const sortedPdf = [...deplacements].sort((a,b)=>new Date(a.dateTrajet)-new Date(b.dateTrajet));
  drawKmModel(docPdf, background, sortedPdf, moisEtat, assistantNom, signature, baremes, dateCreationPdf);

  if (
  carteGriseData &&
  (
    isImageDataUrl(carteGriseData) ||
    carteGriseData.startsWith("http")
  )
) {
    try {
      const convertedCarte = await convertImageDataUrlToJpeg(carteGriseData, 0.92);

      docPdf.addPage("a4", "landscape");


      const pageW = docPdf.internal.pageSize.getWidth();
      const pageH = docPdf.internal.pageSize.getHeight();

      const topMargin = 12;
      const sideMargin = 10;
      const bottomMargin = 10;

      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(12);
      docPdf.text("Carte grise du véhicule", sideMargin, topMargin);

      const availableWidth = pageW - sideMargin * 2;
      const availableHeight = pageH - topMargin - bottomMargin - 10;

      let imgWidth = convertedCarte.width;
      let imgHeight = convertedCarte.height;

      const widthRatio = availableWidth / imgWidth;
      const heightRatio = availableHeight / imgHeight;
      const scale = Math.min(widthRatio, heightRatio, 1);

      imgWidth = imgWidth * scale;
      imgHeight = imgHeight * scale;

      const x = (pageW - imgWidth) / 2;
      const yCarte = topMargin + 6 + ((availableHeight - imgHeight) / 2);

      docPdf.addImage(
        convertedCarte.dataUrl,
        "JPEG",
        x,
        yCarte,
        imgWidth,
        imgHeight
      );
    } catch (error) {
      console.error("Erreur ajout carte grise PDF :", error);
    }
  }

const fileName = generateFileName("Frais_kilometriques", moisEtat, assistantNom);



try {
  await savePdfToHistory(docPdf, {
    mois: formatMonthLabel(moisEtat),
    nom: fileName,
    type: "Frais kilométriques"
  });
} catch (error) {
  console.error("Erreur enregistrement historique :", error);
}


// Télécharger aussi sur l'ordinateur
docPdf.save(fileName);

showToast("PDF généré et enregistré dans l'historique");

}

function drawCellText(docPdf, textOrLines, x, y, width, height, align = "left") {
  const lines = Array.isArray(textOrLines) ? textOrLines : [String(textOrLines)];
  const fontSize = docPdf.getFontSize();
  const lineGap = fontSize * 0.35;
  const totalTextHeight = lines.length * lineGap;
  let currentY = y + (height - totalTextHeight) / 2 + 2.2;

  lines.forEach((line) => {
    let textX = x + 1.3;

    if (align === "center") {
      textX = x + width / 2;
      docPdf.text(line, textX, currentY, { align: "center" });
    } else if (align === "right") {
      textX = x + width - 1.3;
      docPdf.text(line, textX, currentY, { align: "right" });
    } else {
      docPdf.text(line, textX, currentY);
    }

    currentY += lineGap;
  });
}

function calculBareme(distanceKm, cv) {
  const baremes = getBaremesFromInputs();
  const puissance = Math.min(cv, 7);
  const bareme = baremes[puissance] || baremes[7] || DEFAULT_BAREMES[7];
  return distanceKm * bareme;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

function formatDateFr(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatMonthFr(monthStr) {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  return `${months[Number(month) - 1]} ${year}`;
}

function safeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resetForm() {
  document.getElementById("dateTrajet").value = "";
  document.getElementById("enfant").value = "";
  document.getElementById("motif").value = "";
  document.getElementById("heureDebut").value = "";
  document.getElementById("heureFin").value = "";
  document.getElementById("departDomicile").checked = true;
  document.getElementById("retourDomicile").checked = true;
  document.getElementById("cv").value = "7";

  syncDepartIfNeeded();

  document.getElementById("destinations").innerHTML = "";
  addDestination();

  totalDistanceKm = 0;
  totalDurationSeconds = 0;
  totalAmount = 0;

  document.getElementById("distanceTotale").textContent = "0 km";
  document.getElementById("tempsTotal").textContent = "0 min";
  document.getElementById("montantTotal").textContent = "0,00 €";

  if (directionsRenderer) {
    directionsRenderer.set("directions", null);
  }
}

function resetFormAfterAdd() {
  document.getElementById("enfant").value = "";
  document.getElementById("motif").value = "";
  document.getElementById("heureDebut").value = "";
  document.getElementById("heureFin").value = "";
  document.getElementById("departDomicile").checked = true;
  document.getElementById("retourDomicile").checked = true;

  syncDepartIfNeeded();
  syncDateWithMonth(false);

  document.getElementById("destinations").innerHTML = "";
  addDestination();

  totalDistanceKm = 0;
  totalDurationSeconds = 0;
  totalAmount = 0;

  document.getElementById("distanceTotale").textContent = "0 km";
  document.getElementById("tempsTotal").textContent = "0 min";
  document.getElementById("montantTotal").textContent = "0,00 €";

  if (directionsRenderer) {
    directionsRenderer.set("directions", null);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
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

function escapeHtmlAttr(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function isImageDataUrl(data) {
  return typeof data === "string" && data.startsWith("data:image/");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Lecture du fichier impossible"));

    reader.readAsDataURL(file);
  });
}

async function convertImageDataUrlToJpeg(dataUrl, quality = 0.92) {
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

function loadSignatureInfo() {
  const signatureData = localStorage.getItem(getSignatureDataKey());
  const signatureName = localStorage.getItem(getSignatureNameKey()) || "";
  const info = document.getElementById("signatureInfo");
  const preview = document.getElementById("signaturePreview");

  if (!info || !preview) return;

  if (signatureData) {
    info.textContent = signatureName ? `Signature enregistrée : ${signatureName}` : "Signature enregistrée";
    preview.src = signatureData;
    preview.style.display = "block";
  } else {
    info.textContent = "";
    preview.src = "";
    preview.style.display = "none";
  }
}

async function handleSignatureChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!(file.type && file.type.startsWith("image/"))) {
    alert("Merci de choisir une image JPG ou PNG pour la signature.");
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
    console.error("Erreur lecture signature :", error);
    alert("Impossible de lire l'image de signature.");
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

function loadCarteGriseInfo() {
  const carteData = localStorage.getItem(getCarteGriseDataKey());
  const carteName = localStorage.getItem(getCarteGriseNameKey()) || "";
  const info = document.getElementById("carteGriseInfo");
  const preview = document.getElementById("carteGrisePreview");

  if (!info || !preview) return;

  if (carteData) {
    info.textContent = carteName ? `Carte grise enregistrée : ${carteName}` : "Carte grise enregistrée";

    if (isImageDataUrl(carteData)) {
      preview.src = carteData;
      preview.style.display = "block";
    } else {
      preview.removeAttribute("src");
      preview.style.display = "none";
    }
  } else {
    info.textContent = "";
    preview.removeAttribute("src");
    preview.style.display = "none";
  }
}

async function handleCarteGriseChange(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
  
    const maxSizeMo = 3;
    const maxSizeBytes = maxSizeMo * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      alert(`Le fichier est trop volumineux. Choisis un fichier de moins de ${maxSizeMo} Mo.`);
      event.target.value = "";
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (!isImage && !isPdf) {
      alert("Merci d'importer une image ou un PDF.");
      event.target.value = "";
      return;
    }

    const data = await fileToBase64(file);

    localStorage.setItem(getCarteGriseDataKey(), data);
    localStorage.setItem(getCarteGriseNameKey(), file.name);

    loadCarteGriseInfo();
    showToast("Carte grise enregistrée");
  } catch (error) {
    console.error("Erreur lecture carte grise :", error);
    alert("Impossible d'importer la carte grise. Essaie avec une image JPG/PNG plus légère.");
  } finally {
    event.target.value = "";
  }
}

function clearCarteGrise() {
  localStorage.removeItem(getCarteGriseDataKey());
  localStorage.removeItem(getCarteGriseNameKey());
  loadCarteGriseInfo();
  showToast("Carte grise supprimée");
}