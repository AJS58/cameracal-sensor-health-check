
function generateHeatMapCanvas(){
  const hc=document.createElement('canvas');
  hc.width=canvas.width;
  hc.height=canvas.height;
  const hctx=hc.getContext('2d');

  hctx.drawImage(img,0,0,hc.width,hc.height);
  hctx.globalAlpha=0.45;

  [...spots,...manualSpots].forEach((s)=>{
    const radius=Math.max(40,s.r*6);
    const g=hctx.createRadialGradient(s.x,s.y,0,s.x,s.y,radius);

    let color='rgba(0,180,255,0.7)';
    if((s.area||0)>900) color='rgba(255,0,0,0.9)';
    else if((s.area||0)>140) color='rgba(255,140,0,0.8)';
    else color='rgba(255,230,0,0.7)';

    g.addColorStop(0,color);
    g.addColorStop(1,'rgba(255,255,255,0)');

    hctx.fillStyle=g;
    hctx.beginPath();
    hctx.arc(s.x,s.y,radius,0,Math.PI*2);
    hctx.fill();
  });

  return hc.toDataURL('image/png');
}

function updateCompareSlider(){
  const slider=document.getElementById('compareSlider');
  const wrap=document.getElementById('compareAfterWrap');
  if(!slider||!wrap) return;
  wrap.style.width=slider.value+'%';
}

const $ = id => document.getElementById(id);
const canvas = $('mainCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const loupe = $('loupe');
const loupeCanvas = $('loupeCanvas');
const loupeCtx = loupeCanvas ? loupeCanvas.getContext('2d') : null;
let img = new Image();
let originalData = null;
let cleanData = null;
let spots = [];
let manualSpots = [];
let overlay = true;
let cleanMode = false;
let scale = 1;
let currentFileName = '';
let paid = false;
let activeTool = 'pan';
let enlargeMode = false;

const els = ['detectBtn','cleanupBtn','saveBtn','toggleOverlay','toggleClean'];
function setEnabled(enabled){ els.forEach(id => $(id).disabled = !enabled); $('reportBtn').disabled = !(enabled && paid); }
function setPaid(v){ paid = v; $('reportBtn').disabled = !(v && originalData); }
$('paidToggle').addEventListener('change', e => setPaid(e.target.checked));
$('unlockBtn').addEventListener('click', () => { $('paidToggle').checked = true; setPaid(true); alert('Demo unlock enabled. In the live version this button would connect to Stripe/PayPal payment for the £6.99 report.'); });
$('sensitivity').addEventListener('input', e => $('sensValue').textContent=e.target.value);
$('minSize').addEventListener('input', e => $('sizeValue').textContent=e.target.value);

$('fileInput').addEventListener('change', e => {
  const file = e.target.files[0]; if(!file) return;
  const name = file.name || '';
  const isJpeg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(name);
  if(!isJpeg){
    alert('This version accepts JPEG files only. Please export a JPEG dust-test image and upload that file.');
    e.target.value = '';
    return;
  }
  currentFileName = file.name;
  const url = URL.createObjectURL(file);
  img.onload = () => { URL.revokeObjectURL(url); loadImageToCanvas(); };
  img.src = url;
});

function loadImageToCanvas(){
  const maxSide = 1800;
  let w = img.naturalWidth, h = img.naturalHeight;
  const r = Math.min(1, maxSide / Math.max(w,h));
  canvas.width = Math.round(w*r); canvas.height = Math.round(h*r);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  originalData = ctx.getImageData(0,0,canvas.width,canvas.height);
  cleanData = null; spots=[]; manualSpots=[]; scale=1; cleanMode=false; overlay=true;
  $('emptyState').style.display='none'; $('fileSummary').innerHTML = `<strong>${currentFileName}</strong><span>JPEG loaded — ${canvas.width} × ${canvas.height}px analysis preview</span>`; setEnabled(true); fitCanvas(); runDetection();
}

$('detectBtn').addEventListener('click', runDetection);

$('saveBtn').addEventListener('click', saveAnnotated);
$('toggleOverlay').addEventListener('click', ()=>{overlay=!overlay; cleanMode=false; render();});
$('viewOriginal').addEventListener('click', ()=>{overlay=false; cleanMode=false; render();});
/* clean view handler attached below */
/* report handler attached after generateReportWindow is defined */
$('zoomIn').addEventListener('click', ()=>{scale=Math.min(4,scale*1.2); applyScale();});
$('zoomOut').addEventListener('click', ()=>{scale=Math.max(.15,scale/1.2); applyScale();});
$('fitBtn').addEventListener('click', fitCanvas);
$('enlargeBtn').addEventListener('click', ()=>{
  if(!originalData) return alert('Please upload an image first.');
  enlargeMode=!enlargeMode;
  $('canvasWrap').classList.toggle('enlargeMode', enlargeMode);
  $('enlargeBtn').classList.toggle('active', enlargeMode);

  if(enlargeMode){
    // Enlarge is now an inspection tool: move or click on the image to inspect that area.
    updateLoupe(canvas.width/2, canvas.height/2, null);
  } else {
    if(loupe) loupe.hidden=true;
  }
});
$('resetBtn').addEventListener('click', ()=>{ if(originalData){spots=[];manualSpots=[];cleanData=null;cleanMode=false;overlay=true;ctx.putImageData(originalData,0,0);updateResults(null);} });
$('clearManual').addEventListener('click', ()=>{manualSpots=[]; render(); updateResults(summary());});
document.querySelectorAll('.tool').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tool').forEach(x=>x.classList.remove('active'));b.classList.add('active');activeTool=b.dataset.tool; const wrap=$('canvasWrap'); wrap.classList.toggle('markMode',activeTool==='mark'); wrap.classList.toggle('eraseMode',activeTool==='erase');}));
document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active'); if(originalData) runDetection();}));

canvas.addEventListener('click', e=>{
  if(!originalData) return;
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(canvas.width/rect.width);
  const y=(e.clientY-rect.top)*(canvas.height/rect.height);

  if(enlargeMode){
    updateLoupe(x,y,e);
    return;
  }

  if(activeTool==='pan') return;
  if(activeTool==='mark') manualSpots.push({x,y,r:16,area:800,manual:true});
  if(activeTool==='erase'){
    eraseAt(x,y);
  }
  render(); updateResults(summary());
});

canvas.addEventListener('mousemove', e=>{
  if(!originalData) return;
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)*(canvas.width/rect.width);
  const y=(e.clientY-rect.top)*(canvas.height/rect.height);

  if(enlargeMode){
    updateLoupe(x,y,e);
  }
});
canvas.addEventListener('mouseleave', ()=>{ if(loupe && !enlargeMode) loupe.hidden=true; });

function eraseAt(x,y){
  const eraseRadius = Math.max(34, canvas.width/42); // wider hit area so the tool feels reliable
  let removed = 0;
  const keep = s => {
    const d = Math.hypot(s.x-x,s.y-y);
    const threshold = Math.max(eraseRadius, (s.r||0)+22);
    const shouldRemove = d > threshold;
    if(!shouldRemove) removed++;
    return shouldRemove;
  };
  spots = spots.filter(keep);
  manualSpots = manualSpots.filter(keep);
  // Fallback: if the click was close but missed the wider threshold, remove the nearest spot.
  if(!removed){
    const all = [...spots.map((s,i)=>({s,i,list:'spots',d:Math.hypot(s.x-x,s.y-y)})), ...manualSpots.map((s,i)=>({s,i,list:'manual',d:Math.hypot(s.x-x,s.y-y)}))].sort((a,b)=>a.d-b.d);
    if(all[0] && all[0].d < eraseRadius*1.8){
      if(all[0].list==='spots') spots.splice(all[0].i,1); else manualSpots.splice(all[0].i,1);
    }
  }
}

function updateLoupe(x,y,e){
  if(!loupe || !loupeCtx || !originalData) return;
  const sourceSize = Math.max(70, Math.round(Math.min(canvas.width, canvas.height) / 7));
  const sx = Math.max(0, Math.min(canvas.width-sourceSize, x-sourceSize/2));
  const sy = Math.max(0, Math.min(canvas.height-sourceSize, y-sourceSize/2));

  loupeCtx.clearRect(0,0,loupeCanvas.width,loupeCanvas.height);
  loupeCtx.imageSmoothingEnabled = true;
  loupeCtx.drawImage(
    canvas,
    sx, sy,
    sourceSize,
    sourceSize*(loupeCanvas.height/loupeCanvas.width),
    0, 0,
    loupeCanvas.width,
    loupeCanvas.height
  );

  loupe.hidden=false;

  const wrap = $('canvasWrap').getBoundingClientRect();

  // Fixed lower-left placement keeps the loupe usable and prevents it disappearing off-screen.
  // It mirrors the earlier "image within image" behaviour.
  let lx = 26;
  let ly = Math.max(20, wrap.height - 170);

  // If the selected area is near the lower-left, place the loupe upper-right instead.
  const displayX = x * (parseFloat(canvas.style.width || canvas.width) / canvas.width);
  const displayY = y * (parseFloat(canvas.style.height || canvas.height) / canvas.height);
  if(displayX < 260 && displayY > wrap.height - 260){
    lx = Math.max(20, wrap.width - 230);
    ly = 26;
  }

  loupe.style.left = lx + 'px';
  loupe.style.top = ly + 'px';
  loupe.style.bottom = 'auto';
}



function isDustLikeComponent(c, w, h){
  const maxDim = Math.max(c.bw || 0, c.bh || 0);
  const minDim = Math.max(1, Math.min(c.bw || 1, c.bh || 1));
  const aspect = maxDim / minDim;
  const imageArea = w * h;
  const areaRatio = c.area / imageArea;

  // Reject broad sky/cloud/gradient patches.
  if(areaRatio > 0.012) return false;
  if(maxDim > Math.min(w,h) * 0.055) return false;

  // Reject long cloud edges / streak-like forms.
  if(aspect > 6 && c.area > 90) return false;

  // Genuine dust tends to be compact. Permit some irregular bonded debris,
  // but reject large, soft, low-compactness shapes.
  const compactness = c.area / Math.max(1, (c.bw || 1) * (c.bh || 1));
  if(compactness < 0.08 && c.area > 80) return false;

  return true;
}

function runDetection(){
  if(!originalData) return;
  // Sensitivity is user-facing detection strength: higher value = lower threshold / more detection.
  const strength = Number($('sensitivity').value);
  const minArea = Number($('minSize').value);
  const modeBtn = document.querySelector('.mode.active');
  const mode = modeBtn ? modeBtn.textContent.trim().toLowerCase() : 'standard';
  const w=canvas.width,h=canvas.height,data=originalData.data;
  const gray = new Uint8ClampedArray(w*h);
  let mean=0;
  for(let i=0,p=0;i<data.length;i+=4,p++){
    const g=Math.round((data[i]*.299+data[i+1]*.587+data[i+2]*.114));
    gray[p]=g; mean+=g;
  }
  mean/=gray.length;

  // Multi-scale local-background comparison. This handles normal small sensor dust AND extreme bonded debris.
  const r1 = mode.includes('aggressive') ? 11 : (mode.includes('high') ? 15 : 19);
  const r2 = mode.includes('aggressive') ? 35 : (mode.includes('high') ? 45 : 55);
  const blurSmall = boxBlur(gray,w,h,r1);
  const blurLarge = boxBlur(gray,w,h,r2);
  const threshold = Math.max(8, 62 - strength * 0.55); // 90 strength ≈ 12.5 threshold
  const absoluteDark = Math.max(18, mean - (mode.includes('aggressive') ? 42 : 55));
  const mask = new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++){
    const localDiff = Math.max(blurSmall[i]-gray[i], blurLarge[i]-gray[i]);
    const veryDark = gray[i] < absoluteDark;
    const obviousEdge = localDiff > threshold;
    // Combine local contrast and absolute darkness to avoid splitting large dark contamination into small pieces.
    if(obviousEdge || (veryDark && localDiff > threshold*.45)) mask[i]=1;
  }

  // Closing joins cracked/fragmented deposits into coherent contamination regions.
  const closed = closeMask(mask,w,h, mode.includes('aggressive') ? 2 : 1);
  spots = connectedComponents(closed,w,h,minArea, w*h).map(c=>({
    x:c.cx,
    y:c.cy,
    r:Math.max(5,Math.sqrt(c.area/Math.PI)*1.45),
    area:c.area,
    bw:c.bw,
    bh:c.bh,
    elong:c.elong
  }));
  render(); updateResults(summary());
}

function dilateMask(src,w,h,r){
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    let found=0;
    for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r)&&!found;yy++){
      for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++){
        if(src[yy*w+xx]){found=1;break;}
      }
    }
    out[y*w+x]=found;
  }
  return out;
}
function erodeMask(src,w,h,r){
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    let keep=1;
    for(let yy=Math.max(0,y-r);yy<=Math.min(h-1,y+r)&&keep;yy++){
      for(let xx=Math.max(0,x-r);xx<=Math.min(w-1,x+r);xx++){
        if(!src[yy*w+xx]){keep=0;break;}
      }
    }
    out[y*w+x]=keep;
  }
  return out;
}
function closeMask(src,w,h,r){ return erodeMask(dilateMask(src,w,h,r),w,h,r); }

function boxBlur(src,w,h,r){
  const out=new Uint8ClampedArray(w*h), tmp=new Uint32Array(w*h);
  for(let y=0;y<h;y++){
    let sum=0; for(let x=-r;x<=r;x++) sum+=src[y*w+Math.min(w-1,Math.max(0,x))];
    for(let x=0;x<w;x++){ tmp[y*w+x]=sum/(2*r+1); sum-=src[y*w+Math.max(0,x-r)]; sum+=src[y*w+Math.min(w-1,x+r+1)]; }
  }
  for(let x=0;x<w;x++){
    let sum=0; for(let y=-r;y<=r;y++) sum+=tmp[Math.min(h-1,Math.max(0,y))*w+x];
    for(let y=0;y<h;y++){ out[y*w+x]=sum/(2*r+1); sum-=tmp[Math.max(0,y-r)*w+x]; sum+=tmp[Math.min(h-1,y+r+1)*w+x]; }
  }
  return out;
}

function connectedComponents(mask,w,h,minArea,maxArea){
  const seen=new Uint8Array(w*h), comps=[];
  const qx=new Int32Array(w*h), qy=new Int32Array(w*h);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const start=y*w+x; if(!mask[start]||seen[start]) continue;
    let head=0,tail=0,area=0,sx=0,sy=0,minx=x,maxx=x,miny=y,maxy=y;
    qx[tail]=x;qy[tail++]=y;seen[start]=1;
    while(head<tail){
      const cx=qx[head],cy=qy[head++]; area++; sx+=cx; sy+=cy;
      if(cx<minx)minx=cx;if(cx>maxx)maxx=cx;if(cy<miny)miny=cy;if(cy>maxy)maxy=cy;
      for(const [dx,dy] of dirs){
        const nx=cx+dx, ny=cy+dy;
        if(nx<0||ny<0||nx>=w||ny>=h) continue;
        const ni=ny*w+nx;
        if(mask[ni]&&!seen[ni]){seen[ni]=1;qx[tail]=nx;qy[tail++]=ny;}
      }
    }
    const bw=maxx-minx+1,bh=maxy-miny+1,elong=Math.max(bw,bh)/Math.max(1,Math.min(bw,bh));
    if(area>=minArea && area<=maxArea) comps.push({area,cx:sx/area,cy:sy/area,bw,bh,elong});
  }
  return comps.sort((a,b)=>b.area-a.area).slice(0,900);
}


function imageDataToDataUrl(imageData){
  if(!imageData) return '';
  const c=document.createElement('canvas');
  c.width=imageData.width; c.height=imageData.height;
  const cctx=c.getContext('2d');
  cctx.putImageData(imageData,0,0);
  return c.toDataURL('image/png');
}

function createCleanPreview(){
  if(!originalData) return;
  const w=canvas.width,h=canvas.height;
  const out = new ImageData(new Uint8ClampedArray(originalData.data), w,h);
  const all=[...spots,...manualSpots];
  all.forEach(s=>{
    const rad=Math.ceil(Math.max(8,s.r*1.4));
    for(let yy=Math.max(0,Math.floor(s.y-rad)); yy<Math.min(h,Math.ceil(s.y+rad)); yy++){
      for(let xx=Math.max(0,Math.floor(s.x-rad)); xx<Math.min(w,Math.ceil(s.x+rad)); xx++){
        if(Math.hypot(xx-s.x,yy-s.y)>rad) continue;
        let rs=0,gs=0,bs=0,n=0;
        for(let a=0;a<16;a++){
          const ang=(Math.PI*2*a)/16, sx=Math.round(s.x+Math.cos(ang)*(rad+7)), sy=Math.round(s.y+Math.sin(ang)*(rad+7));
          if(sx>=0&&sy>=0&&sx<w&&sy<h){const p=(sy*w+sx)*4; rs+=originalData.data[p];gs+=originalData.data[p+1];bs+=originalData.data[p+2];n++;}
        }
        if(n){const p=(yy*w+xx)*4, blend=.86; out.data[p]=out.data[p]*(1-blend)+(rs/n)*blend; out.data[p+1]=out.data[p+1]*(1-blend)+(gs/n)*blend; out.data[p+2]=out.data[p+2]*(1-blend)+(bs/n)*blend;}
      }
    }
  });
  cleanData=out; cleanMode=true; render();

  try{
    const before=document.getElementById('compareBefore');
    const after=document.getElementById('compareAfter');
    const compareCanvas=document.createElement('canvas');
    compareCanvas.width=w; compareCanvas.height=h;
    compareCanvas.getContext('2d').putImageData(out,0,0);

    if(before) before.src=canvas.toDataURL('image/png');
    if(after) after.src=compareCanvas.toDataURL('image/png');

    const slider=document.getElementById('compareSlider');
    if(slider && !slider.dataset.bound){
      slider.addEventListener('input', updateCompareSlider);
      slider.dataset.bound='1';
      updateCompareSlider();
    }
  }catch(e){}

}


function cleanPreviewDataUrl(){
  if(!cleanData) createCleanPreview();
  if(!cleanData) return '';
  const c=document.createElement('canvas');
  c.width=cleanData.width;
  c.height=cleanData.height;
  const cctx=c.getContext('2d');
  cctx.putImageData(cleanData,0,0);
  return c.toDataURL('image/png');
}

function downloadCleanPreview(){
  if(!originalData) return alert('Please upload and analyse an image first.');
  if(!cleanData) createCleanPreview();
  const url=cleanPreviewDataUrl();
  if(!url) return alert('Clean preview could not be generated.');
  const a=document.createElement('a');
  const base=(currentFileName||'cameracal-image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9-_]+/gi,'-');
  a.download=base+'-cameracal-clean-preview.png';
  a.href=url;
  a.click();
}

function toggleCleanView(){
  if(!originalData) return alert('Please upload and analyse an image first.');
  if(!cleanData) createCleanPreview();
  cleanMode=!cleanMode;
  render();
}

function summary(){
  const all=[...spots,...manualSpots], count=all.length;
  const heavy=all.filter(s=>s.area>900 || Math.max(s.bw||0,s.bh||0)>32).length;
  const medium=all.filter(s=>!(s.area>900 || Math.max(s.bw||0,s.bh||0)>32) && (s.area>140 || Math.max(s.bw||0,s.bh||0)>12)).length;
  const small=Math.max(0,count-heavy-medium);
  let sev='Low', rec='No immediate action required';
  if(count>65||heavy>8){sev='Extreme';rec='Professional wet clean / inspection strongly recommended';}
  else if(count>40||heavy>3){sev='High';rec='Professional wet clean recommended';}
  else if(count>15||heavy>0){sev='Medium';rec='Dry/wet clean recommended';}
  else if(count>0){sev='Low';rec='Blower check or monitor';}
  const avg=count? all.reduce((a,s)=>a+s.area,0)/count:0;
  const largest=count? Math.max(...all.map(s=>s.area)):0;
  let pattern = count > 0 ? 'Very light / isolated contamination detected' : 'No significant contamination detected';

  // Meaningful detection threshold:
  // prevents noise, faint JPEG artefacts, subtle sky gradients or tiny isolated specks
  // from being reported as a contamination type.
  const meaningfulDetection = (
    count >= 8 ||
    heavy >= 1 ||
    largest > 450 ||
    avg > 160
  );

  if(meaningfulDetection){
    if(sev==='Extreme' || heavy>=5 || largest>3000) pattern='Possible organic residue / bonded debris';
    else if(heavy>=2 || avg>700) pattern='Possible oil / moisture pattern';
    else pattern='Likely dry dust';
  }
  
  const contaminationArea = count ? all.reduce((a,s)=>a + (Math.PI * Math.pow(Math.max(s.r||1, 1), 2)),0) : 0;
  const physicalCoverage = (canvas.width && canvas.height) ? Math.min(100, (contaminationArea / (canvas.width * canvas.height)) * 100) : 0;

  // Market-facing metric: estimated visible contamination impact, not literal sensor surface coverage.
  // This combines physical coverage, particle count, large/bonded contamination and cluster density.
  const densityImpact = canvas.width && canvas.height ? (count / ((canvas.width * canvas.height) / 1000000)) * 0.18 : count * 0.08;
  const visibleImpact = count > 0 ? Math.max(1, Math.min(100, Math.round((physicalCoverage * 4.2) + densityImpact + (heavy * 1.8)))) : 0;
  const coverage = visibleImpact;
  const healthScore = Math.max(0, Math.round(100 - Math.min(98, (coverage * 0.75) + (heavy * 1.5))));
  return {count,small,medium,large:heavy,sev,rec,pattern,coverage,physicalCoverage,healthScore,meaningfulDetection};

}

function apertureVisibility(s){
  // Single-image estimate for the paid report, based on count, heavy particles and estimated coverage.
  const heavyFactor = s.large * 4;
  const coverageFactor = (s.coverage || 0) * 12;
  const score = s.count + heavyFactor + coverageFactor;

  const pctFor = (multiplier) => {
    const pct = Math.max(0, Math.min(100, Math.round((score * multiplier))));
    return pct;
  };

  const riskFromPct = (pct) => {
    if(pct >= 80) return 'Extreme';
    if(pct >= 55) return 'High';
    if(pct >= 30) return 'Moderate';
    if(pct >= 12) return 'Low';
    return 'Minimal';
  };

  const make = (ap, multiplier, note) => {
    const pct=pctFor(multiplier);
    return {ap, pct, risk:riskFromPct(pct), note};
  };

  const rows = [
    make('f/4', 0.10, 'Only larger or bonded contamination is usually visible at wider apertures.'),
    make('f/5.6', 0.16, 'Large spots, residue and bonded debris may appear on plain skies or backgrounds.'),
    make('f/8', 0.28, 'Contamination can become noticeable on skies, studio backdrops and smooth tones.'),
    make('f/11', 0.42, 'Dust visibility increases significantly on skies, white backgrounds and studio backdrops.'),
    make('f/16', 0.68, 'This is a recommended dust-test aperture range and reveals most contamination.'),
    make('f/22', 0.90, 'Small particles, faint marks and bonded residue become much more visible.')
  ];
  const overall = rows.some(r=>r.risk==='Extreme')?'Extreme':rows.some(r=>r.risk==='High')?'High':rows.some(r=>r.risk==='Moderate')?'Moderate':rows.some(r=>r.risk==='Low')?'Low':'Minimal';
  return {overall, rows};
}

function updateResults(s){
  if(!s){$('spotCount').textContent='–';$('severity').textContent='–';$('pattern').textContent='–'; if($('recommendation')) $('recommendation').textContent='–'; if($('smallCount'))$('smallCount').textContent='–'; if($('mediumCount'))$('mediumCount').textContent='–'; if($('largeCount'))$('largeCount').textContent='–'; if($('apertureRisk'))$('apertureRisk').textContent='–';return;}
  $('spotCount').textContent=s.count; $('severity').textContent=s.sev; $('pattern').textContent=s.pattern; if($('recommendation')) $('recommendation').textContent=s.rec; if($('smallCount'))$('smallCount').textContent=s.small; if($('mediumCount'))$('mediumCount').textContent=s.medium; if($('largeCount'))$('largeCount').textContent=s.large; if($('apertureRisk'))$('apertureRisk').textContent=apertureVisibility(s).overall;
}
function render(){
  if(!originalData) return;
  ctx.putImageData(cleanMode&&cleanData?cleanData:originalData,0,0);
  if(overlay){
    ctx.save(); ctx.lineWidth=Math.max(2,canvas.width/900); ctx.strokeStyle='#ff3030'; ctx.fillStyle='rgba(255,48,48,.08)';
    [...spots,...manualSpots].forEach((s,i)=>{ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();ctx.stroke(); if(i<80){ctx.fillStyle='#ff3030';ctx.font=`${Math.max(12,canvas.width/120)}px Arial`;ctx.fillText(String(i+1),s.x+s.r+3,s.y);ctx.fillStyle='rgba(255,48,48,.08)';}});
    ctx.restore();
  }
}
function fitCanvas(){
  if(!canvas.width || !canvas.height){ scale=1; applyScale(); return; }
  const wrap = $('canvasWrap');
  const availW = Math.max(320, wrap.clientWidth - 24);
  const availH = Math.max(260, wrap.clientHeight - 24);
  scale = Math.min(availW / canvas.width, availH / canvas.height, 1.15);
  if(scale <= 0 || !isFinite(scale)) scale = 1;
  applyScale();
}
function applyScale(){
  canvas.style.width=(canvas.width*scale)+'px';
  canvas.style.height=(canvas.height*scale)+'px';
  $('zoomLabel').textContent=Math.round(scale*100)+'%';
}

function saveAnnotated(){
  render();
  const a=document.createElement('a');
  const base=(currentFileName||'cameracal-image').replace(/\.[^.]+$/,'').replace(/[^a-z0-9-_]+/gi,'-');
  a.download=base+'-cameracal-annotated-dust-map.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
}



function generateReportWindow(){
  if(!paid) return alert('Please unlock the full report first. In this demo version, use the £6.99 unlock button.');
  if(!originalData) return alert('Please upload and analyse an image first.');
  const s=summary();
  const av=apertureVisibility(s);
  if(!cleanData) createCleanPreview();
  render();
  const imgUrl=canvas.toDataURL('image/png');
  const cleanUrl=cleanPreviewDataUrl ? cleanPreviewDataUrl() : imageDataToDataUrl(cleanData);
  const logoUrl=document.querySelector('.brandLogo').src;
  const vsgoUrl='vsgo-air-move-blower.png';

  const confidenceOrganic = (s.count === 0 || lightDetection) ? 0 : Math.min(95, Math.round((s.large*5) + (s.coverage*8) + (s.count>100?35:15)));
  const confidenceMoisture = (s.count === 0 || lightDetection) ? 0 : Math.min(88, Math.round((s.large*3) + (s.coverage*5) + (s.pattern.includes('moisture')?35:20)));
  const confidenceDry = (s.count === 0 || lightDetection) ? 0 : Math.max(5, Math.round(100 - confidenceOrganic/1.4));
  const noDetection = s.count === 0;
  const lightDetection = s.count > 0 && !s.meaningfulDetection;

  const html=`<!doctype html><html><head><title>Cameracal Sensor Health Report</title><style>
    body{font-family:Arial,sans-serif;margin:0;color:#10223d;background:#fff}
    .page{padding:30px 34px;page-break-after:always}
    .head{display:flex;justify-content:space-between;align-items:center;border-bottom:4px solid #0057d8;padding-bottom:14px}
    .head img{width:420px;max-height:130px;object-fit:contain}
    h1{margin:0;color:#0057d8;font-size:34px} h2{color:#0057d8;margin-top:0}.red{color:#e00000}.orange{color:#f07800}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
    .card{border:1px solid #c9d9ef;border-radius:8px;padding:14px;background:#f8fbff}.card strong{display:block;font-size:26px;color:#0057d8}
    .map{max-width:100%;border:1px solid #c9d9ef;border-radius:10px}.clean{width:100%;border:1px solid #c9d9ef;border-radius:10px}
    .cta{border:2px solid #0057d8;padding:18px;border-radius:12px;background:#f1f7ff}.small{color:#56667d;font-size:12px;line-height:1.4}
    table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #c9d9ef;padding:10px;text-align:left}th{background:#f1f7ff;color:#0057d8}
    .contact{border-top:1px solid #c9d9ef;margin-top:18px;padding-top:12px}.bar{height:10px;background:#e9eef7;border-radius:8px;overflow:hidden;margin-top:6px}.bar span{display:block;height:100%;background:#0057d8}
    .product{display:grid;grid-template-columns:220px 1fr;gap:18px;align-items:center}.product img{max-width:210px;max-height:260px;object-fit:contain}.badge{display:inline-block;background:#e8f5ec;color:#14773b;padding:4px 8px;border-radius:20px;font-weight:bold;font-size:12px}
    .button{display:inline-block;background:#0057d8;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold}
    .heatLegend{display:flex;gap:14px;margin-top:12px}.heatItem{display:flex;align-items:center;gap:6px;font-size:13px}.heatSwatch{width:18px;height:18px;border-radius:4px}
    @media print{button{display:none}.page{break-after:page}}
  </style></head><body>

  <div class="page">
    <div class="head"><div><h1>Sensor Health Check Report</h1><p><b>Cameracal Services – The Camera Specialist</b><br>Dust Verification & Analysis Report</p></div><img src="${logoUrl}" alt="Cameracal Services"></div>
    <p><b>Report date:</b> ${new Date().toLocaleString()}<br><b>Image:</b> ${currentFileName||'Uploaded image'}<br><b>Report ID:</b> CS-${Date.now()}</p>
    <div class="grid">
      <div class="card">Total spots<strong>${s.count}</strong></div>
      <div class="card">Severity<strong class="${s.sev==='Extreme'?'red':''}">${s.sev}</strong></div>
      <div class="card">Visible contamination impact<strong>${s.coverage.toFixed(0)}%</strong></div>
      <div class="card">Health score<strong>${s.healthScore}/100</strong></div>
    </div>
    <p>This report analyses sensor contamination visible under dust-revealing conditions. Results depend on the supplied image and shooting conditions.</p><p class="small"><b>Visible Contamination Impact</b> is a practical severity estimate based on spot count, spot size, clustering and heavy contamination. It is not a literal measurement of physical sensor area covered.</p>
  </div>

  <div class="page">
    <h2>Dust Map & Distribution</h2>
    <img class="map" src="${imgUrl}">
    <div class="grid">
      <div class="card">Small<strong>${s.small}</strong><span class="small">1–4px</span></div>
      <div class="card">Medium<strong>${s.medium}</strong><span class="small">5–15px</span></div>
      <div class="card">Large / Heavy<strong>${s.large}</strong><span class="small">&gt;15px</span></div>
      <div class="card">Visible contamination impact<strong>${s.coverage.toFixed(0)}%</strong></div>
    </div>
  </div>

  <div class="page">
    <h2>Contamination Heat Map</h2>
    <img class="map" src="${generateHeatMapCanvas()}">
    <div class="heatLegend">
      <div class="heatItem"><span class="heatSwatch" style="background:#ff0000"></span>Red = heavy concentration / larger bonded contamination</div>
      <div class="heatItem"><span class="heatSwatch" style="background:#ff8c00"></span>Orange = moderate contamination clusters</div>
      <div class="heatItem"><span class="heatSwatch" style="background:#ffe600"></span>Yellow = lighter contamination or smaller dust particles</div>
    </div>
    ${noDetection ? `<p class="small"><b>No heat-map activity:</b> no measurable contamination clusters were detected, so no density zones are shown.</p>` : lightDetection ? `<p class="small"><b>Very light activity:</b> isolated marks were detected, but there are no meaningful contamination clusters or density zones.</p>` : `<p class="small">Heat map visualisation estimates contamination density and cluster severity across the sensor area.</p>`}
  </div>

  <div class="page">
    <h2>Clean Preview Simulation</h2>
    <div class="grid2">
      <div><h3>Detection Map</h3><img class="clean" src="${imgUrl}"></div>
      <div><h3>Automated Clean Preview</h3><img class="clean" src="${cleanUrl || imgUrl}"></div>
    </div>
    <p class="small">The automated clean preview is a visual simulation intended for plain skies, white backgrounds and dust-test images. It is not a replacement for professional retouching or physical sensor cleaning.</p>
  </div>

  <div class="page">
    <h2>Interpretation & Contamination Confidence</h2>
    <p><b>Observed pattern:</b> ${s.pattern}.</p>
    ${noDetection ? `
      <div class="cta">
        <h3>No measurable contamination detected</h3>
        <p>No significant dust spots, bonded debris clusters or residue patterns were detected from the supplied image.</p>
        <p>Contamination confidence classification has been suppressed because there is insufficient measurable evidence to identify a reliable contamination pattern.</p>
      </div>
      <p class="small">If contamination is still visible in real photographs, repeat the test using a plain blue sky or white background at f/16–f/22, with the lens deliberately defocused. Avoid prominent clouds or patterned backgrounds.</p>
    ` : lightDetection ? `
      <div class="cta">
        <h3>Very light / isolated contamination detected</h3>
        <p>${s.count} isolated mark${s.count===1?' was':'s were'} detected from the supplied image.</p>
        <p>The level detected is too low to produce a reliable contamination-type classification, so dust / bonded debris / oily residue confidence percentages have been suppressed.</p>
        <p>Recommended action: blower check, monitor, or re-test using a controlled f/16–f/22 dust-test image.</p>
      </div>
      <p class="small">Small isolated marks may not be visible in most everyday photographs, but may appear on plain skies, white backgrounds or smooth studio backdrops at smaller apertures.</p>
    ` : `
      <p>Where a contamination type is suggested, it is an indicative pattern only. Physical inspection may be required for confirmation, especially with suspected bonded debris, organic residue, oil or moisture-related contamination.</p>
      <div class="grid3">
        <div class="card">Dry dust / particles<strong>${confidenceDry}%</strong><div class="bar"><span style="width:${confidenceDry}%"></span></div></div>
        <div class="card">Organic / bonded debris<strong>${confidenceOrganic}%</strong><div class="bar"><span style="width:${confidenceOrganic}%"></span></div></div>
        <div class="card">Moisture / oily residue<strong>${confidenceMoisture}%</strong><div class="bar"><span style="width:${confidenceMoisture}%"></span></div></div>
      </div>
      <p class="small">Confidence levels are indicative only. Physical inspection may be required for confirmation.</p>
    `}
  </div>

  <div class="page">
    <h2>Aperture Visibility Estimate</h2>
    <p>This paid report includes an estimated guide to how likely the detected contamination is to be visible at wider and smaller apertures. This is calculated from the supplied dust-test image, total spot count, estimated visible contamination impact and heavy contamination level.</p>
    <table><thead><tr><th>Aperture</th><th>Estimated Visible Contamination</th><th>Estimated Visibility Risk</th><th>Comment</th></tr></thead><tbody>${av.rows.map(r=>`<tr><td><b>${r.ap}</b></td><td><b>${r.pct}%</b></td><td><b>${r.risk}</b></td><td>${r.note}</td></tr>`).join('')}</tbody></table>
    <p class="small">For a true measured aperture comparison, upload a controlled set of images taken at f/4, f/5.6, f/8, f/11, f/16 and f/22. This can be added as a future Pro report mode.</p>
  </div>

  <div class="page">
    <h2>Recommended Prevention Tool</h2>
    <div class="cta product">
      <img src="${vsgoUrl}" alt="VSGO Air-Move Filter Blower">
      <div>
        <span class="badge">Recommended</span>
        <h3 style="color:#0057d8">VSGO Air-Move Filter Blower</h3>
        <p>To help minimise future sensor contamination, Cameracal Services recommends periodic use of a filtered air blower system.</p>
        <ul>
          <li>Helps reduce airborne dust entering the camera chamber</li>
          <li>Useful before and after lens changes</li>
          <li>Particularly useful for mirrorless cameras and outdoor work</li>
          <li>Suitable for preventative maintenance only</li>
        </ul>
        <p><b>Available from Cameracal Services</b></p>
      </div>
    </div>
    <p class="small">This recommendation relates to preventative airflow maintenance only. This report does not recommend customer wet cleaning or sensor swab use.</p>
  </div>

  <div class="page">
    <h2>Professional Sensor Cleaning</h2>
    <p><b>${lightDetection ? 'Very light isolated contamination detected — blower check or monitor recommended' : s.rec}</b></p>
    <div class="cta">
      <p>Where contamination becomes bonded, oily, moisture related, organic, or resistant to filtered air cleaning, professional sensor cleaning may be required.</p>
      <h3>CAMERACAL SERVICES</h3>
      <p>Professional sensor cleaning, contamination diagnostics, autofocus calibration and camera health checks.</p>
      <p><b>07540 877068</b><br>info@cameracalservices.co.uk<br>www.cameracalservices.co.uk</p>
      <p><a class="button" href="mailto:info@cameracalservices.co.uk?subject=Sensor%20cleaning%20booking%20request">Book a Sensor Clean</a></p>
    </div>
  </div>

  <button onclick="window.print()" style="position:fixed;right:20px;top:20px;padding:12px 18px">Print / Save as PDF</button></body></html>`;
  const w=window.open('','_blank'); w.document.write(html); w.document.close();
}


// Information modals for top navigation
(function(){
  const modal = document.getElementById('infoModal');
  const title = document.getElementById('modalTitle');
  const content = document.getElementById('modalContent');
  const close = document.getElementById('modalClose');
  const how = document.getElementById('howBtn');
  const help = document.getElementById('helpBtn');
  const show = (heading, html) => { title.textContent = heading; content.innerHTML = html; modal.hidden = false; };
  if (how) how.addEventListener('click', () => show('How it works', `
    <ol class="modalList">
      <li><b>Choose JPEG as the recommended version</b> for this app.</li>
      <li><b>Take a dust-test image</b> at F16 / F22, ideally of a plain white background or blue sky.</li>
      <li><b>Upload the JPEG</b> into the app and run Auto Detect to highlight visible dust, debris, smears or bonded contamination.</li>
      <li><b>Review the result</b> using the manual Add Mark and improved Erase tools if required.</li>
      <li><b>Generate the paid report</b> to unlock the PDF, aperture visibility estimate and cleaning recommendation.</li>
    </ol>
    <p>The report is designed to help decide whether a blower clean, wet clean, or professional Cameracal Services sensor clean is recommended.</p>`));
  if (help) help.addEventListener('click', () => show('Help', `
    <h3>Recommended image</h3>
    <p>Use a JPEG image taken at F16 / F22 of a plain bright subject. Defocus the lens slightly and avoid patterned backgrounds.</p><p>Avoid clouds, trees, buildings, strong sky gradients or textured backgrounds, as these can confuse detection and may be mistaken for contamination.</p>
    <h3>Manual tools</h3>
    <p><b>Add Mark</b> allows you to click missed contamination. <b>Erase</b> now uses a wider removal area and removes the nearest detected or manually added mark near the cursor. <b>Clear All</b> removes manual adjustments.</p>
    <h3>Report access</h3>
    <p>The free preview shows the detection result. The full PDF report, downloadable overlay and aperture visibility guidance are unlocked after payment.</p>
    <h3>Need a clean?</h3>
    <p>Use the Book a Sensor Clean button or contact Cameracal Services on 07540 877068.</p>`));
  if (close) close.addEventListener('click', () => modal.hidden = true);
  if (modal) modal.addEventListener('click', (e) => { if(e.target === modal) modal.hidden = true; });
  window.addEventListener('keydown', e => { if(e.key === 'Escape' && modal && !modal.hidden) modal.hidden = true; });
})();


try{
  const cleanExportBtn = document.getElementById('cleanupBtn');
  if(cleanExportBtn && !cleanExportBtn.dataset.cleanExportBound){
    cleanExportBtn.addEventListener('click', downloadCleanPreview);
    cleanExportBtn.dataset.cleanExportBound='1';
  }
  const toggleCleanBtn = document.getElementById('toggleClean');
  if(toggleCleanBtn && !toggleCleanBtn.dataset.toggleCleanBound){
    toggleCleanBtn.addEventListener('click', toggleCleanView);
    toggleCleanBtn.dataset.toggleCleanBound='1';
  }
}catch(e){}


// Final robust control bindings
(function(){
  const bind = (id, fn) => {
    const el=document.getElementById(id);
    if(el && !el.dataset.finalBound){
      el.addEventListener('click', fn);
      el.dataset.finalBound='1';
    }
  };
  bind('reportBtn', generateReportWindow);
  bind('cleanupBtn', downloadCleanPreview);
  bind('toggleClean', toggleCleanView);
  bind('zoomIn', ()=>{scale=Math.min(4,scale*1.2); applyScale();});
  bind('zoomOut', ()=>{scale=Math.max(.15,scale/1.2); applyScale();});
  bind('fitBtn', fitCanvas);
  bind('enlargeBtn', ()=>{
    if(!originalData) return alert('Please upload an image first.');
    enlargeMode=!enlargeMode;
    $('canvasWrap').classList.toggle('enlargeMode', enlargeMode);
    $('enlargeBtn').classList.toggle('active', enlargeMode);
    if(enlargeMode){ updateLoupe(canvas.width/2, canvas.height/2, null); }
    else { if(loupe) loupe.hidden=true; }
  });
})();



/* FINAL REPLACEMENT: Standalone Enlarge / Loupe Tool
   This deliberately bypasses earlier enlarge handlers. */
(function(){
  const btn = document.getElementById('enlargeBtn');
  const main = document.getElementById('mainCanvas');
  const wrap = document.getElementById('canvasWrap');
  if(!btn || !main || !wrap) return;

  let enabled = false;
  let pinned = false;

  let lens = document.getElementById('finalLoupeLens');
  if(!lens){
    lens = document.createElement('div');
    lens.id = 'finalLoupeLens';
    lens.innerHTML = '<canvas id="finalLoupeCanvas" width="260" height="190"></canvas><span class="loupeLabel">3x</span><span class="loupeHint">click to pin</span>';
    wrap.appendChild(lens);
  }

  const loupeCanvas = document.getElementById('finalLoupeCanvas');
  const lctx = loupeCanvas.getContext('2d');

  function canvasPoint(evt){
    const r = main.getBoundingClientRect();
    return {
      x: (evt.clientX - r.left) * (main.width / r.width),
      y: (evt.clientY - r.top) * (main.height / r.height),
      displayX: evt.clientX - wrap.getBoundingClientRect().left,
      displayY: evt.clientY - wrap.getBoundingClientRect().top
    };
  }

  function drawLoupeFromPoint(p){
    if(!main.width || !main.height) return;

    const sourceW = Math.max(80, Math.round(main.width / 8));
    const sourceH = Math.round(sourceW * (loupeCanvas.height / loupeCanvas.width));

    const sx = Math.max(0, Math.min(main.width - sourceW, p.x - sourceW / 2));
    const sy = Math.max(0, Math.min(main.height - sourceH, p.y - sourceH / 2));

    lctx.clearRect(0,0,loupeCanvas.width,loupeCanvas.height);
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(main, sx, sy, sourceW, sourceH, 0, 0, loupeCanvas.width, loupeCanvas.height);

    lens.style.display = 'block';

    const wrapRect = wrap.getBoundingClientRect();
    let lx = p.displayX + 28;
    let ly = p.displayY + 28;

    if(lx + 280 > wrapRect.width) lx = p.displayX - 290;
    if(ly + 210 > wrapRect.height) ly = p.displayY - 220;
    if(lx < 12) lx = 12;
    if(ly < 12) ly = 12;

    lens.style.left = lx + 'px';
    lens.style.top = ly + 'px';
  }

  function setEnabled(state){
    enabled = state;
    pinned = false;
    btn.classList.toggle('active', enabled);
    wrap.classList.toggle('enlargeMode', enabled);
    btn.textContent = enabled ? '↗ Enlarge: ON' : '↗ Enlarge';

    if(!enabled){
      lens.style.display = 'none';
    } else {
      // show centre preview immediately so the user can see the tool is active
      const r = main.getBoundingClientRect();
      const wr = wrap.getBoundingClientRect();
      drawLoupeFromPoint({
        x: main.width / 2,
        y: main.height / 2,
        displayX: (r.left - wr.left) + (r.width / 2),
        displayY: (r.top - wr.top) + (r.height / 2)
      });
    }
  }

  btn.addEventListener('click', function(e){
    e.preventDefault();
    e.stopImmediatePropagation();
    if(!main.width || !main.height){
      alert('Please upload an image first.');
      return;
    }
    setEnabled(!enabled);
  }, true);

  main.addEventListener('mousemove', function(e){
    if(!enabled || pinned) return;
    drawLoupeFromPoint(canvasPoint(e));
  }, true);

  main.addEventListener('click', function(e){
    if(!enabled) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    drawLoupeFromPoint(canvasPoint(e));
    pinned = !pinned;
    lens.classList.toggle('pinned', pinned);
  }, true);

  main.addEventListener('mouseleave', function(){
    if(enabled && !pinned){
      lens.style.display = 'none';
    }
  }, true);
})();
