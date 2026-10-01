import { draft, renderPatternSVG } from './pattern.js';
import { GarmentViewer } from './viewer.js';

const $ = id => document.getElementById(id);
const key = 'xiaochi-triangle-studio-v2';
const numeric = ['waist','hip','reductionPct','frontLength','backLength','gussetLength','gussetFront','gussetBack','sideSeam','seamShift','seamAllowance','edgeAllowance','waistElasticPct','legElasticPct','overlap','waistOpeningOverride','legOpeningOverride','frontElasticPct','gussetElasticPct','backElasticPct','frontLegOverride','gussetLegOverride','backLegOverride'];
const extra = ['fabric','finish','join','notes'];
const fields = [...numeric,...extra];
const sizes = ['S','M','L','XL','XXL','3XL'];
const exampleTable = {S:{waist:68,hip:88},M:{waist:72,hip:92},L:{waist:76,hip:96},XL:{waist:80,hip:100},XXL:{waist:84,hip:104},'3XL':{waist:88,hip:108}};
let table = structuredClone(exampleTable), tableName='演示尺码表', selectedSize='XXL', mode='fixed', rise='mid';
let measured = {waist:'84',hip:'104'}, manualIsExample=true, current=null, view='wear', bodyVisible=true, autoRotate=false, selectedPiece=null, step=0, timer=null, zoom=100;
let riseProfiles={mid:{frontLength:'18',backLength:'21',sideSeam:'9'},high:{frontLength:'26',backLength:'29',sideSeam:'17'}};
let legMode='uniform';
const n=value=>Number(value).toFixed(1);
const text=(id,value)=>$(id).textContent=value;
let viewer;
const descriptions = [
  '裁出前片 1 块、后片 1 块、裆外片 1 块、裆里片 1 块。四张纸样均为整片；最大弹力方向沿腰臀横向。裆里与裆外重叠使用。',
  '先将前片的 A 接口夹在裆外片和裆里片之间，按缝份缝合；再以卷裹法将后片 B 接口夹缝，翻回正面。两层裆片重叠，缝份藏在夹层内。',
  '后片两侧绕过身体正侧面，与前片正面相对，对齐左右 C 拼缝分别缝合。前后片对应 C 边等长；原侧线只作定位参考，不再缝一道。检查裆部无扭转，再检查腰口和两个腿口是否连成完整一圈。',
  '分别接好 1 条腰带、2 条腿带，均分标记开口和松紧带，按选定收口工艺均匀安装。只拉伸松紧带到开口长度；先试穿，检查腰腿是否勒或翘边。'
];
function read(){const params=Object.fromEntries(numeric.map(id=>[id,$(id).value]));return {...params,rise,legElasticMode:legMode,finish:$('finish').value,join:$('join').value};}
function validTable(t){return t && sizes.every(size=>t[size]&&Number.isFinite(t[size].waist)&&t[size].waist>=45&&t[size].waist<=180&&Number.isFinite(t[size].hip)&&t[size].hip>=60&&t[size].hip<=200&&t[size].hip>=t[size].waist);}
function fixed(){const t=table[selectedSize];$('waist').value=t.waist;$('hip').value=t.hip;}
function dirty(){text('save-status','有修改，尚未保存');}
function updateMode(){
  ['fixed','measured'].forEach(m=>{$(m+'-mode').classList.toggle('active',mode===m);$(m+'-mode').setAttribute('aria-pressed',String(mode===m));});
  $('fixed-options').hidden=mode!=='fixed';['waist','hip'].forEach(id=>$(id).readOnly=mode==='fixed');
  document.querySelectorAll('button[data-size]').forEach(b=>{b.classList.toggle('selected',b.dataset.size===selectedSize);b.setAttribute('aria-pressed',String(b.dataset.size===selectedSize));});
  document.querySelectorAll('[data-rise]').forEach(b=>{b.classList.toggle('selected',b.dataset.rise===rise);b.setAttribute('aria-pressed',String(b.dataset.rise===rise));});
  text('size-source',tableName);
  text('input-note',mode==='fixed'?'来自「'+tableName+'」。请用自己店里的尺码表替换演示值。':manualIsExample?'当前数值为演示，请填实际腰口位置的一圈及臀部最丰满的一圈。':'已使用您填写的尺寸。高腰和中腰应分别量实际腰口位置。');
}
function setMode(next){if(next===mode)return;if(mode==='measured')measured={waist:$('waist').value,hip:$('hip').value};mode=next;if(mode==='fixed')fixed();else{ $('waist').value=measured.waist;$('hip').value=measured.hip;}updateMode();render();dirty();}
function metric(id,value){$(id).replaceChildren(document.createTextNode(value==null?'—':n(value)));const small=document.createElement('small');small.textContent='cm';$(id).append(small);}
function row(label,value,note){const tr=document.createElement('tr');[label,value,note].forEach(t=>{const td=document.createElement('td');td.textContent=t;tr.append(td);});return tr;}
function render(){
  const result=draft(read());
  if($('finish').value==='foe' && Number($('edgeAllowance').value)!==0){result.valid=false;result.errors.push('对折包边工艺的腰腿口直接按净边裁，裁边预留应为 0 cm。');}
  if(Number($('waistElasticPct').value)>100 || (legMode==='uniform'&&Number($('legElasticPct').value)>100)){result.valid=false;result.errors.push('本款安装方式要求松紧带净圈不长于布边开口，腰带、腿带比例请不超过 100%。');}
  current=result.valid?result:null;
  $('errors').hidden=result.valid;$('errors').replaceChildren();
  result.errors.forEach(message=>{const p=document.createElement('div');p.textContent=message;$('errors').append(p);});
  ['export-sheet','save','download-pattern','print-download','export-params'].forEach(id=>$(id).disabled=!result.valid);
  $('stage').classList.toggle('invalid-params',!result.valid);
  if(!current)renderDistribution();
  text('rise-caption',rise==='mid'?'中腰':'高腰');text('reduction-output',$('reductionPct').value);
  text('finish-note',$('finish').value==='foe'?'对折包边带夹住净边，腰腿口通常不另加翻折量。当前腰腿预留 '+n($('edgeAllowance').value)+' cm，拼缝预留 '+n($('seamAllowance').value)+' cm。':'内折松紧带须按实际带宽与翻折方法设置腰腿裁边预留。当前预留 '+n($('edgeAllowance').value)+' cm；请核对工艺，勿凭面料名决定。');
  if(!current){metric('waist-elastic',null);metric('leg-elastic',null);text('waist-elastic-formula','请先修正左侧参数');text('leg-elastic-formula','请先修正左侧参数');text('seam-length','—');text('seam-position-status','请修正尺寸后查看拼缝位置。');$('dimensions-body').replaceChildren();$('pattern-drawing').replaceChildren();text('opening-mode','参数待修正');return;}
  const d=current.dimensions,p=current.params;
  descriptions[2]=p.seamShift>0?'后片两侧绕过身体正侧面，与前片正面相对，对齐左右 C 拼缝分别缝合。前后片对应 C 边等长；原侧线只作定位参考，不再缝一道。检查裆部无扭转，再检查腰口和两个腿口是否连成完整一圈。':'前后片正面相对，对齐左右 C 拼缝分别缝合。前移量为 0，C 拼缝在原正侧线位置；检查裆部无扭转，再检查腰口和两个腿口是否连成完整一圈。';
  if(step===2)text('assembly-description',descriptions[2]);
  text('seam-length',n(d.sideSeamLength)+' cm');
  text('seam-position-status',p.seamShift>0?'左右各向前移 '+n(p.seamShift)+' cm；后片绕过侧腰，C 拼缝位于前侧。':'向前移 0 cm：C 拼缝回到原侧线，便于比较。');
  metric('waist-elastic',d.waistElastic);metric('leg-elastic',d.legElastic);
  const waistBasis=p.waistOpeningOverride??d.waistOpening,legBasis=p.legOpeningOverride??d.legOpening;
  text('waist-elastic-formula',n(waistBasis)+' × '+n(p.waistElasticPct)+'% + '+n(p.overlap)+' = '+n(d.waistElastic)+' cm');
  text('leg-elastic-formula',n(legBasis)+' × '+n(p.legElasticPct)+'% + '+n(p.overlap)+' = '+n(d.legElastic)+' cm');
  if(legMode==='segmented'&&d.legSegments)text('leg-elastic-formula',d.legSegments.map(s=>n(s.elasticLength)).join(' + ')+' + 接头 '+n(p.overlap)+' = '+n(d.legElastic)+' cm');
  text('opening-mode',legMode==='segmented'?'腿口按前 / 裆 / 后分段计算':(p.waistOpeningOverride||p.legOpeningOverride)?'包含实测开口覆盖值':'按纸样净开口计算');
  $('pattern-drawing').innerHTML=renderPatternSVG(current,{showDimensions:true,showAllowance:true,showGrain:true});
  updateZoom();renderDimensions();renderDistribution();viewer?.update(current);
}
function dimensions(){
  const {dimensions:d,params:p,pieces}=current;
  const piecesRows=pieces.map(piece=>[piece.name+'整片裁布外框',n(piece.width)+' × '+n(piece.height),'外轮廓包围尺寸，已含预留；沿纸样曲线裁，不剪成矩形']);
  return [
    ['人体腰口 / 臀围',n(p.waist)+' / '+n(p.hip),'腰口围度量实际穿着高度；固定尺码来源：'+(mode==='fixed'?tableName:'实测')],
    ['目标净腰口 / 臀横总宽',n(d.waistOpening)+' / '+n(d.hipFinished),'围度减 '+n(p.reductionPct)+'% 试样收紧；拼缝前移保留腰口与腿口净边总长'],
    ['左右 C 拼缝向前移',n(p.seamShift),'从原正侧参考沿净样腰边各向前量；一指半请实测，3 cm 仅演示'],
    ['前片 / 后片腰口净边长',n(d.frontWaistWidth)+' / '+n(d.backWaistWidth),'前片两侧转给后片；这是沿腰边的长度，不能用直尺量后片外框代替'],
    ['前 / 后中线净长',n(p.frontLength)+' / '+n(p.backLength),'腰口中心到裆拼缝，不包含裆片'],
    ['原侧线参考长',n(p.sideSeam),p.seamShift>0?'用于构造原版轮廓；前移后只作定位参考，不另缝一道':'前移量为 0，C 拼缝与原正侧线重合'],
    ['左右 C 拼缝净长',n(d.sideSeamLength),'前后片对应 C 边等长；'+(p.seamShift>0?'位于前侧':'位于原正侧线')+'，两边各缝一次'],
    ['每腿由前片转给后片的弧长',n(d.transferredLegArc),'C 拼缝前移后按新前后边界分配腿带；全腿净弧长保持不变'],
    ['裆片长 / 前端宽 / 后端宽',n(p.gussetLength)+' / '+n(p.gussetFront)+' / '+n(p.gussetBack),'裆外与裆里同形重叠；A接前片、B接后片'],
    ['纵向总净长',n(p.frontLength+p.gussetLength+p.backLength),'前中线 + 裆中线 + 后中线；用合身样裤校正'],
    ['单腿三段弧长',n(d.frontLegArc)+' + '+n(d.gussetSideArc)+' + '+n(d.backLegArc),'前片腿边 + 一条裆侧边 + 后片腿边（含侧前段）；裆里不重复计算'],
    ['纸样单腿口整圈',n(d.legOpening),'左右对称；已排除侧缝与裆接缝的缝份'],
    ['腰 / 腿带计算开口',n(p.waistOpeningOverride??d.waistOpening)+' / '+n(d.legElasticBasis),legMode==='segmented'?'腿口取三段计算基准之和；实测覆盖不改变纸样':p.waistOpeningOverride||p.legOpeningOverride?'部分采用实测覆盖，仅影响带长，不改变纸样':'当前采用纸样净开口'],
    ['腰松紧带裁长',n(d.waistElastic)+' × 1 条','已包含每条 '+n(p.overlap)+' cm 接头用量'],
    ['每条腿松紧带裁长',n(d.legElastic)+' × 2 条','两条共 '+n(d.legElastic*2)+' cm，接头已分别计入'],
    ...(d.legSegments||[]).map(s=>[s.name+'带长分配',n(s.basisLength)+' × '+n(s.ratioPct)+'% = '+n(s.elasticLength),'净圈从 C 拼缝起量 '+n(s.startMark)+' → '+n(s.endMark)+' cm；接头预留不参与分段']),
    ['拼缝 / 腰腿裁边预留',n(p.seamAllowance)+' / '+n(p.edgeAllowance),$('finish').selectedOptions[0].textContent],
    ...piecesRows
  ];
}
function renderDimensions(){$('dimensions-body').replaceChildren(...dimensions().map(values=>row(...values)));}
function setView(next){view=next;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);b.setAttribute('aria-pressed',String(b.dataset.view===next));});text('stage-title',next==='wear'?'一条内裤，四片布。':next==='explode'?'把接缝的关系，看清楚。':'沿着同一张纸样，展开。');viewer?.setView(next);if(next==='wear')viewer?.setBodyVisible(bodyVisible);}
function setStep(index){step=index;document.querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',Number(b.dataset.step)===step));text('assembly-description',descriptions[step]);setView(step===0?'flat':step===1?'explode':'wear');viewer?.setAssembly(step);}
function stopAnimation(){if(timer){clearInterval(timer);timer=null;text('play-assembly','播放拼接演示 ▶');}}
function updateZoom(){$('pattern-drawing').style.width=zoom+'%';text('pattern-zoom',zoom+'%');}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadPattern(){if(!current)return;download(renderPatternSVG(current),'小尺_'+(rise==='high'?'高腰':'中腰')+'_'+(mode==='fixed'?selectedSize:'定制')+'_试裁纸样_实际尺寸.svg','image/svg+xml;charset=utf-8');}
function getReport(){if(!current)return '';const p=current.params;return [
  '小尺 · 女士三角内裤试裁尺寸单',
  '日期：'+new Date().toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'}),
  '款式：'+(rise==='high'?'高腰':'中腰')+'女士三角内裤；输入方式：'+(mode==='fixed'?'固定尺码 '+selectedSize+'（'+tableName+'）':'实测腰臀围'),
  '面料记录：'+$('fabric').value,
  '工艺：'+$('finish').selectedOptions[0].textContent+'；接头方式：'+$('join').selectedOptions[0].textContent,
  '拼缝位置：左右各从身体正侧面向前移 '+n(p.seamShift)+' cm；一指半请实测，3 cm 只是演示。',
  '尺码表、4%面料收紧、95%松紧比例与预填纵向尺寸均为可修改示例，不是通用标准。',
  '',...dimensions().map(([label,value,note])=>label+'：'+value+' cm\n  '+note),
  '', '计算公式：',
  '腰带裁长 = '+n(p.waistOpeningOverride??current.dimensions.waistOpening)+' × '+n(p.waistElasticPct)+'% + '+n(p.overlap)+' = '+n(current.dimensions.waistElastic)+' cm（1条）',
  '腿带裁长：'+$('leg-elastic-formula').textContent+'（每条，共2条）',
  '', '缝制顺序：',...descriptions.map((value,index)=>(index+1)+'. '+value),
  '', '试穿记录：',$('notes').value||'尚未填写',
  '', '适用范围：参数化教学与试裁模板；腰臀围不足以确定真实裆部与腿口合体性。3D仅展示结构，没有进行布料物理仿真。先用相近弹性样布试穿，校正裆弯、包覆与松紧张力，再裁正式面料。',
  '纸样输出：4块整片，SVG实际尺寸带10cm校准框。不自动A4分页；按100%打印并量框确认。'
].join('\n');}
function snapshot(){return {version:2,fields:Object.fromEntries(fields.map(id=>[id,$(id).value])),mode,rise,riseProfiles,legMode,selectedSize,measured,manualIsExample,table,tableName};}
function restore(){try{const saved=JSON.parse(localStorage.getItem(key));if(!saved||saved.version!==2||!saved.fields||!validTable(saved.table))return;fields.forEach(id=>{if(typeof saved.fields[id]==='string'&&saved.fields[id].length<=2000)$(id).value=saved.fields[id];});table=saved.table;tableName=typeof saved.tableName==='string'?saved.tableName.slice(0,40):'已保存尺码表';selectedSize=sizes.includes(saved.selectedSize)?saved.selectedSize:'XXL';mode=saved.mode==='measured'?'measured':'fixed';rise=saved.rise==='high'?'high':'mid';if(saved.measured&&typeof saved.measured.waist==='string'&&typeof saved.measured.hip==='string')measured=saved.measured;manualIsExample=saved.manualIsExample!==false;if(!$('fabric').value)$('fabric').selectedIndex=0;if(!$('finish').value)$('finish').value='foe';if(!$('join').value)$('join').value='sewn';text('save-status','已恢复上次保存的方案');}catch{/* Unavailable or corrupt local storage leaves the visible defaults intact. */}}
function fillTable(source,name){$('table-name').value=name;$('size-table-body').replaceChildren();$('size-table-error').hidden=true;sizes.forEach(size=>{const tr=document.createElement('tr');const title=document.createElement('td');title.textContent=size;tr.append(title);['waist','hip'].forEach(part=>{const td=document.createElement('td');const input=document.createElement('input');input.type='number';input.step='0.1';input.value=source[size][part];input.dataset.size=size;input.dataset.part=part;input.setAttribute('aria-label',size+(part==='waist'?' 腰围':' 臀围'));td.append(input);tr.append(td);});$('size-table-body').append(tr);});}

function syncLegMode(){
  const segmented=legMode==='segmented';
  document.querySelector('.leg-distribution').classList.toggle('segmented',segmented);
  document.querySelectorAll('[data-leg-mode]').forEach(button=>{button.classList.toggle('active',button.dataset.legMode===legMode);button.setAttribute('aria-pressed',String(button.dataset.legMode===legMode));});
  $('legElasticPct').disabled=segmented;$('legOpeningOverride').disabled=segmented;
  ['frontElasticPct','gussetElasticPct','backElasticPct','frontLegOverride','gussetLegOverride','backLegOverride'].forEach(id=>$(id).disabled=!segmented);
  descriptions[3]=segmented?'分别接好 1 条腰带、2 条腿带。每条腿带从 C 拼缝对应点起量 A、B 记号，按前腿弯、裆侧、后腿弯逐段对齐，各段内部均匀安装。接头额外用量不参与分区分配，分界处逐渐调整拉力，先试缝再试穿。':'分别接好 1 条腰带、2 条腿带，均分标记开口和松紧带，按选定收口工艺均匀安装。只拉伸松紧带到开口长度；先试穿，检查腰腿是否勒或翘边。';
  if(step===3)text('assembly-description',descriptions[3]);
}
function renderDistribution(){
  const d=current?.dimensions,segments=d?.legSegments||[];
  ['front','gusset','back'].forEach(id=>{const segment=segments.find(s=>s.id===id);text(id+'-cloth-length',segment?n(segment.basisLength)+' cm':'—');text(id+'-band-length',segment?n(segment.elasticLength)+' cm':'—');});
  document.querySelectorAll('.uniform-ratio').forEach(el=>el.textContent=n($('legElasticPct').value));
  text('distribution-note',legMode==='uniform'?'同一比例表示各段都按相同缩短幅度安装，三段布边并不等长。这里显示的是带长比例，不是拉力。':'前100% / 裆100% / 后95%只是演示。后片比例同时作用于绕到前侧的窄翼；拼缝前移会改变分区带长，先试穿确认，比例越小收得越多。');
  ['cloth-bar','elastic-bar'].forEach(id=>$(id).replaceChildren());
  if(!current){text('band-marks','请先补齐有效尺寸，再计算分段记号。');return;}
  if(!segments.length){text('band-marks','当前只有实测整圈长，无法知道三段分别多长。要分区，请切换后填写三段实测值。');return;}
  const total=segments.reduce((sum,s)=>sum+s.basisLength,0);
  for(const segment of segments){for(const [id,field] of [['cloth-bar','basisLength'],['elastic-bar','elasticLength']]){const block=document.createElement('span');block.className='strip-'+segment.id;block.style.width=(segment[field]/total*100)+'%';block.textContent=n(segment[field])+' cm';block.title=segment.name+' '+n(segment[field])+' cm';$(id).append(block);}}
  text('band-marks','先接好带：C 拼缝起点 0 → A 记号 '+n(segments[0].endMark)+' cm → B 记号 '+n(segments[1].endMark)+' cm → 回到 C 拼缝 '+n(segments[2].endMark)+' cm。每根另加接头 '+n(current.params.overlap)+' cm 裁切，接头不参与分段。');
}
document.querySelectorAll('[data-leg-mode]').forEach(button=>button.addEventListener('click',()=>{legMode=button.dataset.legMode;syncLegMode();render();dirty();}));
$('reference-photo').src=new URL('./assets/reference-pinned-briefs.png',import.meta.url).href;
$('params').addEventListener('submit',event=>event.preventDefault());
$('fixed-mode').addEventListener('click',()=>setMode('fixed'));$('measured-mode').addEventListener('click',()=>setMode('measured'));
document.querySelectorAll('button[data-size]').forEach(button=>button.addEventListener('click',()=>{selectedSize=button.dataset.size;fixed();updateMode();render();dirty();}));
document.querySelectorAll('[data-rise]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.rise;if(next===rise)return;riseProfiles[rise]=Object.fromEntries(['frontLength','backLength','sideSeam'].map(id=>[id,$(id).value]));rise=next;Object.entries(riseProfiles[rise]).forEach(([id,value])=>$(id).value=value);updateMode();render();dirty();}));
fields.forEach(id=>$(id).addEventListener('input',()=>{
  if(id==='finish'){$('edgeAllowance').value=$('finish').value==='foe'?'0':'1.0';$('edgeAllowance').readOnly=$('finish').value==='foe';}
  if(id==='join'&&$('join').value!=='custom')$('overlap').value=$('join').value==='sewn'?'1.2':'0.6';
  if(id==='overlap')$('join').value='custom';
  if(['frontLength','backLength','sideSeam'].includes(id))riseProfiles[rise][id]=$(id).value;
  if(mode==='measured'&&['waist','hip'].includes(id)){manualIsExample=false;measured={waist:$('waist').value,hip:$('hip').value};updateMode();}
  if(id!=='notes'&&id!=='fabric')render();dirty();
}));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{stopAnimation();setView(button.dataset.view);}));
document.querySelectorAll('[data-step]').forEach(button=>button.addEventListener('click',()=>{stopAnimation();setStep(Number(button.dataset.step));}));
$('play-assembly').addEventListener('click',()=>{if(timer){stopAnimation();return;}setStep(0);text('play-assembly','暂停演示 ▌▌');timer=setInterval(()=>{if(step>=3){stopAnimation();return;}setStep(step+1);},3500);});
$('reset-view').addEventListener('click',()=>viewer?.reset());$('view-front').addEventListener('click',()=>viewer?.setCamera('front'));$('view-back').addEventListener('click',()=>viewer?.setCamera('back'));
$('toggle-body').addEventListener('click',()=>{bodyVisible=!bodyVisible;viewer?.setBodyVisible(bodyVisible);$('toggle-body').setAttribute('aria-pressed',String(bodyVisible));text('toggle-body',bodyVisible?'隐藏模特':'显示模特');});
$('auto-rotate').addEventListener('click',()=>{autoRotate=!autoRotate;viewer?.setAutoRotate(autoRotate);$('auto-rotate').setAttribute('aria-pressed',String(autoRotate));text('auto-rotate',autoRotate?'停止旋转':'自动旋转');});
document.querySelectorAll('[data-piece]').forEach(button=>button.addEventListener('click',()=>{selectedPiece=selectedPiece===button.dataset.piece?null:button.dataset.piece;document.querySelectorAll('[data-piece]').forEach(b=>b.classList.toggle('active',b.dataset.piece===selectedPiece));viewer?.selectPiece(selectedPiece);}));
$('zoom-in').addEventListener('click',()=>{zoom=Math.min(300,zoom+25);updateZoom();});$('zoom-out').addEventListener('click',()=>{zoom=Math.max(50,zoom-25);updateZoom();});$('zoom-reset').addEventListener('click',()=>{zoom=100;updateZoom();$('pattern-viewport').scrollTo(0,0);});
let pan=null;const paper=$('pattern-viewport');paper.addEventListener('pointerdown',event=>{if(event.pointerType!=='mouse'||event.button!==0)return;pan={x:event.clientX,y:event.clientY,left:paper.scrollLeft,top:paper.scrollTop};paper.setPointerCapture(event.pointerId);paper.classList.add('dragging');});paper.addEventListener('pointermove',event=>{if(!pan)return;paper.scrollLeft=pan.left-event.clientX+pan.x;paper.scrollTop=pan.top-event.clientY+pan.y;});['pointerup','pointercancel'].forEach(type=>paper.addEventListener(type,()=>{pan=null;paper.classList.remove('dragging');}));
$('save').addEventListener('click',()=>{if(!current)return;try{localStorage.setItem(key,JSON.stringify(snapshot()));text('save-status','已保存 · 下次打开此浏览器自动恢复');}catch{text('save-status','此浏览器无法保存，请下载尺寸单和参数文件');}});
$('export-sheet').addEventListener('click',()=>{if(current)download('\uFEFF'+getReport(),'小尺_女士三角内裤_详细尺寸单.txt','text/plain;charset=utf-8');});
$('download-pattern').addEventListener('click',downloadPattern);$('print-download').addEventListener('click',downloadPattern);
$('export-params').addEventListener('click',()=>{if(current)download(JSON.stringify({...snapshot(),computed:current.dimensions},null,2),'小尺_三角内裤参数.json','application/json');});
$('print-pattern').addEventListener('click',()=>$('print-dialog').showModal());$('close-print').addEventListener('click',()=>$('print-dialog').close());
$('edit-sizes').addEventListener('click',()=>{fillTable(table,tableName);$('size-dialog').showModal();});$('close-sizes').addEventListener('click',()=>$('size-dialog').close());$('reset-table').addEventListener('click',()=>fillTable(exampleTable,'演示尺码表'));
$('size-table-form').addEventListener('submit',event=>{event.preventDefault();const next=Object.fromEntries(sizes.map(s=>[s,{}]));$('size-table-body').querySelectorAll('input').forEach(input=>next[input.dataset.size][input.dataset.part]=input.value.trim()===''?NaN:Number(input.value));if(!validTable(next)||!$('table-name').value.trim()){$('size-table-error').hidden=false;text('size-table-error','请填表名及全部尺寸：腰围45–180、臀围60–200 cm，且臀围不小于腰围。');return;}table=next;tableName=$('table-name').value.trim();if(mode==='fixed')fixed();updateMode();render();dirty();$('size-dialog').close();});
const sourceLinks=[['Megan Nielsen · 四片结构与缝制','https://blog.megannielsen.com/2017/12/acacia-underwear/'],['Madalynne · 松紧带试样张力','https://madalynne.com/bra-making-tutorial-how-much-should-you-stretch-elastic-when-sewing/'],['Closet Core · 面料与收口工艺','https://blog.closetcorepatterns.com/fabric-suggestions-for-the-celine-bralette-and-anais-undies/'],['Tilly · 内裤合身调整','https://tillyandthebuttons.com/blogs/sewing/fitting-iris-knickers'],['In The Folds · 沿净缝线转移拼片','https://inthefolds.com/q-a-series/2024/how-to-remove-panel-lines-from-patterns']];
sourceLinks.forEach(([name,url])=>{const a=document.createElement('a');a.textContent=name;a.href=url;a.target='_blank';a.rel='noreferrer';$('source-links').append(a);});
document.querySelector('a[href="./assets/briefs-demo.blend"]').href=new URL('./assets/briefs-demo.blend',import.meta.url).href;
document.querySelector('a[href="./assets/mannequin.glb"]').href=new URL('./assets/mannequin.glb',import.meta.url).href;
try{viewer=new GarmentViewer($('stage'),{onStatus:message=>text('model-status',message)});}catch(error){$('scene-error').hidden=false;text('scene-error','当前浏览器无法显示 3D。请启用硬件加速或换用新版 Edge / Chrome；下方纸样和计算仍可使用。');text('model-status','3D 暂不可用');console.error(error);}
restore();
try{const saved=JSON.parse(localStorage.getItem(key));if(saved?.riseProfiles && ['mid','high'].every(r=>['frontLength','backLength','sideSeam'].every(id=>typeof saved.riseProfiles[r]?.[id]==='string')))riseProfiles=saved.riseProfiles;legMode=saved?.legMode==='segmented'?'segmented':'uniform';}catch{}
if(mode==='fixed')fixed();$('edgeAllowance').readOnly=$('finish').value==='foe';['waistElasticPct','legElasticPct'].forEach(id=>$(id).max='100');updateMode();syncLegMode();text('assembly-description',descriptions[0]);render();
if(matchMedia('(max-width:680px)').matches)document.querySelectorAll('.controls details').forEach(el=>el.open=false);

