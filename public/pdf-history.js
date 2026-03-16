export function formatMonthLabel(value) {
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

export function savePdfToHistory(doc, options = {}) {
  try {
    const historique = JSON.parse(localStorage.getItem("historiquePDF") || "[]");

    const item = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      mois: options.mois || "-",
      nom: options.nom || "document.pdf",
      data: doc.output("datauristring"),
      dateGeneration: new Date().toLocaleString("fr-FR"),
      type: options.type || "Non classé"
    };

    historique.push(item);
    localStorage.setItem("historiquePDF", JSON.stringify(historique));
    return true;
  } catch (error) {
    console.error("Erreur historique PDF :", error);
    return false;
  }
}