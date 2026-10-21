import { getPrivateDataUrl } from "./private-storage.js";
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js';
import { loadModuleData, saveModuleData } from './cloud-sync.js';
import { requirePdfAccess } from './premium.js';
import { savePdfToHistory } from './pdf-history.js';
import { calendarDays, validateRequest, dateFr, buildLeavePdf } from './conges-pdf.js';
const $=id=>document.getElementById(id);
let uid=null, profile={}, requests=[], activeId=null, busy=false, signatureOverride=null;
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const status=message=>{$('status').textContent=message;};
function input(label,key,value='',type='text',required=false){
  const l=document.createElement('label');l.textContent=label;
  const e=document.createElement('input');e.type=type;e.dataset.key=key;e.value=value;e.required=required;
  if(type==='text')e.maxLength=160;
  if(type==='number'){e.min='0.5';e.step='0.5';}
  l.append(e);return l;
}
function removeButton(row,container){const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent='Supprimer cette ligne';b.addEventListener('click',()=>{if(container==='periods' && $('periods').children.length===1){status('Conservez au moins une période.');return;}row.remove();});row.append(b);}
function addPeriod(p={}){
  const row=document.createElement('div');row.className='conges-row';
  const grid=document.createElement('div');grid.className='conges-grid';
  grid.append(input('Du (premier jour)','start',p.start,'date',true),input('Au (dernier jour)','end',p.end,'date',true),input('Nombre de jours pris (modifiable)','days',p.days,'number',true));
  row.append(grid);removeButton(row,'periods');$('periods').append(row);
  for(const key of ['start','end'])row.querySelector(`[data-key="${key}"]`).addEventListener('change',()=>{const days=calendarDays(row.querySelector('[data-key="start"]').value,row.querySelector('[data-key="end"]').value);row.querySelector('[data-key="days"]').value=days??'';});
}
function addChild(c={}){
  const row=document.createElement('div');row.className='conges-row';
  const grid=document.createElement('div');grid.className='conges-grid';grid.append(input('Nom et prénom de l’enfant','name',c.name,'text',true));
  const relay=document.createElement('div');relay.className='conges-grid relay';
  relay.append(input('Premier jour du relais','start',c.start,'date'),input('Fin du relais','end',c.end,'date'),input('Famille d’accueil / relais habituel','usual',c.usual),input('Famille d’accueil / proposition relais','proposed',c.proposed));
  const parents=document.createElement('div');parents.className='conges-grid parents';
  for(const [role,label] of [['father','Père'],['mother','Mère']]){
    parents.append(input(label+' : nom et prénom',role+'Name',c[role+'Name']));
    const l=document.createElement('label');l.textContent='Décision - '+label;const select=document.createElement('select');select.dataset.key=role+'Decision';
    for(const [v,t] of [['','À compléter par le responsable légal'],['oui','Autorise'],['non','N’autorise pas']]){const o=document.createElement('option');o.value=v;o.textContent=t;select.append(o);}select.value=c[role+'Decision']||'';l.append(select);parents.append(l);
  }
  row.append(grid,relay,parents);removeButton(row,'children');$('children').append(row);updateMode();
}
function updateMode(){const withChildren=$('mode').value==='avec';
  $('balanceLabel').hidden=withChildren;$('destinationLabel').hidden=!withChildren;$('destination').required=withChildren;$('addPeriod').hidden=withChildren;
  $('childrenTitle').textContent=withChildren?'Enfants et autorisations parentales':'Enfants et relais';
  $('childrenHelp').textContent=withChildren?'Une fiche par enfant avec deux exemplaires. Les décisions peuvent rester vierges pour être complétées par les responsables légaux.':'Renseignez les enfants concernés et l’organisation du relais.';
  document.querySelectorAll('.relay').forEach(el=>{el.hidden=withChildren;el.querySelectorAll('input').forEach(e=>e.disabled=withChildren);});
  document.querySelectorAll('.parents').forEach(el=>{el.hidden=!withChildren;el.querySelectorAll('input,select').forEach(e=>e.disabled=!withChildren);});
}
const rows=id=>[...$(id).children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-key]')].map(e=>[e.dataset.key,e.value.trim()])));
function read(){return validateRequest({id:activeId||crypto.randomUUID(),mode:$('mode').value,fullName:$('fullName').value.trim(),service:$('service').value.trim(),destination:$('destination').value.trim(),balance:$('balance').value,signedDate:$('signedDate').value,useSignature:$('useSignature').checked,periods:rows('periods'),children:rows('children')});}
function fill(d={}){
  activeId=d.id||null;signatureOverride=null;$('signatureFile').value='';
  $('mode').value=d.mode||'sans';$('fullName').value=d.fullName??profile.fullName??'';$('service').value=d.service??(profile.serviceName||'Service de placement familial');$('destination').value=d.destination||'';$('balance').value=d.balance??'';$('signedDate').value=d.signedDate||today();$('useSignature').checked=Boolean(d.useSignature);
  $('periods').replaceChildren();(d.periods||[{}]).forEach(addPeriod);$('children').replaceChildren();(d.children||[]).forEach(addChild);updateMode();
}
function renderRequests(){
  $('requests').replaceChildren();if(!requests.length){$('requests').textContent='Aucune demande enregistrée.';return;}
  [...requests].reverse().forEach(d=>{const row=document.createElement('div');row.className='request-item';const text=document.createElement('span');text.textContent=`${d.fullName} — ${d.mode==='avec'?'Avec':'Sans'} enfants — ${dateFr(d.periods[0]?.start)}`;
    const b=document.createElement('button');b.type='button';b.className='btn btn-secondary';b.textContent='Ouvrir / modifier';b.addEventListener('click',()=>{fill(d);status('Demande chargée.');window.scrollTo({top:0,behavior:'smooth'});});row.append(text,b);$('requests').append(row);});
}
async function persist(d){
  const updated={...d,updatedAt:new Date().toISOString()};const next=requests.filter(r=>r.id!==d.id).concat(updated);
  localStorage.setItem(`conges_${uid}`,JSON.stringify(next));requests=next;activeId=d.id;renderRequests();
  try{await saveModuleData(uid,'conges',{requests});status('Demande enregistrée et synchronisée.');}catch(e){console.error(e);status('Demande enregistrée sur cet appareil. Synchronisation indisponible ; réenregistrez-la une fois la connexion rétablie.');}
}
// Crop only the blank border for PDF placement; the saved profile image stays unchanged.
function trimSignature(canvas){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
  const pixels=ctx.getImageData(0,0,w,h).data;
  let left=w,top=h,right=-1,bottom=-1;
  for(let row=0;row<h;row++)for(let col=0;col<w;col++){
    const i=(row*w+col)*4,alpha=pixels[i+3]/255;
    // Composite against white so transparent backgrounds and opaque white margins work alike.
    const shade=Math.min(pixels[i],pixels[i+1],pixels[i+2])*alpha+255*(1-alpha);
    if(shade<245){left=Math.min(left,col);right=Math.max(right,col);top=Math.min(top,row);bottom=Math.max(bottom,row);}
  }
  if(right<left)return canvas;
  const padding=Math.max(2,Math.ceil(Math.max(right-left+1,bottom-top+1)*.02));
  left=Math.max(0,left-padding);top=Math.max(0,top-padding);right=Math.min(w-1,right+padding);bottom=Math.min(h-1,bottom+padding);
  const cropped=document.createElement('canvas');cropped.width=right-left+1;cropped.height=bottom-top+1;
  cropped.getContext('2d').drawImage(canvas,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
  return cropped;
}
async function imageData(source,maxWidth=1000,maxHeight=600,trim=false){
  if(!source)return null;
  return new Promise((resolve,reject)=>{
    const img=new Image();img.crossOrigin='anonymous';
    img.onload=()=>{try{
      const canvas=document.createElement('canvas');const scale=Math.min(1,maxWidth/img.width,maxHeight/img.height);
      canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
      resolve((trim?trimSignature(canvas):canvas).toDataURL('image/png'));
    }catch(e){reject(e);}};
    img.onerror=()=>reject(new Error('Une image du formulaire est inaccessible. Rechargez la page ou importez à nouveau votre signature.'));img.src=source;
  });
}
for(const [id,kind] of [['signatureFile','signature']])$(id).addEventListener('change',async e=>{const f=e.target.files[0];if(!f){signatureOverride=null;return;}try{if(!['image/png','image/jpeg'].includes(f.type)||f.size>5*1024*1024)throw new Error('Choisissez une image PNG ou JPEG de moins de 5 Mo.');const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f);});const normalized=await imageData(data);signatureOverride=normalized;status('Image chargée pour le prochain PDF.');}catch(error){e.target.value='';signatureOverride=null;status(error.message);}});
async function run(action){if(busy||!uid)return;busy=true;$('editor').disabled=true;try{await action();}catch(e){console.error(e);status(e.message||'Impossible de terminer cette opération.');}finally{busy=false;$('editor').disabled=false;}}
$('congesForm').addEventListener('submit',e=>{e.preventDefault();run(()=>persist(read()));});
$('mode').addEventListener('change',updateMode);$('addPeriod').addEventListener('click',()=>addPeriod());$('addChild').addEventListener('click',()=>addChild());
$('newRequest').addEventListener('click',()=>{if(confirm('Commencer une nouvelle demande ? Les modifications non enregistrées seront perdues.')){fill();status('Nouvelle demande.');}});
$('exportPdf').addEventListener('click',()=>{
  if(!$('congesForm').reportValidity())return;
  run(async()=>{const d=read();if(!window.jspdf?.jsPDF)throw new Error('Le générateur PDF est indisponible. Vérifiez votre connexion puis rechargez la page.');
    const templateUrl=new URL(`./conges-modeles/${d.mode}.png`,import.meta.url).href;
    const signatureSource=signatureOverride||profile.signaturePath||profile.signatureUrl||profile.signatureData||localStorage.getItem(`profileSignatureData_${uid}`);
    if(d.useSignature&&!signatureSource)throw new Error('Importez une signature ou décochez son ajout.');
    const assets={template:await imageData(templateUrl,2400,3400),signature:d.useSignature?await imageData(await getPrivateDataUrl(signatureSource),2000,1200,true):null};
    const pdf=buildLeavePdf(window.jspdf.jsPDF,d,assets);
    if(!await requirePdfAccess())return;
    await persist(d);
    const filename=`${d.mode==='avec'?'autorisation-vacances':'demande-conges'}_${d.periods[0].start}.pdf`;
    pdf.save(filename);await savePdfToHistory(pdf,{nom:filename,mois:d.periods[0].start.slice(0,7),type:'Congés'});
  });
});
onAuthStateChanged(auth,async user=>{
  $('editor').disabled=true;
  if(!user||!user.emailVerified){window.location.href='login.html';return;}
  uid=user.uid;
  try{
    const results=await Promise.allSettled([getDoc(doc(db,'users',uid,'profile','main')),loadModuleData(uid,'conges')]);
    profile=results[0].status==='fulfilled'?(results[0].value.data()||{}):{};
    let local=[];try{local=JSON.parse(localStorage.getItem(`conges_${uid}`)||'[]');}catch(e){console.error(e);}
    const cloud=results[1].status==='fulfilled'?results[1].value?.requests:[];
    const merged=new Map();for(const r of [...(Array.isArray(cloud)?cloud:[]),...(Array.isArray(local)?local:[])]){const old=merged.get(r.id);if(!old||String(r.updatedAt||'')>=String(old.updatedAt||''))merged.set(r.id,r);}
    requests=[...merged.values()];fill();renderRequests();status(results.some(r=>r.status==='rejected')?'Mode local : certaines données en ligne sont indisponibles.':'Prêt. Complétez votre demande puis enregistrez-la ou téléchargez le PDF.');
  }catch(e){status('Impossible de charger les demandes. Rechargez la page.');console.error(e);}finally{$('editor').disabled=false;}
});
