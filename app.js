function setActiveMenu() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".main-nav a").forEach((link) => {
    if (link.getAttribute("href") === currentPage) {
      link.classList.add("active");
    }
  });
}

function showMessage(target, message, type) {
  if (!target) return;
  target.className = `message ${type}`;
  target.textContent = message;
  target.style.display = "block";
}

function clearMessage(target) {
  if (!target) return;
  target.className = "message";
  target.textContent = "";
  target.style.display = "none";
}

function calculFraisKm(totalKm, cv) {
  totalKm = Number(totalKm);
  cv = Number(cv);

  if (isNaN(totalKm) || isNaN(cv) || totalKm < 0 || cv < 1) return 0;

  let tarifParKm = 0.50;
  if (cv <= 4) tarifParKm = 0.52;
  else if (cv <= 6) tarifParKm = 0.58;
  else tarifParKm = 0.65;

  return totalKm * tarifParKm;
}

async function getDistanceKm(origin, destination) {
  if (!origin || !destination) return 0;

  if (!window.google || !google.maps) {
    throw new Error("Google Maps n'est pas chargé.");
  }

  const { RouteMatrix } = await google.maps.importLibrary("routes");

  const result = await RouteMatrix.computeRouteMatrix({
    origins: [origin],
    destinations: [destination],
    travelMode: "DRIVING",
    fields: ["distanceMeters", "condition"]
  });

  const item = result?.matrix?.rows?.[0]?.items?.[0];

  if (!item || item.condition !== "ROUTE_EXISTS" || typeof item.distanceMeters !== "number") {
    throw new Error(`Impossible de calculer le trajet entre "${origin}" et "${destination}".`);
  }

  return item.distanceMeters / 1000;
}

function initKilometriquePage() {
  const page = document.getElementById("page-frais-km");
  if (!page) return;

  const destinationsContainer = document.getElementById("destinationsContainer");
  const totalKmSpan = document.getElementById("totalKm");
  const montantEstimeSpan = document.getElementById("montantEstime");
  const cvInput = document.getElementById("cv");
  const domicileInput = document.getElementById("domicile");
  const retourDomicileInput = document.getElementById("retourDomicile");
  const resultat = document.getElementById("resultat");
  const btnAddDestination = document.getElementById("btnAddDestination");
  const btnGeneratePdf = document.getElementById("btnGeneratePdf");

  function saveDomicile() {
    localStorage.setItem("domicile", domicileInput.value.trim());
  }

  function loadDomicile() {
    const domicile = localStorage.getItem("domicile");
    if (domicile) domicileInput.value = domicile;
  }

  function refreshDestinationTitles() {
    const items = document.querySelectorAll(".destination-item");
    items.forEach((item, index) => {
      const title = item.querySelector(".destination-title");
      if (title) title.textContent = `Destination ${index + 1}`;
    });
  }

  function getDestinationInputs() {
    return Array.from(document.querySelectorAll(".destination-item"));
  }

  async function updateSummary() {
    try {
      clearMessage(resultat);

      const domicile = domicileInput.value.trim();
      const items = getDestinationInputs();

      if (!domicile) {
        totalKmSpan.textContent = "0.0";
        montantEstimeSpan.textContent = "0.00";
        return;
      }

      let totalKm = 0;
      let depart = domicile;

      for (const item of items) {
        const inputAdresse = item.querySelector(".destination-adresse");
        const kmDisplay = item.querySelector(".destination-km-display");
        const adresse = inputAdresse.value.trim();

        if (!adresse) {
          kmDisplay.value = "";
          continue;
        }

        kmDisplay.value = "Calcul...";
        const km = await getDistanceKm(depart, adresse);
        totalKm += km;
        kmDisplay.value = `${km.toFixed(1)} km`;
        depart = adresse;
      }

      if (retourDomicileInput.checked && depart && depart !== domicile) {
        const kmRetour = await getDistanceKm(depart, domicile);
        totalKm += kmRetour;
      }

      const montant = calculFraisKm(totalKm, cvInput.value);
      totalKmSpan.textContent = totalKm.toFixed(1);
      montantEstimeSpan.textContent = montant.toFixed(2);
    } catch (error) {
      console.error(error);
      showMessage(resultat, error.message || "Erreur lors du calcul Google Maps.", "error");
      totalKmSpan.textContent = "0.0";
      montantEstimeSpan.textContent = "0.00";
    }
  }

  function createDestinationItem() {
    const div = document.createElement("div");
    div.className = "destination-item";
    div.innerHTML = `
      <div class="destination-top">
        <strong class="destination-title">Destination</strong>
        <button type="button" class="remove-btn">Supprimer</button>
      </div>
      <div class="destination-grid">
        <div>
          <label>Adresse destination</label>
          <input type="text" class="destination-adresse" placeholder="Ex : Rouen" />
        </div>
        <div>
          <label>Distance calculée</label>
          <input type="text" class="destination-km-display" value="" placeholder="Automatique" disabled />
        </div>
      </div>
    `;

    const removeBtn = div.querySelector(".remove-btn");
    const adresseInput = div.querySelector(".destination-adresse");

    removeBtn.addEventListener("click", async () => {
      div.remove();
      refreshDestinationTitles();
      await updateSummary();
    });

    adresseInput.addEventListener("change", updateSummary);
    adresseInput.addEventListener("blur", updateSummary);

    destinationsContainer.appendChild(div);
    refreshDestinationTitles();
  }

  btnAddDestination.addEventListener("click", createDestinationItem);

  btnGeneratePdf.addEventListener("click", () => {
    clearMessage(resultat);
    showMessage(
      resultat,
      "Le calcul fonctionne. La génération PDF et l’envoi Yooz pourront être rebranchés ensuite.",
      "success"
    );
  });

  cvInput.addEventListener("input", updateSummary);
  retourDomicileInput.addEventListener("change", updateSummary);
  domicileInput.addEventListener("input", saveDomicile);
  domicileInput.addEventListener("change", updateSummary);
  domicileInput.addEventListener("blur", updateSummary);

  loadDomicile();
  createDestinationItem();
}

function initSimpleForms() {
  document.querySelectorAll(".simple-form").forEach((form) => {
    const resultBox = form.querySelector(".message");
    const resetBtn = form.querySelector(".btn-reset");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      showMessage(resultBox, "Formulaire enregistré visuellement.", "success");
    });

    resetBtn?.addEventListener("click", () => {
      form.reset();
      clearMessage(resultBox);
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveMenu();
  initKilometriquePage();
  initSimpleForms();
});