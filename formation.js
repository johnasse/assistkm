import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let data=[];let uid=null;
const key=()=>`formation_${uid}`;
const save=()=>localStorage.setItem(key(),JSON.stringify(data));
const load=()=>data=JSON.parse(localStorage.getItem(key())||"[]");

async function fileToBase64(f){
 return new Promise(r=>{
  const fr=new FileReader();
  fr.onload=()=>r(fr.result);
  fr.readAsDataURL(f);
 });
}

async function add(){
 const f=justificatifFormation.files[0];
 let j=null;
 if(f) j={data:await fileToBase64(f)};

 data.push({
  id:Date.now(),
  date:dateFormation.value,
  type:typeFormation.value,
  lieu:lieuFormation.value,
  organisme:organismeFormation.value,
  objet:objetFormation.value,
  montant:Number(montantFormation.value),
  justificatif:j
 });

 save();render();
}

function render(){
 formationBody.innerHTML="";
 data.forEach(d=>{
  formationBody.innerHTML+=`
  <tr>
  <td>${d.date}</td>
  <td>${d.type}</td>
  <td>${d.organisme}</td>
  <td>${d.lieu}</td>
  <td>${d.objet}</td>
  <td>${d.montant}€</td>
  <td>${d.justificatif?"✔":"-"}</td>
  <td><button onclick="del(${d.id})">X</button></td>
  </tr>`;
 });

 totalLignesFormation.textContent=data.length;
 totalMontantFormation.textContent=data.reduce((s,d)=>s+d.montant,0)+" €";
}

window.del=id=>{data=data.filter(x=>x.id!==id);save();render();}

async function pdf(){
 const {jsPDF}=window.jspdf;
 const pdf=new jsPDF();

 let y=10;
 data.forEach(d=>{
  pdf.text(`${d.date} ${d.objet} ${d.montant}€`,10,y);
  y+=6;
 });

 for(const d of data){
  if(d.justificatif){
   const img=new Image();
   img.src=d.justificatif.data;
   await new Promise(r=>img.onload=r);
   pdf.addPage();
   pdf.addImage(img,"JPEG",10,20,180,200);
  }
 }

 savePdfToHistory(pdf,{
  mois:formatMonthLabel(moisFormation.value),
  nom:"formation.pdf",
  type:"Formation"
 });

 pdf.save("formation.pdf");
}

btnAjouterFormation.onclick=add;
btnPdfFormation.onclick=pdf;

onAuthStateChanged(auth,u=>{
 uid=u.uid;
 load();render();
});