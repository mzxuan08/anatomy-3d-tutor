import * as T from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { createLearningTools } from './learning-tools.js';
import { attachStudyRecord } from './study-record.js';
import { createLandmarks } from './landmarks.js';

const $ = id => document.getElementById(id);
const namesOfView={front:'前面观',back:'后面观',left:'人体左侧观',right:'人体右侧观',top:'上面观',bottom:'下面观',oblique:'斜面观'};
const statuses={'textbook-matched':'教材中文已定位（人工对应）','course-matched':'课件匹配','reference-matched':'中英参考条目与教材已定位',derived:'限定规则派生',unmatched:'暂无有依据的中文名','review-needed':'译名待复核，保留英文'};
const colors={skeletal:'#ded0ad',muscular:'#b97571',arterial:'#c85758',venous:'#678cb1',nervous:'#d3b565',respiratory:'#9fbfb4',digestive:'#d4a685',urinary:'#bc947c',reproductive:'#c5a0aa',lymphatic:'#88ae91',endocrine:'#c4ad7b',integumentary:'#dbb7a0',connective:'#c0c6b0',brain:'#c8b6b1',cardiac:'#bb777b',borrowed:'#cabd90','donor-muscle':'#b78680'};
let lesson,atlas,renderer,scene,camera,controls,meshes=new Map(),stepIndex=0,showNames=true,layout='native',picked=null,lastView='oblique',ready=false,transition=null;
let userInteraction=false,isolated=false,learningTools=null,studyRecord=null,landmarkTools=null;
let mode='lesson',compareIds=[],reviewIds=[],reviewRun=null,reviewResults=new Map(),focusId=null,reviewRound=0;
const host=$('scene'),labelHost=$('mesh-labels'),raycaster=new T.Raycaster();

function text(id,value){$(id).textContent=value??'';}
function acceptedTerm(part){const t=part.terminology,refs=atlas.terminology_sources||{};if(!t?.zh||!['textbook-matched','course-matched','reference-matched','derived'].includes(t.status)||!t.sources?.length||!t.sources.every(r=>refs[r.source_id]&&(r.locator||(r.pdf_page&&r.term_id))))return false;const kinds=t.sources.map(r=>refs[r.source_id].kind),required={'textbook-matched':['textbook'],'course-matched':['course'],'reference-matched':['textbook','bilingual-reference'],derived:[]}[t.status];return required.every(kind=>kinds.includes(kind));}
function displayName(part){return (part.lesson_label_source&&part.lesson_label)||(acceptedTerm(part)?part.terminology.zh:part.name);}
function normalizeSearch(value){const nums={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,'十一':11,'十二':12};return value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim().replace(/第(十二|十一|十|九|八|七|六|五|四|三|二|一)(?=颈椎|胸椎|腰椎|肋|掌骨|跖骨|脑室|趾|指)/g,(_,n)=>`第${nums[n]}`);}
function searchKeys(part){return [displayName(part),part.name,part.id,...(acceptedTerm(part)?part.terminology.aliases_zh||[]:[]),...(acceptedTerm(part)?part.terminology.aliases_en||[]:[])].map(normalizeSearch);}
function termSources(part){return (part.terminology?.sources||[]).map(ref=>{const source=atlas.terminology_sources?.[ref.source_id];return `${source?.title||ref.source_id}${ref.locator?' · '+ref.locator:''}${ref.pdf_page?' · PDF第'+ref.pdf_page+'页':''}${ref.term_id?' · 条目'+ref.term_id:''}${ref.evidence_type==='chinese-context'?'（仅中文提及，英文对应另核对）':ref.evidence_type==='bilingual-context'?'（同段中英对应）':''}`;}).join('\n');}
function safeName(part){return showNames?displayName(part):`结构 ${[...meshes.keys()].indexOf(part.id)+1}`;}
function renderPicked(){
 const visible=!!picked;
 $('inspector').hidden=!visible;$('picked').hidden=!visible;$('selected-chip').hidden=!visible;
 $('selection-actions').hidden=!visible||!showNames||mode==='review'||mode==='review-summary';
 $('pin-compare').disabled=mode!=='lesson';
 if(visible){text('pin-compare',compareIds.includes(picked.userData.part.id)?'移出对比夹':'加入对比夹');text('pin-review',reviewIds.includes(picked.userData.part.id)?'移出复习':'加入复习');}
 $('workspace').classList.toggle('has-selection',visible);$('picked').replaceChildren();
 if(!visible)return;
 const part=picked.userData.part,root=$('picked');text('selected-chip',safeName(part)+' · 查看详情');
 const add=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;root.append(el);return el;};
 add('h3',safeName(part));
 if(!showNames){add('p','请说出名称和辨认依据，准备好后再显示名称核对。','picked-english');return;}
 add('p',part.name+' · '+part.id,'picked-english');
 const term=part.terminology||{};add('span',statuses[term.status]||'暂无有依据的中文名','term-badge'+(acceptedTerm(part)?'':' pending'));
 const section=(title,value)=>{if(!value)return;const div=document.createElement('section');div.className='inspector-section';const h=document.createElement('h4'),p=document.createElement('p');h.textContent=title;p.textContent=value;div.append(h,p);root.append(div);};
 section('课内标注依据',part.lesson_label_source);section('派生依据',term.rule);section('术语说明',term.note);section('术语来源',termSources(part)||'中文术语依据待补充');
 const reference=atlas.sex==='female'?(part.system==='borrowed'?'女性参考体上的男性来源借用骨':part.system==='donor-muscle'?'女性参考体上的第二女性来源下肢肌':'女性组合参考模型'):'男性参考模型';
 add('p',reference,'reference-note');
}
function focusMode(value){document.body.classList.toggle('scene-focus',value);$('focus-mode').setAttribute('aria-pressed',String(value));text('focus-mode',value?'退出专注':'专注模型');}
function closeInspector(){
 focusId=null;if(isolated){isolated=false;for(const mesh of meshes.values())mesh.visible=baseIds().includes(mesh.userData.part.id);setLayout('native');}
 picked=null;$('isolate').disabled=true;$('isolate').classList.remove('active');$('isolate').setAttribute('aria-pressed','false');text('isolate','单独观察');
 for(const mesh of meshes.values()){const highlighted=lesson.steps[stepIndex].highlight?.includes(mesh.userData.part.id);mesh.material.emissive.set(highlighted?'#3d614c':'#000000');mesh.material.emissiveIntensity=highlighted?.27:0;}
 learningTools?.applyVisibility();updateNames();renderPicked();
}
function setTheme(theme){document.documentElement.dataset.theme=theme;const label=theme==='dark'?'浅色':'深色';text('theme',label);$('theme').setAttribute('aria-label','切换'+label+'模式');$('theme').title='切换'+label+'模式';try{localStorage.setItem('anatomy-theme',theme);}catch{}}
try{setTheme(localStorage.getItem('anatomy-theme')==='dark'?'dark':'light');}catch{setTheme('light');}
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('focus-mode').onclick=()=>focusMode(!document.body.classList.contains('scene-focus'));
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
$('close-inspector').onclick=()=>closeInspector();
$('selected-chip').onclick=()=>{focusMode(false);$('inspector').scrollIntoView({block:'nearest'});$('close-inspector').focus({preventScroll:true});};
document.addEventListener('keydown',e=>{
 if(!ready||$('help-dialog').open||$('course-dialog').open||e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
 const key=e.key.toLowerCase(),views=['front','back','left','right','top','oblique'];
 if(key==='/'&&!$('search').disabled){e.preventDefault();focusMode(false);$('search').focus();}
 else if(/^[1-6]$/.test(key)){e.preventDefault();fit(views[Number(key)-1]);}
 else if(key==='h'){$('names').click();}else if(key==='r'){fit(lesson.steps[stepIndex].view||'oblique');}
 else if(key==='arrowleft'&&mode==='lesson'&&stepIndex>0){e.preventDefault();setStep(stepIndex-1);}else if(key==='arrowright'&&mode==='lesson'&&stepIndex<lesson.steps.length-1){e.preventDefault();setStep(stepIndex+1);}
 else if(key==='escape'){if(document.body.classList.contains('scene-focus'))focusMode(false);else if(picked)closeInspector();}
});
function updateNames(){
 text('names',showNames?'隐藏名称':'显示名称');
 $('names').classList.toggle('active',!showNames);$('names').setAttribute('aria-pressed',String(!showNames));
 text('study-mode',showNames?'观察模式':'无标签辨认');$('study-mode').classList.toggle('quiz',!showNames);
 const visible=[...meshes.values()].filter(m=>m.visible);text('visible-count',visible.length);
 labelHost.replaceChildren();
 const list=$('structure-list');list.replaceChildren();
 for(const mesh of meshes.values()){
  if(!mesh.visible)continue;
  const part=mesh.userData.part,button=document.createElement('button');button.className='structure-item';button.textContent=safeName(part);button.dataset.partId=part.id;button.classList.toggle('active',mesh===picked);button.setAttribute('aria-pressed',String(mesh===picked));
  if(showNames){const small=document.createElement('small');small.textContent=part.name;button.append(small);}
  button.addEventListener('click',()=>select(mesh));list.append(button);
  if(showNames&&visible.length<=8){const el=document.createElement('span');el.className='mesh-label';el.textContent=displayName(part);el.dataset.id=part.id;labelHost.append(el);}
 }
 renderPicked();renderTrays();
 $('names').disabled=mode==='review'||mode==='review-summary';$('layout').disabled=mode==='review'||mode==='review-summary';$('isolate').disabled=!picked||mode==='review'||mode==='review-summary';
 learningTools?.renderStructures();learningTools?.renderExtras();
 landmarkTools?.render();
 $('search').disabled=!showNames;$('search').placeholder=showNames?'中文、英文或模型ID':'辨认时隐藏名称搜索';$('search').value='';$('search-results').replaceChildren();
}
function select(mesh){
 picked=mesh;focusId=null;text('action-status','');renderPicked();
 document.querySelectorAll('#structure-list button').forEach(b=>{b.classList.toggle('active',b.dataset.partId===mesh.userData.part.id);b.setAttribute('aria-pressed',String(b.dataset.partId===mesh.userData.part.id));});
 $('isolate').disabled=mode==='review'||mode==='review-summary';
 for(const m of meshes.values()){const highlighted=lesson.steps[stepIndex].highlight?.includes(m.userData.part.id);m.material.emissive.set(m===mesh?'#326c57':highlighted?'#3d614c':'#000000');m.material.emissiveIntensity=m===mesh ? .48 : highlighted ? .27 : 0;}
 learningTools?.renderExtras();
}
function visibleBox(targetId=null){
 const box=new T.Box3();for(const mesh of meshes.values()){if(mesh.visible&&(!targetId||mesh.userData.part.id===targetId)){mesh.updateMatrixWorld();box.union(new T.Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));}}return box;
}
function fit(view=lastView,animate=true){
 if(!ready)return;
 const box=visibleBox(focusId),center=box.getCenter(new T.Vector3()),radius=Math.max(box.getBoundingSphere(new T.Sphere()).radius,.012);
 const direction={front:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0],top:[0,1,0],bottom:[0,-1,0],oblique:[.5,.3,1]}[view]||[.5,.3,1];
 const distance=radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))/Math.min(1,camera.aspect)*1.22;
 camera.up.set(...(view==='top'?[0,0,1]:view==='bottom'?[0,0,-1]:[0,1,0]));
 const targetPosition=center.clone().add(new T.Vector3(...direction).normalize().multiplyScalar(distance));
 controls.minDistance=Math.max(radius*.25,.008);controls.maxDistance=Math.max(distance*8,1);
 if(animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&camera.up.y===1){transition={start:performance.now(),from:camera.position.clone(),fromTarget:controls.target.clone(),position:targetPosition,target:center};}
 else{transition=null;camera.position.copy(targetPosition);controls.target.copy(center);controls.update();}
 lastView=view;text('view-status',namesOfView[view]);
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));});
}
function setLayout(next,animate=true){
 focusId=null;layout=next;for(const mesh of meshes.values())mesh.position.set(0,0,0);const visible=baseIds().map(id=>meshes.get(id)).filter(m=>m?.visible);
 let total=0,gap=.015;
 for(const mesh of visible){const box=mesh.geometry.boundingBox;total+=box.max.x-box.min.x+gap;}
 let cursor=-total/2;
 for(const mesh of visible){mesh.position.set(0,0,0);if(layout==='compare'){
  const box=mesh.geometry.boundingBox,width=box.max.x-box.min.x,center=box.getCenter(new T.Vector3());
  mesh.position.set(cursor+width/2-center.x,-center.y,-center.z);cursor+=width+gap;
 }}
 text('layout',layout==='native'?'并排对比':'返回原位');$('layout').classList.toggle('active',layout==='compare');$('layout').setAttribute('aria-pressed',String(layout==='compare'));$('layout-notice').hidden=layout!=='compare'&&!isolated;
 text('layout-notice',layout==='compare'?'同尺度形态对比：位置已平移。判断毗邻请切回原位。':'正在单独观察所选结构；返回本步整体后再判断毗邻。');
 if(picked&&!picked.visible){picked=null;renderPicked();}
 fit(lesson.steps[stepIndex].view||'oblique',animate);
}
function setStep(index){
 landmarkTools?.reset();
 learningTools?.reset();
 mode='lesson';reviewRun=null;focusId=null;document.body.dataset.practice=mode;$('practice-panel').hidden=true;$('recall-note').value='';
 stepIndex=Math.max(0,Math.min(lesson.steps.length-1,index));const step=lesson.steps[stepIndex];
 text('step-number',`步骤 ${String(stepIndex+1).padStart(2,'0')} / ${String(lesson.steps.length).padStart(2,'0')}`);
 text('step-title',step.title);text('explanation',step.body);text('source',step.source);text('question',step.prompt);text('answer-text',step.answer);
 $('question-block').hidden=!step.prompt;$('answer').hidden=!step.answer;$('answer').open=false;
 $('step-progress').setAttribute('aria-valuemax',String(lesson.steps.length));$('step-progress').setAttribute('aria-valuenow',String(stepIndex+1));$('progress-fill').style.width=((stepIndex+1)/lesson.steps.length*100)+'%';
 $('step-menu').value=String(stepIndex);$('previous').disabled=stepIndex===0;$('next').disabled=stepIndex===lesson.steps.length-1;
 showNames=!step.quiz;picked=null;isolated=false;$('picked').hidden=true;$('isolate').disabled=true;text('isolate','单独观察');$('isolate').classList.remove('active');$('isolate').setAttribute('aria-pressed','false');
 for(const mesh of meshes.values()){mesh.visible=step.show.includes(mesh.userData.part.id);mesh.material.emissive.set(step.highlight?.includes(mesh.userData.part.id)?'#3d614c':'#000000');mesh.material.emissiveIntensity=step.highlight?.includes(mesh.userData.part.id) ? .27 : 0;}
 controls.autoRotate=false;text('orbit','自动环绕');$('orbit').classList.remove('active');$('orbit').setAttribute('aria-pressed','false');
 setLayout(step.layout||'native');updateNames();
}
function baseIds(){return mode==='compare'?compareIds:mode.startsWith('review')&&reviewRun?[reviewRun.ids[reviewRun.index]]:lesson.steps[stepIndex].show;}
function renderTrays(){
 studyRecord?.update(mode);
 for(const [kind,ids] of [['compare',compareIds],['review',reviewIds]]){
  text(kind+'-count',kind==='compare'?ids.length+' / 4':ids.length);const list=$(kind+'-list');list.replaceChildren();
  // No target names, titles or identifying metadata in any blind exercise.
  for(const id of ids){const row=document.createElement('div');row.className='tray-row';const button=document.createElement('button');button.className='tray-name';button.textContent=safeName(meshes.get(id).userData.part);button.disabled=!showNames||mode.startsWith('review');button.onclick=()=>{setStep(lesson.steps.findIndex(s=>s.show.includes(id)));select(meshes.get(id));};const remove=document.createElement('button');remove.className='remove-item';remove.textContent='×';remove.setAttribute('aria-label','移出'+(kind==='compare'?'对比夹':'复习清单'));remove.disabled=mode!=='lesson';remove.onclick=()=>togglePin(kind,id);row.append(button,remove);list.append(row);}
  $(kind+'-start').disabled=!showNames||mode.startsWith('review')||(kind==='compare'?ids.length<2:ids.length===0);
 }
 if(showNames&&!mode.startsWith('review'))for(const [index,row] of [...$('review-list').children].entries()){const result=reviewResults.get(reviewIds[index]),tag=document.createElement('small');tag.textContent=result?(result.rating==='again'?'还需再练':'自评能说出依据'):'未测';row.append(tag);}
 $('review-weak').disabled=!showNames||mode.startsWith('review')||!reviewIds.some(id=>reviewResults.get(id)?.rating==='again');
 $('review-export').disabled=!showNames||mode==='review'||!reviewIds.length;
}
function togglePin(kind,id){
 let ids=kind==='compare'?compareIds:reviewIds;if(ids.includes(id)){ids.splice(ids.indexOf(id),1);if(kind==='review')reviewResults.delete(id);}else{
  if(kind==='compare'&&ids.length>=4){text('action-status','对比夹最多放 4 个结构，请先移出一个。');return;}ids.push(id);
 }
 renderTrays();renderPicked();text('action-status',ids.includes(id)?'已加入'+(kind==='compare'?'对比夹':'复习清单'):'已移出清单');
 $(kind+'-tray').open=true;
}
function practiceScene(){
 landmarkTools?.reset();
 learningTools?.reset();
 isolated=false;focusId=null;picked=null;controls.autoRotate=false;text('orbit','自动环绕');$('orbit').classList.remove('active');$('orbit').setAttribute('aria-pressed','false');
 for(const mesh of meshes.values()){mesh.visible=baseIds().includes(mesh.userData.part.id);mesh.material.emissive.set('#000000');mesh.material.emissiveIntensity=0;}
 text('isolate','单独观察');$('isolate').classList.remove('active');$('isolate').setAttribute('aria-pressed','false');
 document.body.dataset.practice=mode;$('practice-panel').hidden=false;
 for(const id of ['review-reveal','review-again','review-known','review-retry','practice-answer','recall-note'])$(id).hidden=true;
 $('recall-note').value='';setLayout(mode==='compare'?'compare':'native',false);updateNames();
}
function startCompare(){if(compareIds.length<2)return;mode='compare';showNames=true;practiceScene();text('practice-mode','自选对比');text('practice-title','先比较形态，再回原位');text('practice-body','所有结构保持原始比例。先说出形态、大小与方向的差异，再点击“返回原位”查看它们在模型中的位置。未显示的结构仍可能位于两者之间，不能仅凭画面判断毗邻。');}
function startReview(ids=reviewIds){
 if(!ids.length)return;const shuffled=[...ids];for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 reviewRun={ids:shuffled,index:0,viewOffset:reviewRound++%5};for(const id of ids)reviewResults.delete(id);nextReview();
}
function nextReview(){
 mode='review';showNames=false;practiceScene();text('practice-mode','无标签自测');text('practice-title',`辨认 ${reviewRun.index+1} / ${reviewRun.ids.length}`);text('practice-body','这是哪个结构？如适用，说出侧别，再用可见的形态特征解释你的判断。先回答，再核对。');$('review-reveal').hidden=false;$('recall-note').hidden=false;
 const views=['back','left','right','top','oblique'];fit(views[(reviewRun.index+reviewRun.viewOffset)%views.length],false);text('layout-notice','单个结构辨认：周围结构已隐藏。此模式不能用于判断毗邻。');$('layout-notice').hidden=false;
 if(innerWidth<=760)requestAnimationFrame(()=>document.querySelector('.viewport').scrollIntoView({block:'start'}));
}
function revealReview(){
 if(mode!=='review'||showNames)return;showNames=true;updateNames();const part=meshes.get(reviewRun.ids[reviewRun.index]).userData.part;
 text('practice-answer',displayName(part)+'\n'+part.name+'\n请对照课件核对你说出的形态依据。\n术语来源：\n'+(termSources(part)||'未匹配中文来源，保留英文'));$('practice-answer').hidden=false;$('review-reveal').hidden=true;$('review-again').hidden=false;$('review-known').hidden=false;
}
function rateReview(rating){
 if(mode!=='review'||!showNames)return;const id=reviewRun.ids[reviewRun.index];reviewResults.set(id,{rating,note:$('recall-note').value.trim(),view:lastView});
 if(++reviewRun.index<reviewRun.ids.length){nextReview();return;}
 reviewRun.index=reviewRun.ids.length-1;mode='review-summary';showNames=true;practiceScene();text('practice-mode','本轮自评');text('practice-title','把尚未记住的再练一次');
 const known=reviewRun.ids.filter(id=>reviewResults.get(id)?.rating==='known').length;const again=reviewRun.ids.filter(id=>reviewResults.get(id)?.rating==='again');
 text('practice-body',`本轮 ${reviewRun.ids.length} 个结构：自评能说出依据 ${known} 个；还需再练 ${again.length} 个。\n这只是自评记录，建议在另一角度或课件标本图上再核验。`);text('practice-answer',reviewRun.ids.map(id=>displayName(meshes.get(id).userData.part)+' · '+(reviewResults.get(id)?.rating==='known'?'自评能说出依据':'还需再练')).join('\n'));$('practice-answer').hidden=false;$('review-retry').hidden=!again.length;
}
function exportReview(){
 const lines=['# '+lesson.title+' · 自选复习卡','','记录性质：学生自评，不是客观掌握度。','模型：'+(atlas.sex==='female'?'女性组合参考':'男性参考'),''];
 for(const id of reviewIds){const part=meshes.get(id).userData.part,result=reviewResults.get(id);lines.push('## '+displayName(part),part.name+' · '+id,'','辨认题：说出名称、适用侧别和可见形态依据。','自评：'+(result?result.rating==='known'?'能说出依据':'还需再练':'未测'),'我的回答：'+(result?.note||'未记录'),'','术语来源：',termSources(part)||'未匹配中文来源，保留英文','');}
 const blob=new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='解剖复习卡.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('zoom-picked').onclick=()=>{if(!picked)return;focusId=picked.userData.part.id;fit(lastView);text('action-status','保留本步周围结构。若被遮挡，可切换单独观察。');};
$('pin-compare').onclick=()=>{if(picked)togglePin('compare',picked.userData.part.id);};$('pin-review').onclick=()=>{if(picked)togglePin('review',picked.userData.part.id);};
$('compare-start').onclick=startCompare;$('review-start').onclick=()=>startReview();$('review-reveal').onclick=revealReview;$('review-again').onclick=()=>rateReview('again');$('review-known').onclick=()=>rateReview('known');$('review-retry').onclick=()=>startReview(reviewRun.ids.filter(id=>reviewResults.get(id)?.rating==='again'));
$('practice-exit').onclick=()=>setStep(stepIndex);$('review-export').onclick=exportReview;
$('review-weak').onclick=()=>startReview(reviewIds.filter(id=>reviewResults.get(id)?.rating==='again'));
function renderLabels(){
 for(const el of labelHost.children){const mesh=meshes.get(el.dataset.id);if(!mesh?.visible){el.hidden=true;continue;}
  const center=mesh.geometry.boundingBox.getCenter(new T.Vector3()).add(mesh.position);center.project(camera);
  el.hidden=center.z>1||center.z< -1||Math.abs(center.x)>1.05||Math.abs(center.y)>1.05;
  el.style.left=`${(center.x+1)*host.clientWidth/2}px`;el.style.top=`${(1-center.y)*host.clientHeight/2}px`;
 }
}
function tick(now){
 requestAnimationFrame(tick);
 if(transition){const t=Math.min(1,(now-transition.start)/650),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.position,ease);controls.target.lerpVectors(transition.fromTarget,transition.target,ease);if(t===1)transition=null;}
 controls.update();landmarkTools?.tick();renderer.render(scene,camera);renderLabels();learningTools?.renderOrientation();
}
async function initialize(){
 const responses=await Promise.all([fetch('lesson.json'),fetch('models/atlas.json')]);
 if(responses.some(r=>!r.ok))throw new Error('学习资料加载失败');[lesson,atlas]=await Promise.all(responses.map(r=>r.json()));
 document.title=lesson.title+' · 3D伴学';text('lesson-title',lesson.title);text('intro',lesson.intro||'观察、理解，再用指认检验记忆。');
 lesson.steps.forEach((s,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1}. ${s.title}`;$('step-menu').append(option);});
 for(const source of lesson.sources||[]){const p=document.createElement('p');p.textContent=source.title+(source.pages?.length?` · PDF第${source.pages.join('、')}页`:'');$('resources').append(p);}
 for(const source of Object.values(atlas.terminology_sources||{})){const p=document.createElement('p');p.textContent=`术语依据：${source.title} · ${source.role||''}`;if(source.url){try{const url=new URL(source.url);if(url.protocol==='https:'||url.protocol==='http:'){const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener';a.textContent='查看来源';p.append(document.createTextNode(' · '),a);}}catch{}}$('resources').append(p);}
 renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.domElement.setAttribute('aria-label','解剖学三维模型，可拖动旋转、滚轮缩放、点击选择结构');host.prepend(renderer.domElement);
 scene=new T.Scene();camera=new T.PerspectiveCamera(35,1,.001,100);camera.position.set(.5,1,2);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotateSpeed=.75;
 controls.addEventListener('start',()=>{transition=null;userInteraction=true;text('view-status','自由视角 · 人体方位不变');document.querySelectorAll('[data-view]').forEach(b=>{b.classList.remove('active');b.setAttribute('aria-pressed','false');});});
 controls.addEventListener('end',()=>{userInteraction=false;});
 scene.add(new T.HemisphereLight('#ffffff','#75887c',1.0));const key=new T.DirectionalLight('#fff8ed',2.2);key.position.set(-2,4,4);scene.add(key);const rim=new T.DirectionalLight('#e1f4ef',.7);rim.position.set(3,1,-2);scene.add(rim);
 text('loading-label','正在读取三维几何');
 const chunkResponses=await Promise.all(atlas.chunks.map(c=>fetch(c.url)));if(chunkResponses.some(r=>!r.ok))throw new Error('模型几何加载失败');const buffers=await Promise.all(chunkResponses.map(r=>r.arrayBuffer()));
 for(const part of atlas.parts){const buffer=buffers[part.chunk];const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));geometry.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));geometry.setIndex(new T.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new T.MeshStandardMaterial({color:colors[part.teaching_system||part.system]||'#bbbaa7',roughness:.62,metalness:.025,side:T.DoubleSide});const mesh=new T.Mesh(geometry,material);mesh.userData.part=part;meshes.set(part.id,mesh);scene.add(mesh);
 }
 learningTools=createLearningTools({$,state:()=>({lesson,atlas,meshes,camera,stepIndex,showNames,mode,layout,isolated,picked,ids:baseIds()}),select,fit,setStep,safeName,changed(resetAll=false){
  if(resetAll){isolated=false;text('isolate','单独观察');$('isolate').classList.remove('active');$('isolate').setAttribute('aria-pressed','false');learningTools.applyVisibility();setLayout(layout,false);}
  if(picked&&!picked.visible){picked=null;focusId=null;$('isolate').disabled=true;}updateNames();
 }});
 const resize=()=>{camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);if(ready)fit(lastView,false);};new ResizeObserver(resize).observe(host);resize();
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){down=null;return;}down=null;const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hits=raycaster.intersectObjects([...meshes.values()].filter(m=>m.visible));const hit=hits.find(h=>h.object.material.opacity===1)||hits[0];if(hit)select(hit.object);});
 $('previous').onclick=()=>setStep(stepIndex-1);$('next').onclick=()=>setStep(stepIndex+1);$('step-menu').onchange=e=>setStep(Number(e.target.value));
 $('names').onclick=()=>{showNames=!showNames;updateNames();};$('layout').onclick=()=>{setLayout(layout==='native'?'compare':'native');updateNames();};$('fit').onclick=()=>{focusId=null;fit(lesson.steps[stepIndex].view||'oblique');};
 $('isolate').onclick=()=>{if(!picked)return;isolated=!isolated;for(const mesh of meshes.values())mesh.visible=isolated?mesh===picked:baseIds().includes(mesh.userData.part.id);text('isolate',isolated?'返回本步整体':'单独观察');$('isolate').classList.toggle('active',isolated);$('isolate').setAttribute('aria-pressed',String(isolated));learningTools?.applyVisibility();setLayout('native');updateNames();};
 $('search').addEventListener('input',()=>{const results=$('search-results');results.replaceChildren();const query=normalizeSearch($('search').value);if(!query||!showNames)return;const found=atlas.parts.filter(p=>searchKeys(p).some(key=>key.includes(query))).sort((a,b)=>Number(!searchKeys(a).includes(query))-Number(!searchKeys(b).includes(query))).slice(0,10);for(const part of found){const button=document.createElement('button');button.className='structure-item';button.textContent=displayName(part);const small=document.createElement('small');small.textContent=part.name;button.append(small);button.onclick=()=>{const index=lesson.steps.findIndex(s=>s.show.includes(part.id));setStep(index);select(meshes.get(part.id));};results.append(button);}if(!found.length){const p=document.createElement('p');p.textContent='本页没有可确认的匹配。未收录中文译名时可用英文或模型ID，也可在聊天中让我核对。';results.append(p);}});
 $('orbit').onclick=()=>{transition=null;controls.autoRotate=!controls.autoRotate;text('orbit',controls.autoRotate?'暂停环绕':'自动环绕');$('orbit').classList.toggle('active',controls.autoRotate);$('orbit').setAttribute('aria-pressed',String(controls.autoRotate));if(controls.autoRotate)text('view-status','自动环绕 · 人体方位不变');};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(b.dataset.view));
 studyRecord=attachStudyRecord({$,lesson,atlas,get:()=>({step:stepIndex,compare:[...compareIds],review:[...reviewIds],results:[...reviewResults]}),restore(record){compareIds=[...record.compare];reviewIds=[...record.review];reviewResults=new Map(record.results);setStep(record.step);renderTrays();}});
 landmarkTools=createLandmarks({$,lesson,meshes,scene,camera,state:()=>({stepIndex,showNames,mode}),fit,select,selectPage:ref=>learningTools.openPage(ref)});
 ready=true;$('loading-cover').hidden=true;setStep(0);fit(lesson.steps[0].view||'oblique',false);text('load-status',`${atlas.sex==='female'?'女性组合参考':'男性参考'} · ${atlas.parts.length} 个结构`);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;text('load-status','三维渲染已暂停，请刷新恢复');});
 window.anatomyTutor={setStep,setView:fit,setNames(value){showNames=!!value;updateNames();},status(){return {ready,step:stepIndex,showNames,layout,mode,focusId,landmarks:landmarkTools?.status(),learning:learningTools?.status(),opacity:Object.fromEntries([...meshes].filter(([id,m])=>m.visible).map(([id,m])=>[id,m.material.opacity])),cameraDistance:camera.position.distanceTo(controls.target),positions:Object.fromEntries([...meshes].filter(([id,m])=>m.visible).map(([id,m])=>[id,m.position.toArray()])),visible:[...meshes.values()].filter(m=>m.visible).map(m=>m.userData.part.id),triangles:renderer.info.render.triangles};},project(id){const mesh=meshes.get(id);if(!mesh||!mesh.visible)return null;const point=mesh.geometry.boundingBox.getCenter(new T.Vector3()).add(mesh.position).project(camera);const rect=renderer.domElement.getBoundingClientRect();return {x:rect.x+(point.x+1)*rect.width/2,y:rect.y+(1-point.y)*rect.height/2};}};
 requestAnimationFrame(tick);
}
initialize().catch(error=>{text('load-status','加载未完成');$('loading-cover').hidden=true;const p=document.createElement('p');p.className='error';p.textContent=`无法完成三维展示：${error.message}。可继续在聊天中结合课件图学习。`;host.append(p);});
