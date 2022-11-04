/**
 * Has own property check.
 */
const hasProp = (o, p) => Object.prototype.hasOwnProperty.call(o, p);

/**
 * Returns the number of (own) keys of a given Object
 */
const objSize = (o) => Object.keys(o).length;

/**
 * Checks if object is arguments object
 */
const isArguments = (obj) => obj != null && hasProp(obj, 'callee');

const nullish = (obj) => obj === null || obj === undefined;

const emptyArray = (arr) => nullish(arr) || arr.length === 0;

module.exports = { hasProp, objSize, isArguments, emptyArray };
