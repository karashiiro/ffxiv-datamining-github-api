import bent from "bent";
import parse from "csv-parse";
import leven from "leven";
import NodeCache from "node-cache";

const CONTENT = require("../data/content.json");

export class FFXIVSheetResolver {
    /**
     * @param {string?} repoId The ID of the datamining repo to access, e.g. "xivapi/ffxiv-datamining".
     * @param {string?} branch The branch of the repo to access.
     * @param {number?} ttl The time-to-live of downloaded sheets. Setting this to 0 disables expiry.
     */
    constructor(repoId = "xivapi/ffxiv-datamining", branch = "master", ttl = 600) {
        this.csvHost = bent(`https://raw.githubusercontent.com/${repoId}/${branch}/csv/`, "string", "GET", 200);
        this.cache = new NodeCache({
            stdTTL: ttl,
            checkperiod: ttl === 0 ? 0 : 600,
        });
        this.resultsPerPage = 100;
    }

    /**
     * Searches a single sheet for a search term.
     * @param {string} sheetName The name of the sheet to get.
     * @param {string?} searchTerm The term to search for.
     * @param {number?} scoreThreshold The search term matching sensitivity.
     * @param {string[]?} columns The sheet columns to return.
     */
    async search(sheetName, searchTerm, scoreThreshold = 1, columns = null) {
        searchTerm = searchTerm.toLowerCase();
        const sheet = (await this.getSheet(sheetName))
            .filter(row => row != null && searchTerm
                ? leven((row.Name || "").toLowerCase(), searchTerm) <= scoreThreshold
                : true)
            .map(row => {
                return columns ? shove(row, columns) : row;
            });
        return {
            Pagination: {
                Page: 1,
                PageNext: 1,
                PagePrev: 1,
                PageTotal: 1,
                Results: sheet.length,
                ResultsPerPage: sheet.length,
                ResultsTotal: sheet.length,
            },
            Results: sheet,
        };
    }

    /**
     * @param {string} sheetName The name of the sheet to get.
     * @param {number?} recurseDepth How deep to recurse sheet links.
     */
    getSheet(sheetName, recurseDepth = 1) {
        return new Promise(async resolve => {
            const res = await this.getSheetRaw(sheetName);

            let rows = [];
            parseRawSheet(rows, res, async () => {
                rows = rows.slice(1); // Trash "key,0,1,etc." row
                rows[0][0] = "ID"; // Used to be "#", XIVAPI uses "ID"

                const headers = rows.shift();
                const types = rows.shift();
                
                for (let itemId = 0; itemId < rows.length; itemId++) {
                    // Make a new object with the keys of headers, and the values of the argument row
                    const item = await this.buildSheetItem(rows[itemId], headers, types, recurseDepth);
                    rows[itemId] = item;
                }
                
                resolve(rows);
            });
        });
    }

    /**
     * @param {string} sheetName The name of the sheet to get.
     * @param {number} itemId The row ID to get data for.
     * @param {number?} recurseDepth How deep to recurse sheet links.
     */
    getSheetItem(sheetName, itemId, recurseDepth = 1) {
        return new Promise(async resolve => {
            const res = await this.getSheetRaw(sheetName);

            let rows = [];
            parseRawSheet(rows, res, async () => {
                rows = rows.slice(1); // Trash "key,0,1,etc." row
                rows[0][0] = "ID"; // Used to be "#", XIVAPI uses "ID"
    
                const headers = rows.shift();
                const types = rows.shift();
                
                const item = await this.buildSheetItem(rows[itemId], headers, types, recurseDepth);
                
                resolve(item);
            });
        });
    }

    async getSheetRaw(sheetName) {
        let res;
        const cached = this.cache.get(sheetName);
        if (cached) {
            res = cached;
        } else {
            res = await this.csvHost(sheetName + ".csv");
            this.cache.set(sheetName, res);
        }
        return res;
    }

    async buildSheetItem(row, headers, types, recurseDepth) {
        if (row == null)
            return null;

        const retObj = {};
        for (let h = 0; h < headers.length; h++) {
            // Parse keys
            if (headers[h].indexOf("{") !== -1) {
                headers[h] = headers[h].replace(/[{}]/g, "");
            } else if (headers[h] === "") {
                continue;
            }

            const [arrayName, arrayIndex] = parseArrayString(headers[h]);

            // Parse values
            if (arrayName == null || arrayIndex == null) {
                retObj[headers[h]] = parseValue(row[h]);
            } else {
                // Array parsing
                if (!retObj[arrayName]) {
                    retObj[arrayName] = [];
                }

                retObj[arrayName][arrayIndex] = parseValue(row[h]);
            }

            if (recurseDepth !== 0 && CONTENT.includes(types[h])) {
                const sheetIndex = retObj[headers[h]];
                retObj[headers[h]] = (await this.getSheetItem(types[h], sheetIndex, recurseDepth - 1));
            }
        }
        return retObj;
    }
}

// Returns a new object with the properties of obj limited to those listed in okProps
function shove(obj, okProps) {
    const newObj = {};
    for (const prop of okProps) {
        newObj[prop] = obj[prop];
        const subProps = prop.split(".");
        let noRef = newObj[prop];
        let ooRef = obj[prop];
        for (const sProp of subProps) {
            noRef[sProp] = ooRef[sProp];
            noRef = noRef[sProp];
            ooRef = ooRef[sProp];
        }
    }
    return newObj;
}

function parseRawSheet(rows, rawData, callback) {
    const parser = parse();

    parser.on("readable", () => {
        let record;
        while (record = parser.read()) {
            rows.push(record);
        }
    })
    .on("error", console.error)
    .on("end", callback);

    parser.end(rawData);
}

function parseArrayString(str) {
    let arrayName = null;
    let arrayIndex = null;
    if (str.indexOf("[") !== -1) {
        arrayName = str.substring(0, str.indexOf("["))
        arrayIndex = parseInt(str.substring(str.indexOf("[") + 1, str.indexOf("]")));
    }
    return [arrayName, arrayIndex];
}

function parseValue(value) {
    const tryFloat = parseFloat(value);
    if (!isNaN(tryFloat)) {
        return tryFloat;
    } else if (value == "True") {
        return true;
    } else if (value == "False") {
        return false;
    } else if (value === "") {
        return null;
    } else {
        return value;
    }
}