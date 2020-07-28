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
     * @param {string[]?} filters The filters to apply to the search results.
     */
    async search(sheetName, searchTerm, scoreThreshold = 1, columns = null, filters = null) {
        if (searchTerm)
            searchTerm = searchTerm.toLowerCase();

        const parsedFilters = filters ? parseFilters(filters) : null;

        const sheet = (await this.getSheet(sheetName))
            .filter(row => row != null && searchTerm
                ? leven((row.Name || "").toLowerCase(), searchTerm) <= scoreThreshold
                : true)
            .filter(row => executeFilters(row, parsedFilters))
            .map(row => columns ? shove(row, columns) : row);

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

function executeFilters(row, parsedFilters) {
    for (const filter of parsedFilters) {
        // Loop down to whatever property is actually being checked for
        let value = row;
        const fieldNameComponents = filter.fieldName.split(".");
        for (const fnc of fieldNameComponents) {
            value = value[fnc];
        }

        // Actual checks
        switch (filter.operator) {
            case "=":
                if (value === filter.value)
                    continue;
                break;
            case ">":
                if (value > filter.value)
                    continue;
                break;
            case ">=":
                if (value >= filter.value)
                    continue;
                break;
            case "<":
                if (value < filter.value)
                    continue;
                break;
            case "<=":
                if (value <= filter.value)
                    continue;
                break;
        }
        return false;
    }
    return true;
}

function parseFilters(filters) {
    const parsedFilters = [];
    for (const filter of filters) {
        const lessThanIndex = filter.indexOf("<");
        const equalsIndex = filter.indexOf("=");
        const moreThanIndex = filter.indexOf(">");
        
        const operatorIndices = [];
        if (lessThanIndex !== -1) operatorIndices.push(lessThanIndex);
        if (equalsIndex !== -1) operatorIndices.push(equalsIndex);
        if (moreThanIndex !== -1) operatorIndices.push(moreThanIndex);
        
        const operatorStartIndex = Math.min(...operatorIndices);
        const operatorEndIndex = Math.max(...operatorIndices);

        const fieldName = filter.substring(0, operatorStartIndex);
        const operator = filter.substring(operatorStartIndex, operatorEndIndex + 1);
        const value = parseValue(filter.substring(operatorEndIndex + 1));
        
        parsedFilters.push({
            fieldName,
            operator,
            value,
        });
    }
    return parsedFilters;
}

// Returns a new object with the properties of obj limited to those listed in okProps
function shove(obj, okProps) {
    const newObj = {};
    for (const prop of okProps) {
        const subProps = prop.split(".");

        // Don't filter if no specific subproperties are specified,
        // just stick on the entire object.
        if (subProps.length === 1) {
            newObj[prop] = obj[prop];
            continue;
        }
        
        let noRef = newObj;
        let ooRef = obj;
        for (let i = 0; i < subProps.length - 1; i++) {
            noRef[subProps[i]] = {};
            noRef = noRef[subProps[i]];
            ooRef = ooRef[subProps[i]];
        }
        noRef[subProps[subProps.length - 1]] = ooRef[subProps[subProps.length - 1]]
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