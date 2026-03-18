import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let data=[];let uid=null;
const key=()=>`scolaire_${uid}`;
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
 const f=justificatifScolaire.files[0];
 let j=null;
 if(f) j={data:await fileToBase64(f)};

 data.push({
  id:Date.now(),
  date:dateScolaire.value,
  enfant:enfantScolaire.value,
  type:typeScolaire.value,
  lieu:ecoleScolaire.value,
  objet:objetScolaire.value,
  montant:Number(montantScolaire.value),
  justificatif:j
 });

 save();render();
}

function render(){
 scolaireBody.innerHTML="";
 data.forEach(d=>{
  scolaireBody.innerHTML+=`
  <tr>
  <td>${d.date}</td>
  <td>${d.enfant}</td>
  <td>${d.type}</td>
  <td>${d.lieu}</td>
  <td>${d.objet}</td>
  <td>${d.montant}€</td>
  <td>${d.justificatif?"✔":"-"}</td>
  <td><button onclick="del(${d.id})">X</button></td>
  </tr>`;
 });

 totalLignesScolaire.textContent=data.length;
 totalMontantScolaire.textContent=data.reduce((s,d)=>s+d.montant,0)+" €";
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
  mois:formatMonthLabel(moisScolaire.value),
  nom:"scolaire.pdf",
  type:"Scolaire"
 });

 pdf.save("scolaire.pdf");
}

btnAjouterScolaire.onclick=add;
btnPdfScolaire.onclick=pdf;

onAuthStateChanged(auth,u=>{
 uid=u.uid;
 load();render();
});