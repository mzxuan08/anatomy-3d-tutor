import * as T from './vendor/three.module.js';

const groups={skeletal:'骨骼',muscular:'肌肉',arterial:'动脉',venous:'静脉',nervous:'神经',respiratory:'呼吸',digestive:'消化',urinary:'泌尿',reproductive:'生殖',lymphatic:'淋巴',endocrine:'内分泌',integumentary:'皮肤',connective:'结缔组织',brain:'脑',cardiac:'心脏',borrowed:'借用骨', 'donor-muscle':'其他来源肌肉',oral_reference:'口腔参考'};
const directions=[['left','左',[1,0,0]],['right','右',[-1,0,0]],['top','上',[0,1,0]],['bottom','下',[0,-1,0]],['front','前',[0,0,1]],['back','后',[0,0,-1]]];
const ns='http://www.w3.org/2000/svg';
const element=(tag,value,cls)=>{const e=document.createElement(tag);if(value!=null)e.textContent=value;if(cls)e.className=cls;return e;};
const safeImage=path=>typeof path==='string'&&/^courseware\/[a-zA-Z0-9_-]+\/page-\d+\.png$/.test(path);

export function createLearningTools({$,state,select,fit,setStep,changed,safeName}){
 $('course-mount').append($('course-panel'));$('scene').append($('layout-notice'));
 const hidden=new Set();let dimmed=false,opacity=.2,courseOpen=false,currentPage=null,lastStep=-1;
 const svg=$('orientation-svg'),axisNodes=[];
 for(const [view,label,xyz] of directions){
  const g=document.createElementNS(ns,'g');g.dataset.direction=view;g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-label','切换人体'+label+'面观');
  const line=document.createElementNS(ns,'line'),circle=document.createElementNS(ns,'circle'),text=document.createElementNS(ns,'text');circle.setAttribute('r','10');text.setAttribute('text-anchor','middle');text.setAttribute('dominant-baseline','middle');g.append(line,circle,text);svg.append(g);
  g.onclick=()=>fit(view);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();fit(view);}};axisNodes.push({g,line,circle,text,xyz,label});
 }
 function applyVisibility(){const s=state();for(const [id,mesh] of s.meshes)mesh.visible=s.ids.includes(id)&&!hidden.has(id)&&(!s.isolated||mesh===s.picked);applyMaterials();}
 function applyMaterials(){const s=state();for(const mesh of s.meshes.values()){const ghost=dimmed&&s.picked&&mesh!==s.picked&&mesh.visible;mesh.material.transparent=!!ghost;mesh.material.opacity=ghost?opacity:1;mesh.material.depthWrite=!ghost;mesh.renderOrder=ghost?0:1;}}
 function reset(){hidden.clear();dimmed=false;applyMaterials();}
 function toggleHidden(ids,visible){
  const s=state(),next=new Set(hidden);for(const id of ids){if(visible)next.delete(id);else next.add(id);}
  if(!s.ids.some(id=>!next.has(id))){renderStructures();$('visibility-status').textContent='至少保留一个结构；可先显示其他结构再隐藏这个。';return;}
  hidden.clear();for(const id of next)hidden.add(id);applyVisibility();changed();
 }
 function renderStructures(){
  const s=state(),list=$('structure-list');list.replaceChildren();
  for(const id of s.ids){const mesh=s.meshes.get(id);if(!mesh)continue;const row=element('div',null,'structure-row'+(mesh.visible?'':' is-hidden')),check=element('input');check.type='checkbox';check.checked=mesh.visible;check.disabled=s.isolated||s.mode.startsWith('review');check.setAttribute('aria-label','显示 '+safeName(mesh.userData.part));check.onchange=()=>toggleHidden([id],check.checked);
   const button=element('button',safeName(mesh.userData.part),'structure-item');button.dataset.partId=id;button.classList.toggle('active',mesh===s.picked);button.setAttribute('aria-pressed',String(mesh===s.picked));button.disabled=!mesh.visible;if(s.showNames)button.append(element('small',mesh.userData.part.name));button.onclick=()=>select(mesh);row.append(check,button);list.append(row);
  }
  $('visibility-reset').disabled=s.mode.startsWith('review');$('layer-panel').hidden=!s.showNames||s.mode!=='lesson';$('layer-list').replaceChildren();
  const grouped=new Map();for(const id of s.ids){const p=s.meshes.get(id).userData.part,key=p.teaching_system||p.system;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(id);}
  for(const [group,ids] of grouped){const label=element('label',null,'group-toggle'),check=element('input');check.type='checkbox';check.checked=ids.every(id=>s.meshes.get(id).visible);check.indeterminate=!check.checked&&ids.some(id=>s.meshes.get(id).visible);check.disabled=s.isolated;check.onchange=()=>toggleHidden(ids,check.checked);label.append(check,element('span',(groups[group]||group)+' · '+ids.length));$('layer-list').append(label);}
  $('visibility-status').textContent=hidden.size?'已隐藏 '+hidden.size+' 个结构；隐藏不代表结构不存在。':'';
 }
 function renderExtras(){
  applyMaterials();const s=state();$('dim-context').disabled=!s.picked||s.isolated||!s.showNames||s.mode.startsWith('review');$('dim-context').setAttribute('aria-pressed',String(dimmed));$('dim-context').textContent=dimmed?'恢复周围结构':'淡化周围结构';$('context-opacity-label').hidden=!dimmed;
  renderCourse();renderComparisons();
 }
 function renderOrientation(){
  const inverse=state().camera.quaternion.clone().invert(),ordered=[];
  for(const node of axisNodes){const vector=new T.Vector3(...node.xyz).applyQuaternion(inverse),depth=Math.abs(vector.x)+Math.abs(vector.y)<.12;
   let x=60+vector.x*42,y=60-vector.y*42;if(depth){x=76;y=vector.z>0?48:72;}
   node.g.dataset.x=vector.x.toFixed(4);node.g.dataset.y=vector.y.toFixed(4);node.g.dataset.z=vector.z.toFixed(4);
   node.line.setAttribute('x1','60');node.line.setAttribute('y1','60');node.line.setAttribute('x2',x);node.line.setAttribute('y2',y);node.line.setAttribute('stroke-dasharray',vector.z<-.05?'3 3':'');node.line.style.opacity=depth?'0':vector.z<-.05?'.5':'1';
   node.circle.setAttribute('cx',x);node.circle.setAttribute('cy',y);node.text.setAttribute('x',x);node.text.setAttribute('y',y);node.text.textContent=node.label+(depth?(vector.z>0?'⊙':'⊗'):'');node.text.style.fontSize=depth?'9px':'11px';ordered.push([vector.z,node.g]);
  }
  ordered.sort((a,b)=>a[0]-b[0]).forEach(([,g])=>svg.append(g));
 }
 function documents(){return state().lesson.courseware||[];}
 function pageKey(ref){return ref.document+':'+ref.page;}
 function findPage(ref){const doc=documents().find(d=>d.id===ref.document);return doc&&{doc,page:doc.pages.find(p=>p.number===ref.page)};}
 function setPage(ref){
  const found=findPage(ref);if(!found?.page||!safeImage(found.page.image))return;currentPage=ref;
  const title=found.doc.title+' · PDF第'+ref.page+'页';$('course-title').textContent=title;$('course-caption').textContent=found.page.caption||'结合三维结构观察课件中的形态与位置。';$('course-image').alt=title;$('course-large-image').alt=title;$('course-dialog-title').textContent=title;$('course-error').hidden=true;$('course-image').hidden=false;
  if($('course-image').getAttribute('src')!==found.page.image){$('course-image').src=found.page.image;$('course-large-image').src=found.page.image;}
  $('course-page-select').value=pageKey(ref);
  document.querySelectorAll('#course-page-buttons button').forEach(b=>{b.classList.toggle('active',b.dataset.pageKey===pageKey(ref));b.setAttribute('aria-pressed',String(b.dataset.pageKey===pageKey(ref)));});
 }
 function renderCourse(){
  const s=state(),allowed=s.showNames&&s.mode==='lesson',refs=s.lesson.steps[s.stepIndex].course_pages||[],available=documents().length>0;
  $('course-toggle').hidden=!allowed||!available;$('course-toggle').textContent=courseOpen?'收起课件':'显示对应课件';$('course-toggle').setAttribute('aria-expanded',String(courseOpen&&allowed));$('course-panel').hidden=!courseOpen||!allowed||!available;document.body.classList.toggle('has-course',courseOpen&&allowed&&available);
  if(!allowed){$('course-dialog').close();$('course-image').removeAttribute('src');$('course-large-image').removeAttribute('src');currentPage=null;lastStep=-1;return;}
  const buttons=$('course-page-buttons');buttons.replaceChildren();$('course-page-select').replaceChildren();
  const all=documents().flatMap(doc=>doc.pages.map(p=>({document:doc.id,page:p.number})));for(const ref of all){const found=findPage(ref),button=element('button',(documents().length>1?(found.doc.short_title||found.doc.title)+' · ':'')+'第'+ref.page+'页');const option=element('option',button.textContent);option.value=pageKey(ref);$('course-page-select').append(option);button.dataset.pageKey=pageKey(ref);button.onclick=()=>{setPage(ref);};buttons.append(button);}
  if(s.stepIndex!==lastStep&&$('course-follow').checked&&refs.length)currentPage=refs[0];lastStep=s.stepIndex;if(!currentPage)currentPage=refs[0]||all[0];if(currentPage)setPage(currentPage);
 }
 function renderComparisons(){
  const s=state(),allowed=s.showNames&&(s.mode==='lesson'||s.mode==='compare');const cards=(s.lesson.comparisons||[]).filter(c=>(s.mode==='compare'?c.ids.filter(id=>s.ids.includes(id)).length>=2:c.ids.every(id=>s.ids.includes(id)))&&(s.mode==='compare'||!c.steps||c.steps.includes(s.stepIndex)));
  $('comparison-guide').hidden=!allowed||!cards.length;const root=$('comparison-cards');root.replaceChildren();if(!allowed)return;
  for(const card of cards){const section=element('section',null,'comparison-card');section.append(element('h3',card.title));
   for(const item of card.items.filter(item=>s.mode!=='compare'||!item.ids||item.ids.some(id=>s.ids.includes(id)))){const div=element('div');div.append(element('span',item.support==='visible'?'可在模型观察':item.support==='limited'?'形态可观察，细节需课件':'以课件图为准','evidence-tag'),element('p',item.label+'：'+item.cue));if(item.view){const button=element('button','切换观察角度');button.onclick=()=>fit(item.view);div.append(button);}section.append(div);}
   section.append(element('p','依据：'+card.source.title+(card.source.pages?.length?' · PDF第'+card.source.pages.join('、')+'页':'')+(card.source.locator?' · '+card.source.locator:''),'muted'));if(card.source.url){try{const url=new URL(card.source.url);if(url.protocol==='https:'){const link=element('a','参考资料 ↗');link.href=url.href;link.target='_blank';link.rel='noopener';section.append(link);}}catch{}}
   if(card.question){const answer=element('details'),summary=element('summary','想一想，再核对');answer.append(summary,element('p',card.question));if(card.answer){const nested=element('details');nested.append(element('summary','查看解释'),element('p',card.answer));answer.append(nested);}section.append(answer);}root.append(section);
  }
 }
 $('dim-context').onclick=()=>{if(!state().picked)return;dimmed=!dimmed;renderExtras();};$('context-opacity').oninput=()=>{opacity=Number($('context-opacity').value);applyMaterials();};
 $('visibility-reset').onclick=()=>{reset();changed(true);};
 $('course-toggle').onclick=()=>{courseOpen=!courseOpen;renderCourse();if(courseOpen)requestAnimationFrame(()=>$('course-panel').scrollIntoView({block:'nearest'}));};
 $('course-page-select').onchange=()=>{const [document,page]=$('course-page-select').value.split(':');setPage({document,page:Number(page)});};
 $('course-follow').onchange=()=>{lastStep=-1;renderCourse();};$('course-step').onclick=()=>{if(!currentPage)return;const ref=currentPage,index=state().lesson.steps.findIndex(step=>(step.course_pages||[]).some(r=>pageKey(r)===pageKey(ref)));if(index>=0){setStep(index);setPage(ref);document.querySelector('.viewport').scrollIntoView({block:'nearest'});}};
 $('course-expand').onclick=()=>$('course-dialog').showModal();$('course-close').onclick=()=>$('course-dialog').close();$('course-image').onerror=()=>{$('course-image').hidden=true;$('course-error').hidden=false;$('course-error').textContent='课件页图片未能加载，请检查本地学习页的课件资源。';};
 return {reset,applyVisibility,applyMaterials,renderStructures,renderExtras,renderOrientation,openPage(ref){if(!state().showNames||state().mode!=='lesson')return;courseOpen=true;renderCourse();setPage(ref);},status:()=>({hidden:[...hidden],dimmed,opacity,courseOpen,page:currentPage})};
}
