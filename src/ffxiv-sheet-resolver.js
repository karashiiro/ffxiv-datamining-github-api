import bent from "bent";
import parse from "csv-parse";
import leven from "leven";
import NodeCache from "node-cache";

import { parseArrayString, parseFilters, parseValue, shove, validateSearchOptions } from "./util";

const CONTENT = require("../data/content.json");

export class FFXIVSheetResolver {
    /**
     * @param {string?} repoId The ID of the datamining repo to access, e.g. "xivapi/ffxiv-datamining".
     * @param {string?} branch The branch of the repo to access.
     * @param {number?} ttl The time-to-live of downloaded sheets, in seconds. Setting this to 0 disables expiry.
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
     * @typedef {Object} SearchOptions
     * @property {string?} searchTerm The term to search for.
     * @property {number?} scoreThreshold The search term matching sensitivity.
     * @property {string[]?} columns The sheet columns to return.
     * @property {string[]?} filters The filters to apply to the search results.
     * @property {number?} recurseDepth The sheet-linking recursion depth.
     */

    /**
     * Searches a single sheet for a search term.
     * @param {string} sheetName The name of the sheet to get.
     * @param {SearchOptions} searchOptions
     */
    async search(sheetName, searchOptions) {
        searchOptions = validateSearchOptions(searchOptions);

        const parsedFilters = searchOptions.filters
            ? parseFilters(searchOptions.filters)
            : null;

        const sheet = (await this.getSheet(sheetName, searchOptions.recurseDepth))
            .filter(row => row != null && searchOptions.searchTerm
                ? leven((row.Name || "").toLowerCase(), searchOptions.searchTerm) <= searchOptions.scoreThreshold
                : true)
            .filter(row => executeFilters(row, parsedFilters))
            .map(row => searchOptions.columns ? shove(row, searchOptions.columns) : row);

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

            parseRawSheet(res, async (rows, headers, types) => {
                for (let itemId = 0; itemId < rows.length; itemId++) {
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

            parseRawSheet(res, async (rows, headers, types) => {
                // Make a new object with the keys of headers, and the values of the argument row
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

function parseRawSheet(rawData, callbackFn) {
    let rows = [];

    const parser = parse();

    parser.on("readable", () => {
        let record;
        while (record = parser.read()) {
            rows.push(record);
        }
    })
    .on("error", console.error)
    .on("end", () => {
        rows = rows.slice(1); // Trash "key,0,1,etc." row
        rows[0][0] = "ID"; // Used to be "#", XIVAPI uses "ID"

        const headers = rows.shift();
        const types = rows.shift();

        callbackFn(rows, headers, types)
    });

    parser.end(rawData);
}

function executeFilters(row, parsedFilters) {
    if (parsedFilters == null)
        return true;

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