import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto("http://localhost:3000", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__helploopMap && window.__helploopMap.loaded(), null, { timeout: 30000 });
await p.evaluate(() => window.__helploopMap.jumpTo({ center: [-122.2711, 37.8035], zoom: 16.2, pitch: 68, bearing: -35 }));
await p.waitForTimeout(6000); // let tiles + extrusions render under software GL
await p.screenshot({ path: "shots/3d-closeup.png" });
console.log("shots/3d-closeup.png");
await b.close();
