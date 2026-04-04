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
  syncDateWithMonth(true);
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
  const index = container.querySelectorAll(".dest-row").length + 1;

  const row = document.createElement("div");
  row.className = "dest-row";
  row.innerHTML = `
    <input type="text" class="destination-input" list="destinationSuggestions" placeholder="Destination ${index}" value="${escapeHtmlAttr(value)}">
    <button type="button" class="btn btn-danger">Supprimer</button>
  `;

  container.appendChild(row);

  const input = row.querySelector(".destination-input");
  const btnDelete = row.querySelector(".btn-danger");

  bindAutocomplete(input);

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
    professionnel: document.getElementById("professionnel").value.trim(),
    lieuRdv,
    lieuRetour,
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
        <td colspan="10" class="empty-cell">Aucun déplacement enregistré</td>
      </tr>
    `;
    updateTotals();
    return;
  }

 for (const item of deplacements) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(item.enfant)}</td>
      <td>${escapeHtml(item.motif)}</td>
      <td>${formatDateFr(item.dateTrajet)}</td>
      <td>${escapeHtml(item.heureDebut || "-")}</td>
      <td>${escapeHtml(item.heureFin || "-")}</td>
      <td>${escapeHtml(item.depart)}</td>
      <td>${escapeHtml(item.lieuRdv)}</td>
      <td>${escapeHtml(item.lieuRetour || "-")}</td>
      <td>${item.km.toFixed(1).replace(".", ",")}</td>
      <td><button class="btn btn-danger table-action-btn" data-id="${item.id}">Supprimer</button></td>
    `;
    body.appendChild(tr);
}

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

function saveDeplacements() {
  localStorage.setItem(getDeplacementsKey(), JSON.stringify(deplacements));
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
  const signatureData = localStorage.getItem(getSignatureDataKey());
  const carteGriseData = localStorage.getItem(getCarteGriseDataKey());
  const logoData = localStorage.getItem(getLogoDataKey());

  const margin = 10;
  const pageWidth = docPdf.internal.pageSize.getWidth();
  let y = 14;

  async function drawLogo() {
    if (!logoData || !isImageDataUrl(logoData)) return;

    try {
      const convertedLogo = await convertImageDataUrlToJpeg(logoData, 0.92);

      const maxLogoWidth = 30;
      const maxLogoHeight = 18;

      let logoWidth = convertedLogo.width;
      let logoHeight = convertedLogo.height;

      const ratio = Math.min(maxLogoWidth / logoWidth, maxLogoHeight / logoHeight);
      logoWidth *= ratio;
      logoHeight *= ratio;

      const logoX = pageWidth - logoWidth - 10;
      const logoY = 8;

      docPdf.addImage(
        convertedLogo.dataUrl,
        "JPEG",
        logoX,
        logoY,
        logoWidth,
        logoHeight
      );
    } catch (error) {
      console.error("Erreur ajout logo PDF :", error);
    }
  }

  async function drawPageHeader() {
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(13);
    docPdf.text(
      `ETAT DE FRAIS DE DEPLACEMENTS DU MOIS DE : ${formatMonthFr(moisEtat)}`,
      margin,
      y
    );

    await drawLogo();

    y += 8;
    docPdf.setFont("helvetica", "normal");
    docPdf.setFontSize(10.5);
    docPdf.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

    y += 8;
  }

  const cols = [
    { key: "enfant", title: "Enfant", width: 25, align: "left" },
    { key: "motif", title: "Motif", width: 30, align: "left" },
    { key: "dateTrajet", title: "Date", width: 18, align: "center" },
    { key: "heureDebut", title: "H. début", width: 14, align: "center" },
    { key: "heureFin", title: "H. fin", width: 14, align: "center" },
    { key: "depart", title: "Lieu départ", width: 42, align: "left" },
    { key: "lieuRdv", title: "Lieu RDV", width: 42, align: "left" },
    { key: "lieuRetour", title: "Lieu retour", width: 42, align: "left" },
    { key: "km", title: "KM A/R", width: 16, align: "right" }
  ];

  const headerHeight = 9;
  const lineHeight = 4.2;

  function drawHeader() {
    let x = margin;
    docPdf.setFont("helvetica", "bold");
    docPdf.setFontSize(8.8);

    cols.forEach((col) => {
      docPdf.rect(x, y, col.width, headerHeight);
      drawCellText(docPdf, col.title, x, y, col.width, headerHeight, "center");
      x += col.width;
    });

    y += headerHeight;
  }

  await drawPageHeader();
  drawHeader();
  addEasyfraisFooter(docPdf);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8.4);

for (const item of deplacements) {
    const rowValues = [
      safeText(item.enfant),
      safeText(item.motif),
      formatDateFr(item.dateTrajet),
      item.heureDebut || "-",
      item.heureFin || "-",
      safeText(item.depart),
      safeText(item.lieuRdv),
      safeText(item.lieuRetour || "-"),
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

      return docPdf.splitTextToSize(String(value), col.width - 2.5);
    });

    const maxLines = Math.max(...rowLines.map((lines) => lines.length));
    const rowHeight = Math.max(8, maxLines * lineHeight + 2);

    if (y + rowHeight > 132) {
      docPdf.addPage("landscape", "a4");
      addEasyfraisFooter(docPdf);
      y = 14;
      addEasyfraisFooter(docPdf);

      docPdf.setFont("helvetica", "bold");
      docPdf.setFontSize(13);
      docPdf.text(
        `ETAT DE FRAIS DE DEPLACEMENTS DU MOIS DE : ${formatMonthFr(moisEtat)}`,
        margin,
        y
      );

      if (logoData && isImageDataUrl(logoData)) {
        try {
          const convertedLogo = await convertImageDataUrlToJpeg(logoData, 0.92);

          const maxLogoWidth = 30;
          const maxLogoHeight = 18;

          let logoWidth = convertedLogo.width;
          let logoHeight = convertedLogo.height;

          const ratio = Math.min(maxLogoWidth / logoWidth, maxLogoHeight / logoHeight);
          logoWidth *= ratio;
          logoHeight *= ratio;

          const logoX = pageWidth - logoWidth - 10;
          const logoY = 8;

          docPdf.addImage(
            convertedLogo.dataUrl,
            "JPEG",
            logoX,
            logoY,
            logoWidth,
            logoHeight
          );
        } catch (error) {
          console.error("Erreur ajout logo PDF :", error);
        }
      }

      y += 8;
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(10.5);
      docPdf.text(`Nom et prénom de l'assistant familial : ${assistantNom}`, margin, y);

      y += 8;
      drawHeader();
      docPdf.setFont("helvetica", "normal");
      docPdf.setFontSize(8.4);
    }

    let x = margin;

    rowValues.forEach((value, i) => {
      const col = cols[i];
      docPdf.rect(x, y, col.width, rowHeight);
      drawCellText(docPdf, rowLines[i], x, y, col.width, rowHeight, col.align);
      x += col.width;
    });

    y += rowHeight;
 }

  y += 8;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  docPdf.text(`Total kilomètres : ${totalKm.toFixed(1).replace(".", ",")} km`, margin, y);

  y += 6;
  docPdf.text(`Montant estimé : ${totalMontantEstime.toFixed(2).replace(".", ",")} €`, margin, y);

  y += 10;
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9.5);
  docPdf.text(`PDF créé le ${dateCreationPdf}`, margin, y);
  y += 10;
docPdf.setFont("helvetica", "normal");
docPdf.setFontSize(10);
docPdf.text("Certifié exact le : " + dateCreationPdf, margin, y);

y += 10;

docPdf.setFont("helvetica", "normal");
docPdf.setFontSize(10);

y += 10;
docPdf.text("Signature assistant familial :", margin, y);

// Signature à côté du texte
if (signatureData && isImageDataUrl(signatureData)) {
  try {
    const convertedSignature = await convertImageDataUrlToJpeg(signatureData, 0.10);

    docPdf.addImage(
      convertedSignature.dataUrl,
      "JPEG",
      margin + 65,   // position X
      y - 6,         // position Y
      40,
      12
    );
  } catch (error) {
    console.error("Erreur ajout signature PDF :", error);
  }
}

y += 20; // espace avant les barèmes



  const baremeX = 12;
  let yBareme = 154;

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  docPdf.text("Barèmes utilisés :", baremeX, yBareme);

  yBareme += 6;
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9.5);
  docPdf.text(`3 CV : d x ${baremes[3].toFixed(3)} €`, baremeX, yBareme);
  yBareme += 5.5;
  docPdf.text(`4 CV : d x ${baremes[4].toFixed(3)} €`, baremeX, yBareme);
  yBareme += 5.5;
  docPdf.text(`5 CV : d x ${baremes[5].toFixed(3)} €`, baremeX, yBareme);
  yBareme += 5.5;
  docPdf.text(`6 CV : d x ${baremes[6].toFixed(3)} €`, baremeX, yBareme);
  yBareme += 5.5;
  docPdf.text(`7 CV et plus : d x ${baremes[7].toFixed(3)} €`, baremeX, yBareme);

  const cadreX = 112;
  const cadreY = 143;
  const cadreW = pageWidth - cadreX - 10;
  const cadreH = 62;

  docPdf.setDrawColor(0, 0, 0);
  docPdf.setLineWidth(0.10);
  docPdf.rect(cadreX, cadreY, cadreW, cadreH);

  docPdf.setFillColor(210, 228, 245);
  docPdf.rect(cadreX, cadreY, cadreW, 16, "F");

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(10);
  docPdf.setTextColor(0, 0, 0);
  docPdf.text("Cadre réservé à la comptabilité", cadreX + cadreW / 2, cadreY + 6.5, {
    align: "center"
  });

  docPdf.setFontSize(8.5);
  docPdf.setTextColor(200, 0, 0);
  docPdf.text("(ne rien inscrire)", cadreX + cadreW / 2, cadreY + 11.5, {
    align: "center"
  });

  docPdf.setTextColor(0, 0, 0);
  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(9);
  docPdf.text("............................ Kms x ........................ = ........................ €", cadreX + 40, cadreY + 24);

  docPdf.line(cadreX, cadreY + 28, cadreX + cadreW, cadreY + 28);

  docPdf.setFont("helvetica", "bold");
  docPdf.setFontSize(9.5);
  docPdf.text("BON A PAYER", cadreX + cadreW / 2, cadreY + 33, {
    align: "center"
  });

  docPdf.line(cadreX, cadreY + 36, cadreX + cadreW, cadreY + 36);

  docPdf.setFont("helvetica", "normal");
  docPdf.setFontSize(8.5);

  const leftPad = cadreX + 3;
  docPdf.text("Date : ................................................................................................", leftPad, cadreY + 42);
  docPdf.text("Nom du responsable : ........................................................................", leftPad, cadreY + 48);
  docPdf.text("Imputation analytique : .....................................................................", leftPad, cadreY + 54);
  docPdf.text("Signature : .........................................................................................", leftPad, cadreY + 60);



  if (carteGriseData && isImageDataUrl(carteGriseData)) {
    try {
      const convertedCarte = await convertImageDataUrlToJpeg(carteGriseData, 0.92);

      docPdf.addPage("landscape", "a4");
      addEasyfraisFooter(docPdf);

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

  const fileName = `etat_frais_kilometriques_${moisEtat || "mois"}.pdf`;

addEasyfraisFooter(docPdf);

try {
  await savePdfToHistory(docPdf, {
    mois: formatMonthLabel(moisEtat),
    nom: fileName,
    type: "Frais kilométriques"
  });
} catch (error) {
  console.error("Erreur enregistrement historique :", error);
}

const filename = `kilometrique_${moisEtat}.pdf`;

// Convertir PDF en blob
const pdfBlob = docPdf.output("blob");

// Enregistrer dans Firebase + Historique
await savePdfToHistory({
  fileName: filename,
  blob: pdfBlob,
  type: "Kilométrique",
  mois: formatMonthLabel(moisEtat)
});

// Télécharger aussi sur l'ordinateur
docPdf.save(filename);

showToast("PDF généré et enregistré dans l'historique");
showToast("PDF mensuel généré et enregistré dans l'historique");
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
  document.getElementById("professionnel").value = "";
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
  document.getElementById("dateTrajet").value = "";
  document.getElementById("enfant").value = "";
  document.getElementById("professionnel").value = "";
  document.getElementById("motif").value = "";
  document.getElementById("heureDebut").value = "";
  document.getElementById("heureFin").value = "";
  document.getElementById("departDomicile").checked = true;
  document.getElementById("retourDomicile").checked = true;

  syncDepartIfNeeded();
  syncDateWithMonth(true);

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