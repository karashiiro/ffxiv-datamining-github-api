import bent from "bent";
import parse from "csv-parse";
import NodeCache from "node-cache";

const CONTENT = require("../data/content.json");

export class SheetResolver {
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
    }

    /**
     * @param {string} sheetName The name of the sheet to get.
     * @param {number} itemId The row ID to get data for.
     * @param {number?} recurseDepth How deep to recurse sheet links.
     */
    getSheetItem(sheetName, itemId, recurseDepth = 1) {
        return new Promise(async resolve => {
            let res;
            const cached = this.cache.get(sheetName);
            if (cached) {
                res = cached;
            } else {
                res = await this.csvHost(sheetName + ".csv");
                this.cache.set(sheetName, res);
            }

            let rows = [];
            const parser = parse();
            parser.on("readable", () => {
                let record;
                while (record = parser.read()) {
                    rows.push(record);
                }
            })
            .on("error", console.error)
            .on("end", async () => {
                rows = rows.slice(1); // Trash "key,0,1,etc." row
                rows[0][0] = "ID"; // Used to be "#", XIVAPI uses "ID"

                const headers = rows.shift();
                const types = rows.shift();
                
                // Make a new object with the keys of headers, and the values of the argument row
                const retObj = {};
                for (let h = 0; h < headers.length; h++) {
                    // Parse keys
                    if (headers[h].indexOf("{") !== -1) {
                        headers[h] = headers[h].replace(/[{}]/g, "");
                    } else if (headers[h] === "") {
                        continue;
                    }

                    let arrayName = null;
                    let arrayIndex = null;
                    if (headers[h].indexOf("[") !== -1) {
                        arrayName = headers[h].substring(0, headers[h].indexOf("["))
                        arrayIndex = parseInt(headers[h].substring(headers[h].indexOf("[") + 1, headers[h].indexOf("]")));
                    }

                    // Parse values
                    if (arrayName == null || arrayIndex == null) {
                        retObj[headers[h]] = this.parseValue(rows[itemId][h]);
                    } else {
                        // Array parsing
                        if (!retObj[arrayName]) {
                            retObj[arrayName] = [];
                        }

                        retObj[arrayName][arrayIndex] = this.parseValue(rows[itemId][h]);
                    }

                    if (recurseDepth !== 0 && CONTENT.includes(types[h])) {
                        const sheetIndex = retObj[headers[h]];
                        retObj[headers[h]] = (await this.getSheetItem(types[h], sheetIndex, recurseDepth - 1));
                    }
                }
                
                resolve(retObj);
            });

            parser.end(res);
        });
    }

    parseValue(value) {
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
}