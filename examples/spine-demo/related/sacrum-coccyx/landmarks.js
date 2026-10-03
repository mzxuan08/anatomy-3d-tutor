import * as T from './vendor/three.module.js';

export function createLandmarks({$,lesson,meshes,scene,camera,state,fit,select,selectPage}){
 const marks=lesson.landmarks||[],list=$('landmark-list'),overlay=$('landmark-overlay');
 let active=null,patch=null,pin=null;
 const raycaster=new T.Raycaster();
 const allowed=()=>{const s=state();return s.showNames&&s.mode==='lesson'&&!lesson.steps[s.stepIndex].quiz;};
 function clear(){active=null;if(patch){scene.remove(patch);patch.geometry.dispose();patch.material.dispose();patch=null;}overlay.replaceChildren();pin=null;$('landmark-detail').textContent='点击一个标志，定位并观察局部。着色只是观察范围，不是解剖分界。';}
 function activate(mark){
  if(!allowed()||!meshes.get(mark.part)?.visible)return;
  clear();active=mark;const mesh=meshes.get(mark.part);select(mesh);fit(mark.view);
  const positions=mesh.geometry.attributes.position,indices=mesh.geometry.index,vertices=[];
  const point=new T.Vector3(...mark.point),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<indices.count;i+=3){a.fromBufferAttribute(positions,indices.getX(i));b.fromBufferAttribute(positions,indices.getX(i+1));c.fromBufferAttribute(positions,indices.getX(i+2));if(a.clone().add(b).add(c).multiplyScalar(1/3).distanceTo(point)<=mark.radius)vertices.push(...a.toArray(),...b.toArray(),...c.toArray());}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
  patch=new T.Mesh(geometry,new T.MeshBasicMaterial({color:'#eb9b28',side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));patch.renderOrder=3;scene.add(patch);
  pin=document.createElement('span');pin.className='landmark-pin';pin.textContent=mark.label;overlay.append(pin);
  $('landmark-detail').textContent=mark.cue+'\n着色范围仅辅助定位，不表示整个结构或精确边界。\n依据：'+mark.source+'\n核对：'+mark.review;
  render();
 }
 function renderButtons(){list.querySelectorAll('button[data-landmark]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.landmark===active?.id));b.classList.toggle('active',b.dataset.landmark===active?.id);});}
 function render(){
  const s=state(),visible=marks.filter(m=>m.steps.includes(s.stepIndex)&&meshes.get(m.part)?.visible);
  $('related-lessons').hidden=!allowed()||!$('related-lessons').children.length;
  $('landmark-panel').hidden=!allowed()||!visible.length;
  if(active&&(!allowed()||!visible.includes(active)))clear();list.replaceChildren();
  if(!allowed())return;
  for(const mark of visible){const button=document.createElement('button');button.textContent=mark.label;button.dataset.landmark=mark.id;button.onclick=()=>activate(mark);list.append(button);}
  if(active?.course_page){const button=document.createElement('button');button.textContent='对照标志课件图';button.onclick=()=>selectPage(active.course_page);list.append(button);}renderButtons();
 }
 function tick(){if(!active||!pin)return;const mesh=meshes.get(active.part);if(!allowed()||!mesh.visible){clear();return;}patch.position.copy(mesh.position);const world=new T.Vector3(...active.point).add(mesh.position),distance=camera.position.distanceTo(world);raycaster.set(camera.position,world.clone().sub(camera.position).normalize());const hit=raycaster.intersectObjects([...meshes.values()].filter(m=>m.visible))[0],occluded=hit&&hit.distance<distance-.0008;const p=world.project(camera);pin.hidden=occluded||p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;pin.style.left=(p.x+1)*$('scene').clientWidth/2+'px';pin.style.top=(1-p.y)*$('scene').clientHeight/2+'px';}
 $('landmark-clear').onclick=()=>{clear();renderButtons();};
 const related=$('related-lessons');for(const link of lesson.related_lessons||[]){const a=document.createElement('a');a.href=link.url;a.textContent=link.title;const p=document.createElement('p');p.className='muted';p.textContent=link.scope;related.append(a,p);}related.hidden=!related.children.length;
 return {render,tick,reset:clear,status:()=>({active:active?.id||null,triangles:patch?.geometry.attributes.position.count/3||0})};
}
