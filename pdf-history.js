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
    const historiqueKey = "historiquePDF";

    let historique = JSON.parse(localStorage.getItem(historiqueKey) || "[]");

    historique.push({
      nom: info.nom,
      mois: info.mois,
      type: info.type,
      date: new Date().toLocaleDateString("fr-FR")
    });

    localStorage.setItem(historiqueKey, JSON.stringify(historique));

    console.log("PDF enregistré dans historique");
  } catch (error) {
    console.error("Erreur historique PDF :", error);
  }
}