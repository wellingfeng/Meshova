import { chromium } from "playwright";
import { existsSync } from "node:fs";
const exe = ["E:/Meshova/node_modules/playwright-core/.local-browsers"].flatMap(()=>[]);
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, headless:true, args:["--use-gl=angle","--use-angle=swiftshader","--ignore-gpu-blocklist"] }).catch(async()=>await chromium.launch({headless:true}));
const pg = await b.newPage();
pg.on("console", m=>console.log("PAGE:",m.text()));
await pg.goto("http://localhost:5190/web/", {waitUntil:"networkidle"}).catch(e=>console.log("goto err",e.message));
await pg.waitForFunction(()=>window.__meshova, {timeout:15000});
await pg.evaluate(()=>window.__meshova.setFog(true,{density:0.5,height:5,shaft:1}));
await pg.waitForTimeout(500);
const r = await pg.evaluate(()=>{
  const fp = window.__fogPassDbg;
  return { has: !!fp, enabled: fp && fp.enabled, dens: fp && fp.uniforms.uDensity.value, depthSet: fp && !!fp.uniforms.tDepth.value };
});
console.log("RESULT", JSON.stringify(r));
await b.close();
