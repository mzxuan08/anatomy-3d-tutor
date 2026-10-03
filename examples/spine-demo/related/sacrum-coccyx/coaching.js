// Course-authored teaching only. No network service, inferred mastery or generated anatomy.
export function createCoaching({$, state, applyFrame, restoreScene}) {
 const drafts=new Map();let step=-1,guideIndex=-1,timer=null,hintIndex=0,lastSelection=null;
 const kinds={point:'点选与解释',explain:'解释依据',compare:'比较形态',relation:'说明空间关系'};
 const current=()=>state().lesson.steps[state().stepIndex];
 const canGuide=()=>state().mode==='lesson'&&state().showNames&&!current().quiz;
 function pause(){clearInterval(timer);timer=null;$('guide-play').textContent='自动播放';$('guide-play').setAttribute('aria-pressed','false');}
 function renderGuide(){
  const frames=current().guide||[];$('guide-panel').hidden=!canGuide()||!frames.length;
  const active=guideIndex>=0;$('guide-controls').hidden=!active;
  $('guide-start').textContent=active?'从头观察':'带我看一遍';
  $('guide-cue').textContent=active?`观察 ${guideIndex+1} / ${frames.length}：${frames[guideIndex].cue}\n依据：${current().source}`:'';
  $('guide-back').disabled=guideIndex<=0;$('guide-next').disabled=guideIndex>=frames.length-1;
 }
 function frame(index){
  if(!canGuide())return;const frames=current().guide||[];if(!frames.length)return;
  guideIndex=Math.max(0,Math.min(frames.length-1,index));applyFrame(frames[guideIndex]);renderGuide();
 }
 function saveDraft(){if(step>=0&&current())drafts.set(step,$('lesson-response').value);}
 function reset(){saveDraft();pause();guideIndex=-1;hintIndex=0;$('hint-content').replaceChildren();$('exercise-status').textContent='';$('exercise-criteria').replaceChildren();$('confusion-output').value='';}
 function render(){
  const s=state(),item=current();
  if(step!==s.stepIndex){pause();guideIndex=-1;hintIndex=0;$('hint-content').replaceChildren();step=s.stepIndex;$('lesson-response').value=drafts.get(step)||'';$('exercise-status').textContent='';}
  if(!canGuide()){pause();guideIndex=-1;}
  renderGuide();
  const allowed=s.mode==='lesson';$('lesson-exercise').hidden=!allowed||!item.exercise;
  $('hint-next').hidden=!allowed||!item.hints?.length;$('hint-content').hidden=!allowed;
  $('hint-next').disabled=hintIndex>=(item.hints?.length||0);
  $('exercise-kind').textContent=kinds[item.exercise?.kind]||'';
  $('exercise-check').hidden=item.exercise?.kind!=='point';
  $('exercise-check').disabled=!s.picked;
  const selected=s.picked?.userData.part.id;
  if(selected!==lastSelection){lastSelection=selected;$('exercise-status').textContent='';}
  if(item.exercise?.kind==='relation'&&s.layout!=='native')$('exercise-status').textContent='请先返回原位，再判断空间关系；并排位置不能作为依据。';
  if(!allowed){$('question-block').hidden=true;$('confusion-output').value='';}
  if(!s.showNames&&$('confusion-dialog').open)buildContext();
 }
 $('guide-start').onclick=()=>{pause();frame(0);};
 $('guide-next').onclick=()=>{pause();frame(guideIndex+1);};
 $('guide-back').onclick=()=>{pause();frame(guideIndex-1);};
 $('guide-play').onclick=()=>{
  if(timer){pause();return;}if(!canGuide())return;
  if(guideIndex<0||guideIndex===(current().guide?.length||0)-1)frame(0);
  $('guide-play').textContent='暂停演示';$('guide-play').setAttribute('aria-pressed','true');
  timer=setInterval(()=>{if(!canGuide()||guideIndex>=current().guide.length-1){pause();return;}frame(guideIndex+1);if(guideIndex===current().guide.length-1)pause();},4500);
 };
 $('guide-exit').onclick=()=>{pause();guideIndex=-1;restoreScene();renderGuide();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
 $('hint-next').onclick=()=>{
  const hints=current().hints||[];if(state().mode!=='lesson'||hintIndex>=hints.length)return;
  const p=document.createElement('p');p.textContent=`提示 ${hintIndex+1}：${hints[hintIndex++]}`;$('hint-content').append(p);$('hint-next').disabled=hintIndex>=hints.length;
 };
 $('lesson-response').oninput=()=>{drafts.set(state().stepIndex,$('lesson-response').value);};
 $('answer').addEventListener('click',e=>{
  if(!e.target.closest('summary')||!current().exercise||$('answer').open)return;
  if(!$('lesson-response').value.trim()){e.preventDefault();$('exercise-status').textContent='先写下你的判断与依据，再核对；不确定也可以写出来。';$('lesson-response').focus();}
 });
 $('answer').addEventListener('toggle',()=>{
  const root=$('exercise-criteria');root.replaceChildren();if(!$('answer').open||!current().exercise)return;
  const p=document.createElement('p');p.textContent='逐项核对你的原回答（自行核对，不自动评分）：';root.append(p);
  for(const criterion of current().exercise.criteria){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';label.append(check,document.createTextNode(criterion));root.append(label);}
  const source=document.createElement('p');source.className='muted';source.textContent='依据：'+current().source;root.append(source);
 });
 $('exercise-check').onclick=()=>{
  const s=state(),task=current().exercise;if(s.mode!=='lesson'||task?.kind!=='point'||!s.picked)return;
  $('exercise-status').textContent=s.picked.userData.part.id===task.target?'本次点选的是目标结构。仍需写出辨认依据；选中不等于理解。':'本次选择不是目标结构。先换角度、对照提示，再试一次。';
 };
 function buildContext(){
  const s=state(),blind=!s.showNames||s.mode==='review',item=current();
  const lines=['请按系统解剖学课程帮助我理解当前困惑，先给观察提示，再解释和复测。',`困惑类型：${$('confusion-type').value}`,`我的问题：${$('confusion-note').value.trim()||'请先问一个问题，帮我定位哪里没理解。'}`];
  if(blind)lines.push('当前正在无标签辨认。请不要先透露结构名称或答案。','目标结构和讲解已从此提问中隐藏；必要时请让我提供截图。');
  else {
   lines.push(`课程：${s.lesson.title}`,`步骤：${s.stepIndex+1} · ${item.title}`,`观察方向：${s.viewLabel}`,`排列：${s.layout==='native'?'原位':'并排，位置已平移'}`);
   if(s.picked){const p=s.picked.userData.part;lines.push(`选中结构：${s.displayName(p)} · ${p.name} · ${p.id}`);}
   const mark=s.landmark;if(mark)lines.push(`观察点：${mark.label}（辅助定位，非精确边界）`);
   if(item.prompt)lines.push(`当前问题：${item.prompt}`);
   if($('lesson-response').value.trim())lines.push(`我的原回答：${$('lesson-response').value.trim()}`);
   if(item.source)lines.push(`内容依据：${item.source}`);
   if(s.coursePage)lines.push(`当前课件：${s.coursePage.document} · PDF第${s.coursePage.page}页`);
  }
  lines.push('模型范围：静态表面网格；未显示的组织不能视为不存在，局部标记不是解剖分界。','请针对我的困惑讲解；模型看不清的细节用课件核对，不推断我已掌握。');
  $('confusion-output').value=lines.join('\n');$('confusion-status').textContent='已整理提问。复制到 Codex 对话即可接着讲；此页面不会自动发送。';
 }
 $('help-request').onclick=()=>{pause();buildContext();$('confusion-dialog').showModal();};
 $('confusion-build').onclick=buildContext;$('confusion-close').onclick=()=>$('confusion-dialog').close();
 $('confusion-type').onchange=()=>$('confusion-output').value='';$('confusion-note').oninput=()=>$('confusion-output').value='';
 $('confusion-copy').onclick=async()=>{
  buildContext();try{await navigator.clipboard.writeText($('confusion-output').value);$('confusion-status').textContent='已复制提问；粘贴到 Codex 对话即可。';}
  catch{$('confusion-output').focus();$('confusion-output').select();$('confusion-status').textContent='无法直接访问剪贴板，已选中提问，请按 Ctrl+C 或使用系统复制。';}
 };
 return {render,reset,pause,status:()=>({guideIndex,playing:!!timer,hintsShown:hintIndex})};
}
