import { SheetResolver } from "./sheet-resolver"
import "regenerator-runtime"

const sr = new SheetResolver();

sr.getSheetItem("TerritoryType", 202).then(console.log);
sr.getSheetItem("TerritoryType", 203).then(console.log);