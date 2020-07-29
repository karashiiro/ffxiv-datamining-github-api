import memoize from "fast-memoize";

/**
 * Returns a new object with the properties of obj limited to those listed in okProps.
 * @param {Object} obj The object to shove in.
 * @param {Object} okProps The properties the object will be shoved through.
 */
export function shove(obj, okProps) {
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

export function compareWithStringOperator(lhs, strop, rhs) {
    switch (strop) {
        case "=":
            if (lhs === rhs)
                return true;
            break;
        case ">":
            if (lhs > rhs)
                return true;
            break;
        case ">=":
            if (lhs >= rhs)
                return true;
            break;
        case "<":
            if (lhs < rhs)
                return true;
            break;
        case "<=":
            if (lhs <= rhs)
                return true;
            break;
    }
    return false;
}

/**
 * Parses a string such as array[0] into a tuple of the property name and index, e.g. ["array", 0].
 * @param {string} str
 */
export const parseArrayString = memoize(_parseArrayString);

function _parseArrayString(str) {
    let arrayName = null;
    let arrayIndex = null;
    if (str.indexOf("[") !== -1) {
        arrayName = str.substring(0, str.indexOf("["))
        arrayIndex = parseInt(str.substring(str.indexOf("[") + 1, str.indexOf("]")));
    }
    return [arrayName, arrayIndex];
}

/**
 * Parses lumped filters into arrays that can be more easily processed.
 * @param {string[]} filters An array of strings formatted as "[fieldName][operator][value]."
 */
export function parseFilters(filters) {
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

/**
 * Parses a string value into its nearest-representable integral type.
 * @param {string} value
 */
export const parseValue = memoize(_parseValue);

function _parseValue(value) {
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

/**
 * Turns the input SearchOptions into something that won't throw exceptions when used.
 * @param {SearchOptions} searchOptions
 */
export function validateSearchOptions(searchOptions) {
    if (!searchOptions)
        searchOptions = {};

    searchOptions.scoreThreshold || (searchOptions.scoreThreshold = 1);
    searchOptions.sortOrder || (searchOptions.sortOrder = "desc");
    searchOptions.indexes || (searchOptions.indexes = []);

    if (searchOptions.searchTerm)
        searchOptions.searchTerm = searchOptions.searchTerm.toLowerCase().trim();
    
    return searchOptions;
}