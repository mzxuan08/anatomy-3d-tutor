export function lessonKey(lesson, atlas) {
 return JSON.stringify([lesson.title,atlas.sex,atlas.parts.map(p=>p.id).sort(),lesson.steps.map(s=>[s.title,s.show])]);
}
export function validateRecord(record, key, ids, stepCount) {
 if(!record||record.version!==1||record.lessonKey!==key)throw Error('这份记录属于其他课程或模型版本，请打开原学习页恢复。');
 const valid=new Set(ids);
 for(const [name,max] of [['compare',4],['review',ids.length]]){
  const list=record[name];if(!Array.isArray(list)||list.length>max||new Set(list).size!==list.length||list.some(id=>!valid.has(id)))throw Error('记录中的结构清单无效。');
 }
 if(!Number.isInteger(record.step)||record.step<0||record.step>=stepCount||!Array.isArray(record.results)||record.results.length>record.review.length)throw Error('记录中的步骤或回答无效。');
 const seen=new Set();for(const entry of record.results){if(!Array.isArray(entry)||entry.length!==2)throw Error('回答格式无效。');const [id,r]=entry;if(seen.has(id)||!record.review.includes(id)||!r||!['known','again'].includes(r.rating)||typeof r.note!=='string'||r.note.length>20000||!['front','back','left','right','top','bottom','oblique'].includes(r.view))throw Error('回答内容无效。');seen.add(id);}
 return record;
}
export function attachStudyRecord({$,lesson,atlas,get,restore}) {
 const key=lessonKey(lesson,atlas),storageKey='anatomy-study-v1:'+key;
 const status=message=>{$('record-status').textContent=message;};
 const pack=()=>({version:1,lessonKey:key,title:lesson.title,savedAt:new Date().toISOString(),...get()});
 const apply=record=>{validateRecord(record,key,atlas.parts.map(p=>p.id),lesson.steps.length);restore(record);status('已恢复清单、回答、自评与课程步骤。');};
 $('record-save').onclick=()=>{try{localStorage.setItem(storageKey,JSON.stringify(pack()));$('record-resume').disabled=false;status('已保存到本机浏览器。下次打开同一地址，点击“继续上次”。');}catch{status('浏览器无法保存，请用“备份记录”下载文件。');}};
 $('record-resume').onclick=()=>{try{const raw=localStorage.getItem(storageKey);if(!raw)throw Error('此地址没有保存的记录。');apply(JSON.parse(raw));}catch(e){status(e.message);}};
 $('record-download').onclick=()=>{const blob=new Blob([JSON.stringify(pack(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='anatomy-study-record.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('已备份记录；可在原课程中导入，跨浏览器或地址恢复。');};
 $('record-import').onclick=()=>$('record-file').click();
 $('record-file').onchange=async()=>{const file=$('record-file').files[0];if(!file)return;try{if(file.size>2000000)throw Error('记录文件超过2MB，请选择导出的学习记录。');apply(JSON.parse(await file.text()));}catch(e){status('未导入：'+e.message);}$('record-file').value='';};
 try{$('record-resume').disabled=!localStorage.getItem(storageKey);}catch{$('record-resume').disabled=true;}
 return {update(mode){for(const id of ['record-save','record-resume','record-download','record-import'])$(id).disabled=mode==='review'||(id==='record-resume'&&(()=>{try{return !localStorage.getItem(storageKey);}catch{return true;}})());}};
}
