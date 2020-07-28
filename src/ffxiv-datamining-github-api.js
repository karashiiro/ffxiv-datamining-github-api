import "regenerator-runtime";
export * from "./ffxiv-sheet-resolver";

import { FFXIVSheetResolver } from "./ffxiv-datamining-github-api"

const sr = new FFXIVSheetResolver();

sr.search("BGMFade", undefined, undefined, ["ID", "BGMFadeType.ID"]).then(console.log);