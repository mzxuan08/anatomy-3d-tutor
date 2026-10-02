import * as T from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

const $ = id => document.getElementById(id);
const namesOfView={front:'前面观',back:'后面观',left:'人体左侧观',right:'人体右侧观',top:'上面观',bottom:'下面观',oblique:'斜面观'};
const statuses={'textbook-matched':'教材匹配','course-matched':'课件匹配',derived:'规则派生',unmatched:'暂无已核对中文名'};
const colors={skeletal:'#ded0ad',muscular:'#b97571',arterial:'#c85758',venous:'#678cb1',nervous:'#d3b565',respiratory:'#9fbfb4',digestive:'#d4a685',urinary:'#bc947c',reproductive:'#c5a0aa',lymphatic:'#88ae91',endocrine:'#c4ad7b',integumentary:'#dbb7a0',connective:'#c0c6b0',brain:'#c8b6b1',cardiac:'#bb777b',borrowed:'#cabd90','donor-muscle':'#b78680'};
let lesson,atlas,renderer,scene,camera,controls,meshes=new Map(),stepIndex=0,showNames=true,layout='native',picked=null,lastView='oblique',ready=false,transition=null;
let userInteraction=false,isolated=false;
const host=$('scene'),labelHost=$('mesh-labels'),raycaster=new T.Raycaster();

function text(id,value){$(id).textContent=value??'';}
function displayName(part){return part.lesson_label||part.terminology?.zh||part.name;}
function safeName(part){return showNames?displayName(part):`结构 ${[...meshes.keys()].indexOf(part.id)+1}`;}
function detail(part){
 if(!showNames) return `${safeName(part)}\n请在聊天中说出名称和辨认依据，准备好后再查看答案。`;
 const reference=atlas.sex==='female'?(part.system==='borrowed'?'女性参考体上的男性来源借用骨':part.system==='donor-muscle'?'女性参考体上的第二女性来源下肢肌':'女性组合参考模型'):'男性参考模型';
 return `${displayName(part)}\n${part.name} · ${part.id}\n术语状态：${statuses[part.terminology?.status]||'未匹配'}${part.lesson_label?'；本课另有中文标注':''}\n${reference}`;
}
function updateNames(){
 text('names',showNames?'隐藏名称':'显示名称');
 $('names').classList.toggle('active',!showNames);
 labelHost.replaceChildren();
 const list=$('structure-list');list.replaceChildren();
 for(const mesh of meshes.values()){
  if(!mesh.visible)continue;
  const part=mesh.userData.part,button=document.createElement('button');button.className='structure-item';button.textContent=safeName(part);
  if(showNames){const small=document.createElement('small');small.textContent=part.name;button.append(small);}
  button.addEventListener('click',()=>select(mesh));list.append(button);
  if(showNames&&lesson.steps[stepIndex].show.length<=12){const el=document.createElement('span');el.className='mesh-label';el.textContent=displayName(part);el.dataset.id=part.id;labelHost.append(el);}
 }
 if(picked){text('picked',detail(picked.userData.part));}
 $('search').disabled=!showNames;$('search').placeholder=showNames?'中文、英文或模型ID':'辨认时隐藏名称搜索';$('search').value='';$('search-results').replaceChildren();
}
function select(mesh){
 picked=mesh;$('picked').hidden=false;text('picked',detail(mesh.userData.part));
 $('isolate').disabled=false;
 for(const m of meshes.values()){const highlighted=lesson.steps[stepIndex].highlight?.includes(m.userData.part.id);m.material.emissive.set(m===mesh?'#326c57':highlighted?'#3d614c':'#000000');m.material.emissiveIntensity=m===mesh ? .48 : highlighted ? .27 : 0;}
}
function visibleBox(){
 const box=new T.Box3();for(const mesh of meshes.values()){if(mesh.visible){mesh.updateMatrixWorld();box.union(new T.Box3().copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));}}return box;
}
function fit(view=lastView,animate=true){
 if(!ready)return;
 const box=visibleBox(),center=box.getCenter(new T.Vector3()),radius=Math.max(box.getBoundingSphere(new T.Sphere()).radius,.012);
 const direction={front:[0,0,1],back:[0,0,-1],left:[1,0,0],right:[-1,0,0],top:[0,1,0],bottom:[0,-1,0],oblique:[.5,.3,1]}[view]||[.5,.3,1];
 const distance=radius/Math.sin(T.MathUtils.degToRad(camera.fov/2))/Math.min(1,camera.aspect)*1.22;
 camera.up.set(...(view==='top'?[0,0,1]:view==='bottom'?[0,0,-1]:[0,1,0]));
 const targetPosition=center.clone().add(new T.Vector3(...direction).normalize().multiplyScalar(distance));
 controls.minDistance=Math.max(radius*.25,.008);controls.maxDistance=Math.max(distance*8,1);
 if(animate&&camera.up.y===1){transition={start:performance.now(),from:camera.position.clone(),fromTarget:controls.target.clone(),position:targetPosition,target:center};}
 else{transition=null;camera.position.copy(targetPosition);controls.target.copy(center);controls.update();}
 lastView=view;text('view-status',namesOfView[view]);
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
}
function setLayout(next,animate=true){
 layout=next;const visible=lesson.steps[stepIndex].show.map(id=>meshes.get(id)).filter(m=>m?.visible);
 let total=0,gap=.015;
 for(const mesh of visible){const box=mesh.geometry.boundingBox;total+=box.max.x-box.min.x+gap;}
 let cursor=-total/2;
 for(const mesh of visible){mesh.position.set(0,0,0);if(layout==='compare'){
  const box=mesh.geometry.boundingBox,width=box.max.x-box.min.x,center=box.getCenter(new T.Vector3());
  mesh.position.set(cursor+width/2-center.x,-center.y,-center.z);cursor+=width+gap;
 }}
 text('layout',layout==='native'?'并排对比':'返回原位');$('layout').classList.toggle('active',layout==='compare');$('layout-notice').hidden=layout!=='compare'&&!isolated;
 text('layout-notice',layout==='compare'?'同尺度形态对比：位置已平移。判断毗邻请切回原位。':'正在单独观察所选结构；返回本步整体后再判断毗邻。');
 if(picked&&!picked.visible){picked=null;$('picked').hidden=true;}
 fit(lesson.steps[stepIndex].view||'oblique',animate);
}
function setStep(index){
 stepIndex=Math.max(0,Math.min(lesson.steps.length-1,index));const step=lesson.steps[stepIndex];
 text('step-number',`STEP ${String(stepIndex+1).padStart(2,'0')} / ${String(lesson.steps.length).padStart(2,'0')}`);
 text('step-title',step.title);text('explanation',step.body);text('source',step.source);text('question',step.prompt);text('answer-text',step.answer);
 $('question-block').hidden=!step.prompt;$('answer').hidden=!step.answer;$('answer').open=false;
 $('step-menu').value=String(stepIndex);$('previous').disabled=stepIndex===0;$('next').disabled=stepIndex===lesson.steps.length-1;
 showNames=!step.quiz;picked=null;isolated=false;$('picked').hidden=true;$('isolate').disabled=true;text('isolate','单独观察');$('isolate').classList.remove('active');
 for(const mesh of meshes.values()){mesh.visible=step.show.includes(mesh.userData.part.id);mesh.material.emissive.set(step.highlight?.includes(mesh.userData.part.id)?'#3d614c':'#000000');mesh.material.emissiveIntensity=step.highlight?.includes(mesh.userData.part.id) ? .27 : 0;}
 controls.autoRotate=false;text('orbit','自动环绕');$('orbit').classList.remove('active');
 setLayout(step.layout||'native');updateNames();
}
function renderLabels(){
 for(const el of labelHost.children){const mesh=meshes.get(el.dataset.id);if(!mesh?.visible){el.hidden=true;continue;}
  const center=mesh.geometry.boundingBox.getCenter(new T.Vector3()).add(mesh.position);center.project(camera);
  el.hidden=center.z>1||center.z< -1||Math.abs(center.x)>1.05||Math.abs(center.y)>1.05;
  el.style.left=`${(center.x+1)*host.clientWidth/2}px`;el.style.top=`${(1-center.y)*host.clientHeight/2+36}px`;
 }
}
function tick(now){
 requestAnimationFrame(tick);
 if(transition){const t=Math.min(1,(now-transition.start)/650),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.position,ease);controls.target.lerpVectors(transition.fromTarget,transition.target,ease);if(t===1)transition=null;}
 controls.update();renderer.render(scene,camera);renderLabels();
}
async function initialize(){
 const responses=await Promise.all([fetch('lesson.json'),fetch('models/atlas.json')]);
 if(responses.some(r=>!r.ok))throw new Error('学习资料加载失败');[lesson,atlas]=await Promise.all(responses.map(r=>r.json()));
 document.title=lesson.title+' · 3D伴学';text('lesson-title',lesson.title);text('intro',lesson.intro||'观察、理解，再用指认检验记忆。');
 lesson.steps.forEach((s,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${i+1}. ${s.title}`;$('step-menu').append(option);});
 for(const source of lesson.sources||[]){const p=document.createElement('p');p.textContent=source.title+(source.pages?.length?` · PDF第${source.pages.join('、')}页`:'');$('resources').append(p);}
 renderer=new T.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
 renderer.domElement.setAttribute('aria-label','解剖学三维模型，可拖动旋转、滚轮缩放、点击选择结构');host.prepend(renderer.domElement);
 scene=new T.Scene();camera=new T.PerspectiveCamera(35,1,.001,100);camera.position.set(.5,1,2);
 controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.autoRotateSpeed=.75;
 controls.addEventListener('start',()=>{transition=null;userInteraction=true;text('view-status','自由视角 · 人体方位不变');document.querySelectorAll('[data-view]').forEach(b=>b.classList.remove('active'));});
 controls.addEventListener('end',()=>{userInteraction=false;});
 scene.add(new T.HemisphereLight('#ffffff','#75887c',1.0));const key=new T.DirectionalLight('#fff8ed',2.2);key.position.set(-2,4,4);scene.add(key);const rim=new T.DirectionalLight('#e1f4ef',.7);rim.position.set(3,1,-2);scene.add(rim);
 const chunkResponses=await Promise.all(atlas.chunks.map(c=>fetch(c.url)));if(chunkResponses.some(r=>!r.ok))throw new Error('模型几何加载失败');const buffers=await Promise.all(chunkResponses.map(r=>r.arrayBuffer()));
 for(const part of atlas.parts){const buffer=buffers[part.chunk];const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(buffer,part.positions,part.vertexCount*3),3));geometry.setAttribute('normal',new T.BufferAttribute(new Int16Array(buffer,part.normals,part.vertexCount*3),3,true));geometry.setIndex(new T.BufferAttribute(new Uint32Array(buffer,part.indices,part.indexCount),1));geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new T.MeshStandardMaterial({color:colors[part.system]||'#bbbaa7',roughness:.62,metalness:.025,side:T.DoubleSide});const mesh=new T.Mesh(geometry,material);mesh.userData.part=part;meshes.set(part.id,mesh);scene.add(mesh);
 }
 const resize=()=>{camera.aspect=host.clientWidth/Math.max(1,host.clientHeight);camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight);if(ready)fit(lastView,false);};new ResizeObserver(resize).observe(host);resize();
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY};});
 renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>5){down=null;return;}down=null;const rect=renderer.domElement.getBoundingClientRect();raycaster.setFromCamera(new T.Vector2((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1),camera);const hit=raycaster.intersectObjects([...meshes.values()].filter(m=>m.visible))[0];if(hit)select(hit.object);});
 $('previous').onclick=()=>setStep(stepIndex-1);$('next').onclick=()=>setStep(stepIndex+1);$('step-menu').onchange=e=>setStep(Number(e.target.value));
 $('names').onclick=()=>{showNames=!showNames;updateNames();};$('layout').onclick=()=>{setLayout(layout==='native'?'compare':'native');updateNames();};$('fit').onclick=()=>fit(lesson.steps[stepIndex].view||'oblique');
 $('isolate').onclick=()=>{if(!picked)return;isolated=!isolated;for(const mesh of meshes.values())mesh.visible=isolated?mesh===picked:lesson.steps[stepIndex].show.includes(mesh.userData.part.id);text('isolate',isolated?'返回本步整体':'单独观察');$('isolate').classList.toggle('active',isolated);setLayout('native');updateNames();};
 $('search').addEventListener('input',()=>{const results=$('search-results');results.replaceChildren();const query=$('search').value.trim().toLowerCase();if(!query||!showNames)return;const found=atlas.parts.filter(p=>`${displayName(p)} ${p.name} ${p.id}`.toLowerCase().includes(query)).slice(0,10);for(const part of found){const button=document.createElement('button');button.className='structure-item';button.textContent=displayName(part);const small=document.createElement('small');small.textContent=part.name;button.append(small);button.onclick=()=>{const index=lesson.steps.findIndex(s=>s.show.includes(part.id));setStep(index);select(meshes.get(part.id));};results.append(button);}if(!found.length){const p=document.createElement('p');p.textContent='本页未包含该结构。可在聊天中让我查询完整模型清单。';results.append(p);}});
 $('orbit').onclick=()=>{transition=null;controls.autoRotate=!controls.autoRotate;text('orbit',controls.autoRotate?'暂停环绕':'自动环绕');$('orbit').classList.toggle('active',controls.autoRotate);if(controls.autoRotate)text('view-status','自动环绕 · 人体方位不变');};
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(b.dataset.view));
 ready=true;setStep(0);fit(lesson.steps[0].view||'oblique',false);text('load-status',`${atlas.sex==='female'?'女性组合参考':'男性参考'} · ${atlas.parts.length} 个结构`);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;text('load-status','三维渲染已暂停，请刷新恢复');});
 window.anatomyTutor={setStep,setView:fit,setNames(value){showNames=!!value;updateNames();},status(){return {ready,step:stepIndex,showNames,layout,visible:[...meshes.values()].filter(m=>m.visible).map(m=>m.userData.part.id),triangles:renderer.info.render.triangles};},project(id){const mesh=meshes.get(id);if(!mesh||!mesh.visible)return null;const point=mesh.geometry.boundingBox.getCenter(new T.Vector3()).add(mesh.position).project(camera);const rect=renderer.domElement.getBoundingClientRect();return {x:rect.x+(point.x+1)*rect.width/2,y:rect.y+(1-point.y)*rect.height/2};}};
 requestAnimationFrame(tick);
}
initialize().catch(error=>{text('load-status','加载未完成');const p=document.createElement('p');p.className='error';p.textContent=`无法完成三维展示：${error.message}。可继续在聊天中结合课件图学习。`;host.append(p);});
