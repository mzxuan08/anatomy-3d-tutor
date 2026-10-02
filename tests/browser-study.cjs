const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const outputDir=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'anatomy-study-test-'));
 const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{}),headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.ATLAS_TEST_URL||'http://127.0.0.1:8765/');await page.waitForFunction(()=>window.anatomyTutor?.status().triangles>0);
 const state=()=>page.evaluate(()=>window.anatomyTutor.status());
 async function choose(query){await page.locator('#search').fill(query);await page.locator('#search-results button').first().click();await page.waitForTimeout(100);}
 await choose('第3颈椎');await page.waitForTimeout(700);let before=await state();await page.locator('#zoom-picked').click();await page.waitForTimeout(800);let zoomed=await state();assert.ok(zoomed.cameraDistance<before.cameraDistance/2);assert.deepEqual(zoomed.visible,before.visible);
 await page.locator('#pin-compare').click();await page.locator('#pin-review').click();
 await choose('第4腰椎');await page.locator('#pin-compare').click();await page.locator('#pin-review').click();
 await page.locator('#compare-start').click();assert.equal((await state()).mode,'compare');assert.equal((await state()).visible.length,2);assert.equal((await state()).layout,'compare');assert.ok(Object.values((await state()).positions).some(p=>p.some(x=>x!==0)));
 await page.locator('#layout').click();assert.equal((await state()).layout,'native');assert.ok(Object.values((await state()).positions).every(p=>p.every(x=>x===0)));
 await page.locator('#layout').click();await page.waitForTimeout(750);await page.screenshot({path:path.join(outputDir,'compare.png')});
 await page.locator('#practice-exit').click();assert.equal((await state()).mode,'lesson');assert.ok(Object.values((await state()).positions).every(p=>p.every(x=>x===0)));
 // A fourth item is accepted, a fifth is explicitly refused; duplicates toggle away.
 for(const q of ['第5胸椎','第7胸椎','第2腰椎']){await choose(q);await page.locator('#pin-compare').click();}
 assert.equal(await page.locator('#compare-count').innerText(),'4 / 4');assert.match(await page.locator('#action-status').innerText(),/最多/);
 await page.locator('#review-start').click();assert.equal((await state()).mode,'review');assert.equal((await state()).showNames,false);assert.equal((await state()).visible.length,1);assert.equal(await page.locator('#search').isDisabled(),true);assert.equal(await page.locator('#review-export').isDisabled(),true);assert.equal(await page.locator('.mesh-label').count(),0);
 let body=await page.locator('body').innerText();assert.ok(!body.includes('第三颈椎'));assert.ok(!body.includes('第四腰椎'));assert.equal(await page.locator('#review-known').isVisible(),false);
 const first=(await state()).visible[0],firstView=await page.locator('#view-status').innerText();await page.locator('#recall-note').fill('根据椎体形态判断，侧别不适用');await page.locator('#review-reveal').click();assert.equal((await state()).showNames,true);assert.match(await page.locator('#practice-answer').innerText(),/术语来源/);await page.locator('#review-again').click();assert.equal((await state()).showNames,false);assert.equal(await page.locator('#recall-note').inputValue(),'');assert.ok((await state()).visible[0]!==first);
 await page.locator('#review-reveal').click();await page.locator('#review-known').click();assert.equal((await state()).mode,'review-summary');assert.match(await page.locator('#practice-body').innerText(),/还需再练 1 个/);
 const downloadEvent=page.waitForEvent('download');await page.locator('#review-export').click();const download=await downloadEvent;const output=path.join(outputDir,'review-export.md');await download.saveAs(output);const exported=fs.readFileSync(output,'utf8');assert.match(exported,/根据椎体形态判断/);assert.match(exported,/学生自评/);assert.match(exported,/术语来源/);
 await page.locator('#review-retry').click();assert.equal((await state()).visible[0],first);assert.notEqual(await page.locator('#view-status').innerText(),firstView);assert.equal((await state()).showNames,false);assert.match(await page.locator('#practice-title').innerText(),/1 \/ 1/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#scene canvas').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(outputDir,'recall.png'),fullPage:true});
 await page.locator('#practice-exit').click();assert.equal((await state()).mode,'lesson');assert.equal(await page.locator('#step-menu').isVisible(),true);
 await page.reload();await page.waitForFunction(()=>window.anatomyTutor?.status().ready);assert.equal(await page.locator('#review-count').innerText(),'0');assert.equal(await page.locator('#compare-count').innerText(),'0 / 4');
 assert.deepEqual(errors,[]);const report={status:'passed',checks:['放大保留周围结构','跨步骤等比例自选对比','原位及课程恢复不残留位移','对比上限与重复处理','自测清单及题面不泄露名称','先回答再揭示来源再自评','回答及自评导出','错项重练','手机自测布局','刷新清空本页清单'],pageErrors:errors};fs.writeFileSync(path.join(outputDir,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,outputDir}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
