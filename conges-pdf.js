export function calendarDays(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`), b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? (b-a)/86400000+1 : null;
}
export function validateRequest(d) {
  if (!d.fullName?.trim() || !d.service?.trim()) throw new Error('Renseignez le nom et le service.');
  if (!['avec','sans'].includes(d.mode)) throw new Error('Choisissez le type de congés.');
  if (!d.periods.length) throw new Error('Ajoutez une période.');
  for (const p of d.periods) {
    if (calendarDays(p.start,p.end) === null || p.days === '' || !Number.isFinite(Number(p.days)) || Number(p.days)<=0) throw new Error('Vérifiez les dates et le nombre de jours de chaque période.');
  }
  const sorted=[...d.periods].sort((a,b)=>a.start.localeCompare(b.start));
  if (sorted.some((p,i)=>i && p.start<=sorted[i-1].end)) throw new Error('Les périodes de congé ne doivent pas se chevaucher.');
  if (d.balance !== '' && (!Number.isFinite(Number(d.balance)) || Number(d.balance)<0)) throw new Error('Le solde doit être positif ou nul.');
  if (!d.signedDate) throw new Error('Renseignez la date de la demande.');
  for (const c of d.children) {
    if (!c.name.trim()) throw new Error('Renseignez le nom de chaque enfant ou supprimez la ligne vide.');
    if(d.mode==='sans' && (c.start || c.end) && calendarDays(c.start,c.end)===null) throw new Error('Vérifiez les dates de relais.');
  }
  if(d.mode==='avec' && (!d.destination?.trim() || d.periods.length!==1)) throw new Error('Pour les vacances avec enfants, indiquez une destination et une seule période par demande.');
  if(d.mode==='avec' && !d.children.length) throw new Error('Ajoutez au moins un enfant accompagnant.');
  return d;
}
export const dateFr = s => s ? s.split('-').reverse().join('/') : '';
// Coordinates follow the supplied blank sheets (reference renders: 1069 x 1500 and 1033 x 1500).
// The original sheet is placed once as a full-page background; only entered values are added.
export function buildLeavePdf(JsPDF, d, assets={}) {
  validateRequest(d);
  if(!assets.template)throw new Error('Le formulaire original est indisponible. Rechargez la page puis réessayez.');
  const pdf=new JsPDF({unit:'mm',format:'a4',compress:true});
  const refWidth=d.mode==='avec'?1033:1069;
  const scale=Math.min(210/refWidth,297/1500);
  const ox=(210-refWidth*scale)/2,oy=(297-1500*scale)/2;
  const x=v=>ox+v*scale,y=v=>oy+v*scale;
  function text(value,left,top,width,height,size=11,bold=false,align='center') {
    if(value===undefined||value===null||value==='')return;
    pdf.setFont('helvetica',bold?'bold':'normal');pdf.setTextColor(0);
    let font=size,lines;
    do{pdf.setFontSize(font);lines=pdf.splitTextToSize(String(value),(width-8)*scale);if(lines.length*font*.36<=(height-4)*scale)break;font-=.25;}while(font>=5);
    if(lines.length*font*.36>(height-4)*scale)throw new Error(`Le texte « ${String(value).slice(0,60)} » est trop long pour sa case. Raccourcissez-le.`);
    const tx=align==='left'?left+4:left+width/2;
    pdf.text(lines,x(tx),y(top+height/2)-(lines.length-1)*font*.18+font*.12,{align});
  }
  function signature(left,top,width,height){
    if(!d.useSignature||!assets.signature)return;
    const info=pdf.getImageProperties(assets.signature),factor=Math.min(width*scale/info.width,height*scale/info.height);
    const w=info.width*factor,h=info.height*factor;
    pdf.addImage(assets.signature,'PNG',x(left)+(width*scale-w)/2,y(top)+(height*scale-h)/2,w,h,'signature','FAST');
  }
  function service(top){
    if(d.service==='Service de placement familial')return;
    pdf.setFillColor(255);pdf.rect(x(3),y(top),310*scale,22*scale,'F');
    text(d.service,3,top,310,22,8,false,'left');
  }
  function background(){pdf.addImage(assets.template,'PNG',ox,oy,refWidth*scale,1500*scale,'formulaire-original','FAST');}
  if(d.mode==='sans'){
    // Each pair of periods and each group of three children stays on the original sheet.
    const pages=Math.max(1,Math.ceil(d.periods.length/2),Math.ceil(d.children.length/3));
    for(let n=0;n<pages;n++){
      if(n)pdf.addPage();background();
      const periods=d.periods.slice(n*2,n*2+2);if(!periods.length)periods.push(...d.periods.slice(0,2));
      const children=d.children.slice(n*3,n*3+3);
      for(let copy=0;copy<2;copy++){
        const bottom=copy===1;
        service(bottom?884:111);
        text(d.fullName,168,bottom?911:137,893,29,12,true);
        const periodTop=bottom?1038:265;
        periods.forEach((p,i)=>{text(dateFr(p.start),4,periodTop+i*31,422,29);text(dateFr(p.end),431,periodTop+i*31,493,29);text(p.days,930,periodTop+i*31,131,29);});
        text(d.balance,930,bottom?1100:328,131,29);
        const childTop=bottom?1248:494,childStep=bottom?31:31;
        children.forEach((c,i)=>{const top=childTop+i*childStep;[[c.name,4,260],[dateFr(c.start),271,154],[dateFr(c.end),432,142],[c.usual,582,200],[c.proposed,791,269]].forEach(([v,left,w])=>text(v,left,top,w,27,10));});
        text(dateFr(d.signedDate),7,bottom?1441:682,145,20,8,false,'left');
        signature(12,bottom?1461:704,240,31);
      }
    }
  }else{
    d.children.forEach((child,index)=>{
      if(index)pdf.addPage();background();
      for(let copy=0;copy<2;copy++){
        const bottom=copy===1,p=d.periods[0];
        service(bottom?849:99);
        text(d.fullName,163,bottom?875:126,863,25,12,true);
        const top=bottom?956:213,h=bottom?26:48;
        text(dateFr(p.start),5,top,275,h);text(dateFr(p.end),289,top,304,h);text(d.destination,602,top,425,h,11);
        text(child.name,10,bottom?1020:310,1010,bottom?98:69,12,true);
        ['father','mother'].forEach((role,j)=>{
          const name=child[role+'Name']||'',decision=child[role+'Decision']||'';
          const nameTop=bottom?(j?1235:1157):(j?505:425);
          text(name,376,nameTop,650,bottom?29:32,11,false,'left');
          if(name||decision){pdf.setFont('helvetica','bold');pdf.setFontSize(8);pdf.text('X',x(65),y(bottom?(j?1251:1178):(j?521:446)));}
          const lineTop=bottom?(j?1295:1195):(j?553:465);
          text(child.name,270,lineTop,176,16,8,false,'left');
          // The original prints both choices. Strike the unselected one, leaving blanks untouched.
          if(decision){const baseline=bottom?(j?1305:1205):(j?564:475);pdf.setDrawColor(0);pdf.setLineWidth(.22);pdf.line(x(decision==='oui'?77:5),y(baseline),x(decision==='oui'?182:64),y(baseline));}
        });
        text(dateFr(d.signedDate),bottom?288:65,bottom?1380:632,bottom?78:160,bottom?23:20,8,false,'left');
        signature(12,bottom?1444:694,263,bottom?46:43);
      }
    });
  }
  return pdf;
}
