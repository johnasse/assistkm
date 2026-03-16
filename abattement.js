import { requirePremium } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let lignesAbattement = [];
let listeEnfantsAbattementMemo = [];
let uid = null;

function getLignesKey(){
  return `lignesAbattement_${uid}`;
}

function getEnfantsKey(){
  return `listeEnfantsAbattementMemo_${uid}`;
}

document.addEventListener("DOMContentLoaded", async () => {

const allowed = await requirePremium();
if(!allowed) return;

});

onAuthStateChanged(auth,(user)=>{

if(!user){
window.location.href="login.html";
return;
}

uid=user.uid;

lignesAbattement =
JSON.parse(localStorage.getItem(getLignesKey())||"[]");

listeEnfantsAbattementMemo =
JSON.parse(localStorage.getItem(getEnfantsKey())||"[]");

chargerInfosAbattement();
bindAbattementEvents();
renderListeEnfantsAbattement();
renderLignesAbattement();
calculerAbattement();

});

function saveLignesAbattement(){

localStorage.setItem(
getLignesKey(),
JSON.stringify(lignesAbattement)
);

}

function saveListeEnfants(){

localStorage.setItem(
getEnfantsKey(),
JSON.stringify(listeEnfantsAbattementMemo)
);

}

function chargerInfosAbattement(){

const assistantNom =
localStorage.getItem(`assistantNomAbattement_${uid}`) ||
localStorage.getItem(`assistantNom_${uid}`) ||
"";

const champ = document.getElementById("assistantNomAbattement");

if(champ) champ.value = assistantNom;

updateSmicParAnnee();
updateCasesFiscales();

}

function saveAssistantNomAbattement(){

const el=document.getElementById("assistantNomAbattement");

localStorage.setItem(
`assistantNomAbattement_${uid}`,
el.value.trim()
);

}

function ajouterEnfantMemo(nom){

const clean = String(nom || "").trim();
if(!clean) return;

const exists = listeEnfantsAbattementMemo.some(
e => e.toLowerCase() === clean.toLowerCase()
);

if(!exists){

listeEnfantsAbattementMemo.push(clean);

listeEnfantsAbattementMemo.sort((a,b)=>
a.localeCompare(b,"fr",{sensitivity:"base"})
);

saveListeEnfants();

}

}

function renderListeEnfantsAbattement(){

const datalist = document.getElementById("listeEnfantsAbattement");
if(!datalist) return;

datalist.innerHTML="";

listeEnfantsAbattementMemo.forEach(nom=>{

const option=document.createElement("option");
option.value=nom;
datalist.appendChild(option);

});

}

function ajouterLigneAbattement(){

const enfant=document.getElementById("nomEnfantLigne").value.trim();
const periode=document.getElementById("periodeLigne").value;
const typeAccueil=document.getElementById("typeAccueilLigne").value;
const jours=parseFloat(document.getElementById("joursLigne").value||"0");

if(!enfant || !periode || !typeAccueil || jours<=0){

alert("Merci de remplir correctement la ligne enfant.");
return;

}

ajouterEnfantMemo(enfant);
renderListeEnfantsAbattement();

lignesAbattement.push({

id:Date.now(),
enfant,
periode,
typeAccueil,
jours

});

saveLignesAbattement();
renderLignesAbattement();
calculerAbattement();
resetLigneAbattement();

}

function supprimerLigneAbattement(id){

lignesAbattement=lignesAbattement.filter(
ligne=>ligne.id!==id
);

saveLignesAbattement();
renderLignesAbattement();
calculerAbattement();

}

function viderLignesAbattement(){

if(lignesAbattement.length===0) return;

if(!confirm("Voulez-vous vraiment vider toutes les lignes ?"))
return;

lignesAbattement=[];
saveLignesAbattement();
renderLignesAbattement();
calculerAbattement();

}

function resetLigneAbattement(){

document.getElementById("nomEnfantLigne").value="";
document.getElementById("periodeLigne").value="avant";
document.getElementById("typeAccueilLigne").value="non_permanent";
document.getElementById("joursLigne").value="0";

}

function formatEuro(v){

return Number(v||0).toFixed(2).replace(".",",")+" €";

}

function lireNombre(id){

const el=document.getElementById(id);
if(!el) return 0;

return Number(parseFloat(el.value||"0"));

}

function getCoefficient(type){

switch(type){

case "non_permanent": return 3;
case "non_permanent_majore": return 4;
case "permanent": return 4;
case "permanent_majore": return 5;

default: return 0;

}

}

function calculerAbattement(){

const totalSommesRecues=lireNombre("totalSommesRecues");
const smicAvant=lireNombre("smicAvantNov");
const smicApres=lireNombre("smicApresNov");

let abattement=0;

lignesAbattement.forEach(ligne=>{

const coef=getCoefficient(ligne.typeAccueil);
const smic=ligne.periode==="avant"?smicAvant:smicApres;

abattement += ligne.jours * coef * smic;

});

const retenu=Math.min(abattement,totalSommesRecues);
const imposable=Math.max(0,totalSommesRecues-retenu);

document.getElementById("abattementCalcule").textContent=formatEuro(abattement);
document.getElementById("abattementRetenu").textContent=formatEuro(retenu);
document.getElementById("montantImposable").textContent=formatEuro(imposable);

}