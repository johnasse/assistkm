import { auth } from "./firebase-config.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-storage.js";

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
    const user = auth.currentUser;
    if (!user) return;

    const storage = getStorage();
    const fileName = info.nom || "document.pdf";
    const storagePath = `pdf/${user.uid}/${Date.now()}_${fileName}`;

    const pdfBlob = docPdf.output("blob");

    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, pdfBlob);
    const downloadURL = await getDownloadURL(storageRef);

    const historiqueKey = `historiquePDF_${user.uid}`;
    const historique = JSON.parse(localStorage.getItem(historiqueKey) || "[]");

    historique.push({
      id: Date.now(),
      nom: fileName,
      mois: info.mois || "-",
      type: info.type || "Non classé",
      dateGeneration: new Date().toLocaleString("fr-FR"),
      downloadURL,
      storagePath
    });

    localStorage.setItem(historiqueKey, JSON.stringify(historique));
    console.log("PDF enregistré dans historique + storage");

  } catch (error) {
    console.error("Erreur historique PDF :", error);
  }
}