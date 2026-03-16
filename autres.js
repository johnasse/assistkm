import { requirePdfAccess } from "./premium.js";
import { savePdfToHistory } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let fraisAutres = [];
let autresDb = null;
let uid = null;

function getStorageKey(){
return `fraisAutres_${uid}`
}

onAuthStateChanged(auth,(user)=>{

if(!user){
window.location.href="login.html"
return
}

uid=user.uid

fraisAutres=JSON.parse(localStorage.getItem(getStorageKey())||"[]")

bindEvents()
render()

})

document.addEventListener("DOMContentLoaded",async()=>{

await initDB()

})

function bindEvents(){

document.getElementById("btnAjouterAutres")
.addEventListener("click",ajouter)

document.getElementById("btnResetAutres")
.addEventListener("click",resetForm)

document.getElementById("btnPdfAutres")
.addEventListener("click",genererPDF)

document.getElementById("btnViderAutres")
.addEventListener("click",vider)

document.getElementById("btnPhotoAutres")
.addEventListener("click",()=>{

document.getElementById("justificatifAutres").click()

})

document.getElementById("justificatifAutres")
.addEventListener("change",updateNom)

}

function updateNom(){

const file=document.getElementById("justificatifAutres").files[0]

document.getElementById("nomJustificatifAutres").textContent=
file?file.name:""

}

async function ajouter(){

const date=document.getElementById("dateAutres").value
const enfant=document.getElementById("enfantAutres").value
const type=document.getElementById("typeAutres").value
const lieu=document.getElementById("lieuAutres").value
const objet=document.getElementById("objetAutres").value
const montant=parseFloat(document.getElementById("montantAutres").value)

const file=document.getElementById("justificatifAutres").files[0]||null

if(!date||!objet||!montant){
alert("Champs manquants")
return
}

let justificatifId=null
let justificatifNom=""

if(file){

justificatifId="justif-autres-"+Date.now()

justificatifNom=file.name

await saveFile({

id:justificatifId,
name:file.name,
file:file

})

}

fraisAutres.push({

id:Date.now(),
date,
enfant,
type,
lieu,
objet,
montant,
justificatifId,
justificatifNom

})

save()
render()
resetForm()

}

function render(){

const body=document.getElementById("autresBody")

body.innerHTML=""

if(fraisAutres.length===0){

body.innerHTML=`
<tr>
<td colspan="8">Aucune dépense</td>
</tr>
`

updateTotals()
return

}

fraisAutres.forEach(item=>{

const tr=document.createElement("tr")

const justif=item.justificatifId?

`
<button class="btnView" data-id="${item.justificatifId}">Voir</button>
<button class="btnDown" data-id="${item.justificatifId}">Télécharger</button>
`

:"Aucun"

tr.innerHTML=`

<td>${item.date}</td>
<td>${item.enfant}</td>
<td>${item.type}</td>
<td>${item.lieu}</td>
<td>${item.objet}</td>
<td>${item.montant} €</td>
<td>${justif}</td>

<td>
<button class="btnDel" data-id="${item.id}">Supprimer</button>
</td>

`

body.appendChild(tr)

})

document.querySelectorAll(".btnDel")
.forEach(btn=>{

btn.onclick=()=>supprimer(btn.dataset.id)

})

document.querySelectorAll(".btnView")
.forEach(btn=>{

btn.onclick=()=>voir(btn.dataset.id)

})

document.querySelectorAll(".btnDown")
.forEach(btn=>{

btn.onclick=()=>download(btn.dataset.id)

})

updateTotals()

}

function supprimer(id){

fraisAutres=fraisAutres.filter(f=>f.id!=id)

save()
render()

}

function updateTotals(){

const total=fraisAutres.reduce((s,i)=>s+i.montant,0)

document.getElementById("totalLignesAutres").textContent=fraisAutres.length

document.getElementById("totalMontantAutres").textContent=
total.toFixed(2)+" €"

}

function save(){

localStorage.setItem(getStorageKey(),JSON.stringify(fraisAutres))

}

function resetForm(){

document.querySelectorAll("input").forEach(i=>i.value="")

}

async function genererPDF(){

const allowed=await requirePdfAccess()

if(!allowed)return

const {jsPDF}=window.jspdf

const doc=new jsPDF("landscape")

let y=20

doc.text("Etat des autres frais",10,y)

y+=10

fraisAutres.forEach(f=>{

doc.text(`${f.date} - ${f.objet} - ${f.montant} €`,10,y)

y+=6

})

savePdfToHistory(doc,{
type:"Autres frais",
nom:"autres-frais.pdf"
})

doc.save("autres-frais.pdf")

}

function vider(){

if(confirm("Tout supprimer ?")){

fraisAutres=[]

save()
render()

}

}

function initDB(){

return new Promise((resolve,reject)=>{

const request=indexedDB.open("gestionFraisDB",1)

request.onsuccess=()=>{

autresDb=request.result
resolve()

}

request.onerror=()=>reject()

})

}

function saveFile(file){

return new Promise((resolve)=>{

const tx=autresDb.transaction(["justificatifs"],"readwrite")

tx.objectStore("justificatifs").put(file)

resolve()

})

}

function getFile(id){

return new Promise((resolve)=>{

const tx=autresDb.transaction(["justificatifs"],"readonly")

const req=tx.objectStore("justificatifs").get(id)

req.onsuccess=()=>resolve(req.result)

})

}

async function voir(id){

const record=await getFile(id)

const url=URL.createObjectURL(record.file)

window.open(url)

}

async function download(id){

const record=await getFile(id)

const url=URL.createObjectURL(record.file)

const a=document.createElement("a")

a.href=url
a.download=record.name

a.click()

}