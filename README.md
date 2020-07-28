# ffxiv-datamining-github-api
(WIP) An XIVAPI-like API for "using the CSVs" off of GitHub. Currently (foreseeably?) very slow, and thus lacks a search function.

## Installation
`npm i -S ffxiv-datamining-github-api`

## Usage
```js
import { FFXIVSheetResolver } from "./ffxiv-datamining-github-api"

const sr = new FFXIVSheetResolver();

sr.getSheetItem("TerritoryType", 202).then(console.log);
sr.getSheetItem("TerritoryType", 203).then(console.log);
```