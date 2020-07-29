# ffxiv-datamining-github-api
An XIVAPI-like API for "using the CSVs" off of GitHub.

## Installation
`npm i -S ffxiv-datamining-github-api`

## Usage
```js
import { FFXIVSheetResolver } from "./ffxiv-datamining-github-api";

const sr = new FFXIVSheetResolver();

sr.getSheet("BNpcParts").then(console.log);

// The optional second parameter is the recursion depth;
// increasing this increases execution time drastically.
// For the TerritoryType sheet, a recursion depth of 1
// resulted in an execution time of roughly 1.5 minutes,
// while a recursion depth of 0 resulted in an execution
// time of roughly 0.9 seconds.
sr.getSheet("Item", 0).then(console.log);

// The second parameter here is the row number to pull;
// recursion depth isn't an issue on single-row fetches.
// The optional third parameter corresponds to the
// recursion depth.
sr.getSheetItem("TerritoryType", 202).then(console.log);
sr.getSheetItem("TerritoryType", 203).then(console.log);

sr.searchSheet("Weather", {
    searchTerm: "heat waves",
}).then(console.log);

sr.searchSheet("BGMFade", {
    columns: ["ID", "BGMFadeType.ID"],
}).then(console.log);

sr.searchSheet("BGMFade", {
    filters: ["BGMFadeType.ID>=2"],
}).then(console.log);

sr.search({
    searchTerm: "eulmore",
    indexes: ["PlaceName"],
    recurseDepth: 0,
}).then(console.log);
```
