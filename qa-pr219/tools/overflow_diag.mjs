import { chromium } from 'playwright';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto('http://127.0.0.1:4173/preview-v8/galeria/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(3000);
  const result=await page.evaluate(()=>{
    const vw=document.documentElement.clientWidth;
    const sw=document.documentElement.scrollWidth;
    const offenders=[];
    for(const el of document.querySelectorAll('body *')){
      const s=getComputedStyle(el);
      if(s.display==='none'||s.visibility==='hidden')continue;
      const r=el.getBoundingClientRect();
      if(!r.width&&!r.height)continue;
      if(r.right>vw+.5||r.left<-.5||r.width>vw+.5){
        offenders.push({
          tag:el.tagName.toLowerCase(),
          id:el.id||'',
          cls:String(el.className||'').slice(0,120),
          text:(el.textContent||'').trim().replace(/\s+/g,' ').slice(0,80),
          left:+r.left.toFixed(2),
          right:+r.right.toFixed(2),
          width:+r.width.toFixed(2),
          position:s.position,
          display:s.display,
          overflowX:s.overflowX,
          minWidth:s.minWidth,
          gridTemplateColumns:s.gridTemplateColumns
        });
      }
    }
    offenders.sort((a,b)=>(b.right-vw)-(a.right-vw));
    return {viewport:vw,scrollWidth:sw,offenders:offenders.slice(0,30)};
  });
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
