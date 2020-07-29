import "regenerator-runtime";
export * from "./ffxiv-sheet-resolver";

import { performance } from "perf_hooks";

import { FFXIVSheetResolver } from "./ffxiv-datamining-github-api";

const sr = new FFXIVSheetResolver();

const t1 = performance.now();
sr.getSheet("TerritoryType").then(async rows => {
    const t2 = performance.now();
    console.log(rows);
    console.log(`Executed in ${(t2 - t1) / 1000}s.`);
    const t3 = performance.now();
    await sr.getSheet("TerritoryType");
    const t4 = performance.now();
    console.log(`Executed second request in ${(t4 - t3) / 1000}s.`);
});