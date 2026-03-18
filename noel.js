import { savePdfToHistory, formatMonthLabel } from "./pdf-history.js";
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

let data = [];
let uid = null;

function key() { return `noel_${uid}`; }

function save() { localStorage.setItem(key(), JSON.stringify(data)); }

function load() { data = JSON.parse(localStorage.getItem(key()) || "[]"); }

function fileToBase64(file){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=()=>res(r.result);
    r.readAsDataURL(file);
  });
}

async function add(){
  const f = document.getElementById("justificatifNoel").files[0];
  let justificatif=null;

  if(f){
    justificatif = {
      name:f.name,
      data:await fileToBase64(f)
    };
  }

  data.push({
    id:Date.now(),
    date:dateNoel.value,
    enfant:enfantNoel.value,
    type:typeNoel.value,
    lieu:magasinNoel.value,
    objet:objetNoel.value,
    montant:Number(montantNoel.value),
    justificatif
  });

  save(); render();
}

function render(){
  const body=noelBody;
  body.innerHTML="";

  data.forEach(d=>{
    body.innerHTML+=`
    <tr>
      <td>${d.date}</td>
      <td>${d.enfant}</td>
      <td>${d.type}</td>
      <td>${d.lieu}</td>
      <td>${d.objet}</td>
      <td>${d.montant} €</td>
      <td>${d.justificatif?"✔":"-"}</td>
      <td><button onclick="del(${d.id})">X</button></td>
    </tr>`;
  });

  totalLignesNoel.textContent=data.length;
  totalMontantNoel.textContent=data.reduce((s,d)=>s+d.montant,0)+" €";
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
    mois:formatMonthLabel(moisNoel.value),
    nom:"noel.pdf",
    type:"Noel"
  });

  pdf.save("noel.pdf");
}

btnAjouterNoel.onclick=add;
btnPdfNoel.onclick=pdf;

onAuthStateChanged(auth,u=>{
  uid=u.uid;
  load();render();
});