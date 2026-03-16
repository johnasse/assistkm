import { auth } from "./firebase-config.js";

function getUid(){
  return auth.currentUser?.uid || "guest";
}

function getHistoryKey(){
  return `historiquePDF_${getUid()}`;
}

export function formatMonthLabel(value){

  if(!value) return "-";

  if(/^\d{4}$/.test(value)){
    return value;
  }

  const match=String(value).match(/^(\d{4})-(\d{2})$/);
  if(!match) return value;

  const[,year,month]=match;

  const months=[
  "janvier","février","mars","avril","mai","juin",
  "juillet","août","septembre","octobre","novembre","décembre"
  ];

  return `${months[Number(month)-1]} ${year}`;

}

export function savePdfToHistory(doc,options={}){

  try{

    const historique=JSON.parse(
      localStorage.getItem(getHistoryKey())||"[]"
    );

    const item={

      id:Date.now()+Math.floor(Math.random()*1000),
      mois:options.mois||"-",
      nom:options.nom||"document.pdf",
      type:options.type||"Non classé",

      data:doc.output("datauristring"),

      dateGeneration:new Date().toLocaleString("fr-FR")

    };

    historique.push(item);

    localStorage.setItem(
      getHistoryKey(),
      JSON.stringify(historique)
    );

    return true;

  }catch(error){

    console.error("Erreur historique PDF :",error);
    return false;

  }

}