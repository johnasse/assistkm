(function () {
  function waitForJsPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.API) {
      setTimeout(waitForJsPDF, 150);
      return;
    }

    patchJsPDFSave();
  }

  function getCurrentMonthLabel() {
    const monthInputIds = [
      "moisAutres",
      "moisParking",
      "moisLoisirs",
      "moisScolaire",
      "moisNoel",
      "moisFormation",
      "moisKilometrique"
    ];

    for (const id of monthInputIds) {
      const el = document.getElementById(id);
      if (el && el.value) {
        return formatMonthFr(el.value);
      }
    }

    const yearInput = document.getElementById("anneeFiscale");
    if (yearInput && yearInput.value) {
      return yearInput.value;
    }

    const now = new Date();
    return now.toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric"
    });
  }

  function formatMonthFr(value) {
    if (!value) return "-";

    if (/^\d{4}$/.test(value)) {
      return value;
    }

    const match = String(value).match(/^(\d{4})-(\d{2})$/);
    if (!match) return value;

    const [, year, month] = match;
    const months = [
      "janvier", "février", "mars", "avril", "mai", "juin",
      "juillet", "août", "septembre", "octobre", "novembre", "décembre"
    ];

    return `${months[Number(month) - 1]} ${year}`;
  }

  function getDocumentTypeFromFilename(filename) {
    const nom = String(filename || "").toLowerCase();

    if (nom.includes("abattement")) return "Abattement fiscal";
    if (nom.includes("parking")) return "Frais de parking";
    if (nom.includes("loisir") || nom.includes("sports")) return "Sports et loisirs";
    if (nom.includes("scolaire")) return "Frais scolaires";
    if (nom.includes("noel")) return "Frais de Noël";
    if (nom.includes("formation")) return "Frais formation";
    if (nom.includes("autres")) return "Autres frais";
    if (nom.includes("kilomet") || nom.includes("deplacement")) return "Frais kilométriques";

    return "Non classé";
  }

  function savePdfToHistory(doc, filename) {
    try {
      const historique = JSON.parse(localStorage.getItem("historiquePDF") || "[]");

      const item = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        mois: getCurrentMonthLabel(),
        nom: filename || "document.pdf",
        data: doc.output("datauristring"),
        dateGeneration: new Date().toLocaleString("fr-FR"),
        type: getDocumentTypeFromFilename(filename)
      };

      historique.push(item);
      localStorage.setItem("historiquePDF", JSON.stringify(historique));
    } catch (error) {
      console.error("Erreur lors de l'enregistrement dans l'historique :", error);
    }
  }

  function patchJsPDFSave() {
    const jsPDF = window.jspdf.jsPDF;

    if (jsPDF.API.__historyPatched) {
      return;
    }

    const originalSave = jsPDF.API.save;

    jsPDF.API.save = function (filename, options) {
      try {
        savePdfToHistory(this, filename);
      } catch (error) {
        console.error("Erreur interception save PDF :", error);
      }

      return originalSave.call(this, filename, options);
    };

    jsPDF.API.__historyPatched = true;
  }

  waitForJsPDF();
})();
