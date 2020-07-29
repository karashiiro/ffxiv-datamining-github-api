# ffxiv-datamining-github-api
An XIVAPI-like API for "using the CSVs" off of GitHub. Currently (foreseeably?) very slow, and thus lacks a comprehensive search function.

## Installation
`npm i -S ffxiv-datamining-github-api`

## Usage
```js
import { FFXIVSheetResolver } from "./ffxiv-datamining-github-api";

const sr = new FFXIVSheetResolver();

sr.getSheet("BNpcParts").then(console.log);

sr.getSheetItem("TerritoryType", 202).then(console.log);
sr.getSheetItem("TerritoryType", 203).then(console.log);

sr.search("Weather", {
    searchTerm: "heat waves",
}).then(console.log);

sr.search("BGMFade", {
    columns: ["ID", "BGMFadeType.ID"],
}).then(console.log);

sr.search("BGMFade", {
    filters: ["BGMFadeType.ID>=2"],
}).then(console.log);
```
