import { auth } from "./firebase-config.js";

export function formatMonthLabel(monthStr) {
  if (!monthStr) return "-";
  const [year, month] = monthStr.split("-");
  const months = [
    "Janvier","Février","Mars","Avril","Mai","Juin",
    "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
  ];
  return `${months[Number(month) - 1]} ${year}`;
}

export async function savePdfToHistory(docPdf, info) {
  try {
    const user = auth.currentUser;
    const uid = user ? user.uid : "guest";

    const historiqueKey = `historiquePDF_${uid}`;

    let historique = JSON.parse(localStorage.getItem(historiqueKey) || "[]");

    historique.push({
      id: Date.now(),
      nom: info.nom,
      mois: info.mois,
      type: info.type,
      dateGeneration: new Date().toLocaleString("fr-FR")
    });

    localStorage.setItem(historiqueKey, JSON.stringify(historique));

    console.log("PDF enregistré dans historique :", historiqueKey);
  } catch (error) {
    console.error("Erreur historique PDF :", error);
  }
}