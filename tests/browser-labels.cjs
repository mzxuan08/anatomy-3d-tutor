const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||undefined,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(process.env.ATLAS_TEST_URL||'http://127.0.0.1:8813/');await page.waitForFunction(()=>window.anatomyTutor?.status().ready);
  await page.locator('#step-menu').selectOption('6');await page.waitForTimeout(750);
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:900});
   const data=await page.evaluate(()=>{const el=document.querySelector('.mesh-label'),r=el.getBoundingClientRect(),scene=document.getElementById('scene').getBoundingClientRect(),point=window.anatomyTutor.project('FJ3162');return {font:parseFloat(getComputedStyle(el).fontSize),corner:el.classList.contains('single-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,scene:{left:scene.left,right:scene.right,top:scene.top,bottom:scene.bottom},point};});
   assert.equal(data.corner,true);assert.ok(data.font<=10);assert.ok(!(data.point.x>=data.left&&data.point.x<=data.right&&data.point.y>=data.top&&data.point.y<=data.bottom));
   assert.ok(data.left>=data.scene.left&&data.right<=data.scene.right&&data.bottom<=data.scene.bottom);
  }
  await page.setViewportSize({width:1280,height:900});if(process.env.ATLAS_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ATLAS_SCREENSHOT_DIR,'名称标签优化.png')});
  await page.locator('#names').click();assert.equal(await page.locator('.mesh-label').count(),0);
  await page.locator('#step-menu').selectOption('2');assert.equal(await page.locator('.mesh-label').count(),3);assert.equal(await page.locator('.single-label').count(),0);
  console.log('Labels: single bone corner placement, compact text, mobile bounds, hiding and multi-bone labels passed.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
