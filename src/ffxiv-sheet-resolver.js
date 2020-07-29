import bent from "bent";
import parse from "csv-parse";
import leven from "leven";
import NodeCache from "node-cache";
import Parallel from "paralleljs";

import {
    compareWithStringOperator,
    parseArrayString,
    parseFilters,
    parseValue,
    shove,
    validateSearchOptions
} from "./util";

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
            .map(row => searchOptions.columns
                ? shove(row, searchOptions.columns)
                : row);

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
    async getSheet(sheetName, recurseDepth = 1) {
        const [rows, headers, types] = await this.getSheetData(sheetName);

        for (let itemId = 0; itemId < rows.length; itemId++) {
            const item = await this.buildSheetItem(
                rows[itemId],
                headers,
                types,
                recurseDepth);
            rows[itemId] = item;
        }

        return rows;
    }

    /**
     * @param {string} sheetName The name of the sheet to get.
     * @param {number} itemId The row ID to get data for.
     * @param {number?} recurseDepth How deep to recurse sheet links.
     */
    async getSheetItem(sheetName, itemId, recurseDepth = 1) {
        const [rows, headers, types] = await this.getSheetData(sheetName);

        // Make a new object with the keys of headers, and the values of the argument row
        const item = await this.buildSheetItem(
            rows[itemId],
            headers,
            types,
            recurseDepth);
        
        return item;
    }

    async getSheetData(sheetName) {
        const cached = this.cache.get(sheetName);
        if (cached) {
            return cached;
        } else {
            const res = await this.csvHost(sheetName + ".csv");
            return new Promise(resolve => {
                parseRawSheet(res, (rows, headers, types) => {
                    const data = [rows, headers, types];
                    this.cache.set(sheetName, data);
                    resolve(data);
                });
            });
        }
    }

    /**
     * Builds a sheet item from a single table row.
     * @param {string[]} row The values of each column.
     * @param {string[]} headers The column headers.
     * @param {string[]} types The types of each column.
     * @param {number} recurseDepth The number of times to recurse sheet-linking.
     */
    async buildSheetItem(row, headers, types, recurseDepth) {
        if (row == null)
            return null;

        const retObj = {};
        for (let h = 0; h < headers.length; h++) {
            const headerCell = headers[h];
            const dataCell = row[h];
            const type = types[h];

            const [arrayName, arrayIndex] = parseArrayString(headerCell);
            
            if (arrayName == null) {
                retObj[headerCell] = parseValue(dataCell);
            } else {
                if (!retObj[arrayName]) {
                    retObj[arrayName] = [];
                }
                retObj[arrayName][arrayIndex] = parseValue(dataCell);
            }
            
            if (recurseDepth !== 0 && CONTENT.indexOf(type) !== -1) {
                const sheetIndex = retObj[headerCell];
                retObj[headerCell] = (await this.getSheetItem(type, sheetIndex, recurseDepth - 1));
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

        for (let i = 0; i < headers.length; i++) {
            headers[i] = headers[i].replace(/[{}]/g, "");
        }

        callbackFn(rows, headers, types);
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

        const result = compareWithStringOperator(value, filter.operator, filter.value);
        if (result) {
            continue;
        }

        return false;
    }
    return true;
}