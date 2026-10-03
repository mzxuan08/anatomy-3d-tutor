const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.ATLAS_TEST_URL||'http://127.0.0.1:8813/');await page.waitForFunction(()=>window.anatomyTutor?.status().ready);
  // A guided camera tour must really alter the scene, and pause when interrupted.
  await page.locator('#step-menu').selectOption('6');await page.locator('#orbit').click();await page.locator('#guide-start').click();
  assert.equal(await page.locator('#orbit').getAttribute('aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>window.anatomyTutor.status().coaching.guideIndex),0);
  assert.equal(await page.evaluate(()=>window.anatomyTutor.status().landmarks.active),'l3-body');
  await page.locator('#guide-next').click();assert.equal(await page.evaluate(()=>window.anatomyTutor.status().landmarks.active),'l3-arch');
  await page.locator('#guide-back').click();assert.equal(await page.evaluate(()=>window.anatomyTutor.status().landmarks.active),'l3-body');
  if(process.env.ATLAS_SCREENSHOT_DIR){fs.mkdirSync(process.env.ATLAS_SCREENSHOT_DIR,{recursive:true});await page.locator('#guide-panel').scrollIntoViewIfNeeded();await page.waitForTimeout(750);await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'分步观察演示.png')});}
  await page.locator('#guide-play').click();assert.equal(await page.locator('#guide-play').innerText(),'暂停演示');
  await page.locator('[data-view="right"]').click();assert.equal(await page.locator('#guide-play').innerText(),'自动播放');
  await page.locator('#guide-play').click();await page.waitForFunction(()=>window.anatomyTutor.status().coaching.guideIndex===1);
  await page.locator('#guide-play').click();await page.waitForTimeout(4700);assert.equal(await page.evaluate(()=>window.anatomyTutor.status().coaching.guideIndex),1);
  await page.locator('#guide-exit').click();assert.equal(await page.evaluate(()=>window.anatomyTutor.status().landmarks.active),null);
  await page.locator('#answer summary').click();assert.equal(await page.locator('#answer').getAttribute('open'),null);assert.match(await page.locator('#exercise-status').innerText(),/先写/);
  await page.locator('#hint-next').click();assert.match(await page.locator('#hint-content').innerText(),/1/);
  assert.equal(await page.locator('#answer').getAttribute('open'),null);
  await page.locator('#lesson-response').fill('椎体和椎弓围成；相邻椎骨之间的孔另需核对。');await page.locator('#answer summary').click();
  await page.locator('#exercise-criteria label').first().waitFor({state:'visible'});
  assert.match(await page.locator('#exercise-criteria').innerText(),/椎体/);
  await page.locator('#step-menu').selectOption('7');await page.locator('#step-menu').selectOption('6');assert.match(await page.locator('#lesson-response').inputValue(),/椎体和椎弓/);assert.equal(await page.locator('#hint-content').innerText(),'');
  await page.locator('#step-menu').selectOption('3');await page.locator('#layout').click();
  assert.match(await page.locator('#exercise-status').innerText(),/原位/);
  await page.locator('#step-menu').selectOption('0');await page.locator('.structures summary').click();
  await page.locator('#guide-start').click();await page.locator('#guide-next').click();
  assert.ok(Object.values(await page.evaluate(()=>window.anatomyTutor.status().opacity)).some(v=>v<1));
  assert.equal(await page.evaluate(()=>window.anatomyTutor.status().layout),'native');await page.locator('#guide-exit').click();
  assert.ok(Object.values(await page.evaluate(()=>window.anatomyTutor.status().opacity)).every(v=>v===1));
  await page.locator('#structure-list button[data-part-id="FJ3162"]').click();await page.locator('#exercise-check').click();assert.match(await page.locator('#exercise-status').innerText(),/不是/);
  await page.locator('#structure-list button[data-part-id="FJ3161"]').click();await page.locator('#exercise-check').click();assert.match(await page.locator('#exercise-status').innerText(),/目标结构/);
  await page.locator('#help-request').click();await page.locator('#confusion-note').fill('我分不清孔的位置');await page.locator('#confusion-build').click();
  assert.match(await page.locator('#confusion-output').inputValue(),/FJ3161/);assert.match(await page.locator('#confusion-output').inputValue(),/我分不清孔的位置/);await page.locator('#confusion-close').click();
  // Blind help must not export target names, ids, or explanations before reveal.
  await page.locator('#step-menu').selectOption('4');assert.equal(await page.locator('#guide-panel').isVisible(),false);
  await page.locator('#help-request').click();await page.locator('#confusion-build').click();const blind=await page.locator('#confusion-output').inputValue();
  assert.ok(!blind.includes('FJ3161')&&!blind.includes('第三颈椎')&&!blind.includes('Cervical'));await page.locator('#confusion-close').click();
  for(const width of [390,320]){await page.setViewportSize({width,height:844});await page.locator('#help-request').click();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#confusion-close').click();}
  assert.deepEqual(errors,[]);console.log('Coaching: tours, interruption, hints, answers, relation, pointing, context and blind privacy passed.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
