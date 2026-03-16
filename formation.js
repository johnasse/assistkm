import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisFormation = [];
let formationDb = null;
let uid = null;

function getStorageKey(){
  return `fraisFormationMensuels_${uid}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  await initFormationDB();
});

onAuthStateChanged(auth,(user)=>{

  if(!user){
    window.location.href="login.html"
    return
  }

  uid=user.uid;

  fraisFormation=JSON.parse(localStorage.getItem(getStorageKey())||"[]")

  chargerInfosFormation()
  bindFormationEvents()
  renderFormation()

})

function bindFormationEvents(){

document.getElementById("btnAjouterFormation").addEventListener("click",ajouterFraisFormation)
document.getElementById("btnResetFormation").addEventListener("click",resetFormFormation)
document.getElementById("btnPdfFormation").addEventListener("click",genererPDFFormation)
document.getElementById("btnViderFormation").addEventListener("click",viderListeFormation)
document.getElementById("assistantNomFormation").addEventListener("input",saveAssistantNomFormation)
document.getElementById("moisFormation").addEventListener("change",saveMoisFormation)

document.getElementById("btnPhotoFormation").addEventListener("click",()=>{
document.getElementById("justificatifFormation").click()
})

document.getElementById("justificatifFormation")
.addEventListener("change",updateNomJustificatifFormation)

}

function chargerInfosFormation(){

const assistantNom=
localStorage.getItem(`assistantNomFormation_${uid}`)||
localStorage.getItem(`assistantNom_${uid}`)||
""

const moisFormation=localStorage.getItem(`moisFormation_${uid}`)

document.getElementById("assistantNomFormation").value=assistantNom

if(moisFormation){

document.getElementById("moisFormation").value=moisFormation

}else{

const now=new Date()
const month=String(now.getMonth()+1).padStart(2,"0")
const year=now.getFullYear()

document.getElementById("moisFormation").value=`${year}-${month}`

}

}

function saveAssistantNomFormation(){

localStorage.setItem(
`assistantNomFormation_${uid}`,
document.getElementById("assistantNomFormation").value.trim()
)

}

function saveMoisFormation(){

localStorage.setItem(
`moisFormation_${uid}`,
document.getElementById("moisFormation").value
)

}

function updateNomJustificatifFormation(){

const file=document.getElementById("justificatifFormation").files[0]

document.getElementById("nomJustificatifFormation").textContent=
file?`Fichier sélectionné : ${file.name}`:""

}

async function ajouterFraisFormation(){

const date=document.getElementById("dateFormation").value
const organisme=document.getElementById("organismeFormation").value.trim()
const type=document.getElementById("typeFormation").value
const lieu=document.getElementById("lieuFormation").value.trim()
const objet=document.getElementById("objetFormation").value.trim()
const montant=parseFloat(document.getElementById("montantFormation").value)

const justificatifFile=document.getElementById("justificatifFormation").files[0]||null

if(!date||!organisme||!type||!lieu||!objet||isNaN(montant)||montant<=0){

alert("Merci de remplir tous les champs correctement.")
return

}

let justificatifId=null
let justificatifNom=""
let justificatifType=""

if(justificatifFile){

justificatifId=`justif-formation-${uid}-${Date.now()}`
justificatifNom=justificatifFile.name
justificatifType=justificatifFile.type||""

await saveFileToFormationDB({

id:justificatifId,
name:justificatifNom,
type:justificatifType,
file:justificatifFile,
createdAt:new Date().toISOString()

})

}

fraisFormation.push({

id:Date.now(),
date,
organisme,
type,
lieu,
objet,
montant:Number(montant.toFixed(2)),
justificatifId,
justificatifNom,
justificatifType

})

saveFraisFormation()
renderFormation()
resetFormFormation()

}

function renderFormation(){

const body=document.getElementById("formationBody")
body.innerHTML=""

if(fraisFormation.length===0){

body.innerHTML=`
<tr>
<td colspan="8" class="empty-cell">Aucune dépense enregistrée</td>
</tr>
`

updateTotalsFormation()
return

}

fraisFormation.forEach(item=>{

const tr=document.createElement("tr")

tr.innerHTML=`

<td>${formatDateFr(item.date)}</td>
<td>${item.type}</td>
<td>${item.organisme}</td>
<td>${item.lieu}</td>
<td>${item.objet}</td>
<td>${item.montant.toFixed(2).replace(".",",")} €</td>

<td>
<button class="table-action-btn btn-delete-formation"
data-id="${item.id}">
Supprimer
</button>
</td>

`

body.appendChild(tr)

})

document.querySelectorAll(".btn-delete-formation")
.forEach(btn=>{

btn.addEventListener("click",()=>supprimerFraisFormation(Number(btn.dataset.id)))

})

updateTotalsFormation()

}

function supprimerFraisFormation(id){

fraisFormation=fraisFormation.filter(row=>row.id!==id)

saveFraisFormation()
renderFormation()

}

function viderListeFormation(){

if(fraisFormation.length===0)return

const ok=confirm("Voulez-vous vraiment vider toute la liste ?")
if(!ok)return

fraisFormation=[]
saveFraisFormation()
renderFormation()

}

function updateTotalsFormation(){

const totalMontant=fraisFormation.reduce((sum,item)=>sum+item.montant,0)

document.getElementById("totalLignesFormation").textContent=String(fraisFormation.length)

document.getElementById("totalMontantFormation").textContent=
totalMontant.toFixed(2).replace(".",",")+" €"

}

function saveFraisFormation(){

localStorage.setItem(getStorageKey(),JSON.stringify(fraisFormation))

}

function resetFormFormation(){

document.getElementById("dateFormation").value=""
document.getElementById("organismeFormation").value=""
document.getElementById("typeFormation").value=""
document.getElementById("lieuFormation").value=""
document.getElementById("objetFormation").value=""
document.getElementById("montantFormation").value=""
document.getElementById("justificatifFormation").value=""
document.getElementById("nomJustificatifFormation").textContent=""

}

function formatDateFr(dateStr){

if(!dateStr)return"-"

const[y,m,d]=dateStr.split("-")
return`${d}/${m}/${y}`

}