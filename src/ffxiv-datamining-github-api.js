import "regenerator-runtime";
export * from "./ffxiv-sheet-resolver";

import { performance } from "perf_hooks";

import { FFXIVSheetResolver } from "./ffxiv-sheet-resolver";

const sr = new FFXIVSheetResolver();

const t1 = performance.now();
sr.getSheet("TerritoryType").then((rows) => {
    const t2 = performance.now();
    console.log(rows);
    console.log(`Finished in ${t2 - t1}ms.`);
}).then(() => {
    const t3 = performance.now();
    sr.getSheet("TerritoryType").then(() => {
        const t4 = performance.now();
        console.log(`Finished second request in ${t4 - t3}ms.`);
    });
});