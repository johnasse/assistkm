import { auth } from "./firebase-config.js";

export function formatMonthLabel(monthStr) {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  const months = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  return `${months[Number(month) - 1]} ${year}`;
}

export async function savePdfToHistory(docPdf, info) {
  try {
    const uid = auth.currentUser?.uid || "guest";
    const historiqueKey = `historiquePDF_${uid}`;
    const historique = JSON.parse(localStorage.getItem(historiqueKey) || "[]");

    let data = null;

    try {
      const rawData = docPdf.output("datauristring");
      if (rawData && rawData.length < 1400000) {
        data = rawData;
      }
    } catch (error) {
      console.warn("PDF trop lourd pour stockage local du téléchargement :", error);
    }

    historique.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      nom: info.nom || "document.pdf",
      mois: info.mois || "-",
      type: info.type || "Non classé",
      dateGeneration: new Date().toLocaleString("fr-FR"),
      data
    });

    localStorage.setItem(historiqueKey, JSON.stringify(historique));
    console.log("PDF enregistré dans historique :", historiqueKey);
  } catch (error) {
    console.error("Erreur historique PDF :", error);
  }
}