/*
========================================
Meteor is licensed under the MIT License
========================================

Copyright (C) 2011--2012 Meteor Development Group

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


====================================================================
This license applies to all code in Meteor that is not an externally
maintained library. Externally maintained libraries have their own
licenses, included below:
====================================================================

*/

const LocalCollection = {};
const EJSON = require("./EJSON");
const { hasProp, emptyArray } = require("./helpers");

// Like Array.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
// arrays.
const isArray = (x) => Array.isArray(x) && !EJSON.isBinary(x);

const _anyIfArray = (x, f) => (isArray(x) ? x.some((el) => f(el)) : f(x));

const _anyIfArrayPlus = (x, f) =>
  f(x) ? true : isArray(x) && x.some((el) => f(el));

const hasOperators = (valueSelector) => {
  let theseAreOperators = undefined;

  Object.keys(valueSelector).forEach((selKey) => {
    const thisIsOperator = selKey.substr(0, 1) === "$";

    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      throw new Error("Inconsistent selector: " + valueSelector);
    }
  });
  return !!theseAreOperators; // {} has no operators
};

const compileValueSelector = (valueSelector) => {
  if (valueSelector == null) {
    // undefined or null
    return (value) => _anyIfArray(value, (x) => x === undefined || x === null);
  }

  // Arrays match either identical arrays or arrays that contain it as a value.
  if (isArray(valueSelector)) {
    return (value) =>
      isArray(value)
        ? _anyIfArrayPlus(value, (x) =>
            LocalCollection._f._equal(valueSelector, x)
          )
        : false;
  }

  // test for instanceof before checking if is object to avoid false-positives
  // when passing a RegExp instance to this one
  if (valueSelector instanceof RegExp) {
    return (value) =>
      value !== undefined
        ? _anyIfArray(value, (x) => valueSelector.test(x))
        : false;
  }

  // Selector is a non-null primitive (and not an array or RegExp either).
  if (typeof valueSelector !== "object") {
    return (value) => _anyIfArray(value, (x) => x === valueSelector);
  }

  // It's an object, but not an array or regexp.
  if (hasOperators(valueSelector)) {
    const operatorFunctions = [];

    Object.entries(valueSelector).forEach(([operator, operand]) => {
      if (!hasProp(VALUE_OPERATORS, operator)) {
        throw new Error("Unrecognized operator: " + operator);
      }

      const opFn = VALUE_OPERATORS[operator];
      operatorFunctions.push(opFn(operand, valueSelector.$options));
    });

    return (value) => operatorFunctions.every((f) => f(value));
  }

  // It's a literal; compare value (or element of value array) directly to the
  // selector.
  return (value) =>
    _anyIfArray(value, (x) => LocalCollection._f._equal(valueSelector, x));
};

// XXX can factor out common logic below
const LOGICAL_OPERATORS = {
  $and(subSelector) {
    if (!isArray(subSelector) || emptyArray(subSelector)) {
      throw Error("$and/$or/$nor must be nonempty array");
    }

    const subSelectorFunctions = subSelector.map(compileDocumentSelector);
    return (doc) => subSelectorFunctions.every((fn) => fn(doc));
  },

  $or(subSelector) {
    if (!isArray(subSelector) || emptyArray(subSelector)) {
      throw Error("$and/$or/$nor must be nonempty array");
    }

    const subSelectorFunctions = subSelector.map(compileDocumentSelector);
    return (doc) => subSelectorFunctions.some((fn) => fn(doc));
  },

  $nor(subSelector) {
    if (!isArray(subSelector) || emptyArray(subSelector)) {
      throw Error("$and/$or/$nor must be nonempty array");
    }

    const subSelectorFunctions = subSelector.map(compileDocumentSelector);
    return (doc) => subSelectorFunctions.every((f) => !f(doc));
  },

  $where(selectorValue) {
    if (!(selectorValue instanceof Function)) {
      // NOTE: replaced Function("return " + selectorValue); with
      // a closure to avoid any eval issues at all
      selectorValue = () => selectorValue;
    }
    return (doc) => selectorValue.call(doc);
  },
};

const VALUE_OPERATORS = {
  $in(operand) {
    if (!isArray(operand)) {
      throw new Error("Argument to $in must be array");
    }

    const opFn = (x) => operand.some((el) => LocalCollection._f._equal(el, x));
    return (value) => _anyIfArrayPlus(value, opFn);
  },

  $all(operand) {
    if (!isArray(operand)) {
      throw new Error("Argument to $all must be array");
    }

    return (value) =>
      isArray(value)
        ? operand.every((opEl) =>
            value.some((valEl) => LocalCollection._f._equal(opEl, valEl))
          )
        : false;
  },

  $lt(operand) {
    const opFn = (x) => LocalCollection._f._cmp(x, operand) < 0;
    return (value) => _anyIfArray(value, opFn);
  },

  $lte(operand) {
    const opFn = (x) => LocalCollection._f._cmp(x, operand) <= 0;
    return (value) => _anyIfArray(value, opFn);
  },

  $gt(operand) {
    const opFn = (x) => LocalCollection._f._cmp(x, operand) > 0;
    return (value) => _anyIfArray(value, opFn);
  },

  $gte(operand) {
    const opFn = (x) => LocalCollection._f._cmp(x, operand) >= 0;
    return (value) => _anyIfArray(value, opFn);
  },

  $ne(operand) {
    const opFn = (x) => LocalCollection._f._equal(x, operand);
    return (value) => !_anyIfArrayPlus(value, opFn);
  },

  $nin(operand) {
    if (!isArray(operand)) {
      throw new Error("Argument to $nin must be array");
    }

    const inFunction = VALUE_OPERATORS.$in(operand);
    return (value) => (value !== undefined ? !inFunction(value) : true); // Field doesn't exist, so it's not-in operand
  },

  $exists(operand) {
    return (value) => operand === (value !== undefined);
  },

  $mod(operand) {
    const divisor = operand[0];
    const remainder = operand[1];

    const opFn = (x) => x % divisor === remainder;
    return (value) => _anyIfArray(value, opFn);
  },

  $size(operand) {
    return (value) => isArray(value) && operand === value.length;
  },

  $type: function (operand) {
    const opFn = (x) => LocalCollection._f._type(x) === operand;
    return (value) => {
      // A nonexistent field is of no type.
      if (value === undefined) return false;
      // Definitely not _anyIfArrayPlus: $type: 4 only matches arrays that have
      // arrays as elements according to the Mongo docs.
      // TODO this should now be supported
      return _anyIfArray(value, opFn);
    };
  },

  $regex(operand, options) {
    if (options !== undefined) {
      // Options passed in $options (even the empty string) always overrides
      // options in the RegExp object itself.

      // Be clear that we only support the JS-supported options, not extended
      // ones (eg, Mongo supports x and s). Ideally we would implement x and s
      // by transforming the regexp, but not today...
      if (/[^gim]/.test(options)) {
        throw new Error("Only the i, m, and g regexp options are supported");
      }

      const regexSource = operand instanceof RegExp ? operand.source : operand;
      operand = new RegExp(regexSource, options);
    } else if (!(operand instanceof RegExp)) {
      operand = new RegExp(operand);
    }

    const opFn = (x) => operand.test(x);
    return (value) => (value !== undefined ? _anyIfArray(value, opFn) : false);
  },

  $options(/* operand */) {
    // evaluation happens at the $regex function above
    return (/* value */) => true;
  },

  $elemMatch(operand) {
    const matcher = compileDocumentSelector(operand);
    const matchFn = (x) => matcher(x);
    return (value) => (isArray(value) ? value.some(matchFn) : false);
  },

  $not(operand) {
    const matcher = compileValueSelector(operand);
    return (value) => !matcher(value);
  },

  $near(/* operand */) {
    // Always returns true. Must be handled in post-filter/sort/limit
    return (/* value */) => true;
  },

  $geoIntersects(/* operand */) {
    // Always returns true. Must be handled in post-filter/sort/limit
    return (/* value */) => true;
  },
};

// XXX: extracted, since this is created many times during recursion
const toArray = (obj) => {
  const ret = [];
  Object.entries(obj).forEach(([key, value]) => {
    ret.push(key);
    ret.push(value);
  });
  return ret;
};

// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _type(v) {
    if (typeof v === "number") return 1;
    if (typeof v === "string") return 2;
    if (typeof v === "boolean") return 8;
    if (isArray(v)) return 4;
    if (v === null) return 10;
    if (v instanceof RegExp) return 11;
    if (typeof v === "function") {
      // note that typeof(/x/) === "function"
      return 13;
    }
    if (v instanceof Date) return 9;
    if (EJSON.isBinary(v)) return 5;
    return 3; // object

    // XXX support some/all of these:
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal(a, b) {
    return EJSON.equals(a, b, { keyOrderSensitive: true });
  },

  // maps a type code to a value that can be used to sort values of
  // different types
  _typeorder(t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [
      -1, // (not a type)
      1, // number
      2, // string
      3, // object
      4, // array
      5, // binary
      -1, // deprecated
      6, // ObjectID
      7, // bool
      8, // Date
      0, // null
      9, // RegExp
      -1, // deprecated
      100, // JS code
      2, // deprecated (symbol)
      100, // JS code
      1, // 32-bit int
      8, // Mongo timestamp
      1, // 64-bit int
    ][t];
  },

  // compare two values of unknown type according to BSON ordering
  // semantics. (as an extension, consider 'undefined' to be less than
  // any other value.) return negative if a is less, positive if b is
  // less, or 0 if equal
  _cmp(a, b) {
    if (a === undefined) return b === undefined ? 0 : -1;
    if (b === undefined) return 1;
    let ta = LocalCollection._f._type(a);
    let tb = LocalCollection._f._type(b);
    const oa = LocalCollection._f._typeorder(ta);
    const ob = LocalCollection._f._typeorder(tb);
    if (oa !== ob) return oa < ob ? -1 : 1;
    if (ta !== tb) {
      // XXX need to implement this if we implement Symbol or integers, or
      // Timestamp
      throw Error("Missing type coercion logic in _cmp");
    }
    if (ta === 7) {
      // ObjectID
      // Convert to string.
      ta = tb = 2;
      a = a.toHexString();
      b = b.toHexString();
    }
    if (ta === 9) {
      // Date
      // Convert to millis.
      ta = tb = 1;
      a = a.getTime();
      b = b.getTime();
    }

    if (ta === 1) {
      // double
      return a - b;
    }
    if (tb === 2) {
      // string
      return a < b ? -1 : a === b ? 0 : 1;
    }
    if (ta === 3) {
      // Object
      return LocalCollection._f._cmp(toArray(a), toArray(b));
    }
    if (ta === 4) {
      // Array
      const max = a.length > b.length ? a.length : b.length;

      for (let i = 0; i < max; i++) {
        if (i === a.length) return i === b.length ? 0 : -1;
        if (i === b.length) return 1;

        const s = LocalCollection._f._cmp(a[i], b[i]);
        if (s !== 0) return s;
      }
    }
    if (ta === 5) {
      // binary
      // Surprisingly, a small binary blob is always less than a large one in
      // Mongo.
      if (a.length !== b.length) return a.length - b.length;
      for (let i = 0; i < a.length; i++) {
        if (a[i] < b[i]) return -1;
        if (a[i] > b[i]) return 1;
      }
      return 0;
    }
    if (ta === 8) {
      // boolean
      if (a) return b ? 0 : 1;
      return b ? -1 : 0;
    }
    if (ta === 10) {
      // null
      return 0;
    }
    if (ta === 11) {
      // regexp
      throw Error("Sorting not supported on regular expression"); // XXX
    }
    // 13: javascript code
    // 14: symbol
    // 15: javascript code with scope
    // 16: 32-bit integer
    // 17: timestamp
    // 18: 64-bit integer
    // 255: minkey
    // 127: maxkey
    if (ta === 13) {
      // javascript code
      throw Error("Sorting not supported on Javascript code"); // XXX
    }
    throw Error("Unknown type to sort");
  },
};

// _makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// values.  This array has more than one element if any segment of the key other
// than the last one is an array.  ie, any arrays found when doing non-final
// lookups result in this function "branching"; each element in the returned
// array represents the value found at this branch. If any branch doesn't have a
// final value for the full key, its element in the returned list will be
// undefined. It always returns a non-empty array.
//
// _makeLookupFunction('a.x')({a: {x: 1}}) returns [1]
// _makeLookupFunction('a.x')({a: {x: [1]}}) returns [[1]]
// _makeLookupFunction('a.x')({a: 5})  returns [undefined]
// _makeLookupFunction('a.x')({a: [{x: 1},
//                                 {x: [2]},
//                                 {y: 3}]})
//   returns [1, [2], undefined]
LocalCollection._makeLookupFunction = function (key) {
  const dotLocation = key.indexOf(".");
  let first, lookupRest, nextIsNumeric;

  if (dotLocation === -1) {
    first = key;
  } else {
    first = key.substr(0, dotLocation);
    const rest = key.substr(dotLocation + 1);
    lookupRest = LocalCollection._makeLookupFunction(rest);
    // Is the next (perhaps final) piece numeric (ie, an array lookup?)
    nextIsNumeric = /^\d+(\.|$)/.test(rest);
  }

  return (doc) => {
    if (doc == null) {
      // null or undefined
      return [undefined];
    }

    let firstLevel = doc[first];

    // We don't "branch" at the final level.
    if (!lookupRest) return [firstLevel];

    // It's an empty array, and we're not done: we won't find anything.
    if (isArray(firstLevel) && firstLevel.length === 0) return [undefined];

    // For each result at this level, finish the lookup on the rest of the key,
    // and return everything we find. Also, if the next result is a number,
    // don't branch here.
    //
    // Technically, in MongoDB, we should be able to handle the case where
    // objects have numeric keys, but Mongo doesn't actually handle this
    // consistently yet itself, see eg
    // https://jira.mongodb.org/browse/SERVER-2898
    // https://github.com/mongodb/mongo/blob/master/jstests/array_match2.js
    if (!isArray(firstLevel) || nextIsNumeric) {
      firstLevel = [firstLevel];
    }

    return Array.prototype.concat.apply([], firstLevel.map(lookupRest));
  };
};

/**
 * The main compilation function for a given selector.
 * TODO make $elemMatch to work with value operators
 * @param docSelector
 * @return {function(*=): boolean}
 */
const compileDocumentSelector = function compileDocumentSelector(docSelector) {
  const perKeySelectors = [];
  Object.entries(docSelector || {}).forEach(([key, subSelector]) => {
    if (key.substr(0, 1) === "$") {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!hasProp(LOGICAL_OPERATORS, key)) {
        throw new Error("Unrecognized logical operator: " + key);
      }
      perKeySelectors.push(LOGICAL_OPERATORS[key](subSelector));
    } else {
      const lookUpByIndex = LocalCollection._makeLookupFunction(key);
      const valueSelectorFunc = compileValueSelector(subSelector);
      perKeySelectors.push((doc) => {
        const branchValues = lookUpByIndex(doc);
        // We apply the selector to each "branched" value and return true if any
        // match. This isn't 100% consistent with MongoDB; eg, see:
        // https://jira.mongodb.org/browse/SERVER-8585
        return branchValues.some(valueSelectorFunc);
      });
    }
  });

  return (doc) => perKeySelectors.every((f) => f(doc));
};

/**
 * Give a sort spec, which can be in any of these forms:
 *   {"key1": 1, "key2": -1}
 *   [["key1", "asc"], ["key2", "desc"]]
 *   ["key1", ["key2", "desc"]]
 *
 * (.. with the first form being dependent on the key enumeration
 * behavior of your javascript VM, which usually does what you mean in
 * this case if the key names don't look like integers ..)
 *
 * return a function that takes two objects, and returns -1 if the
 * first object comes first in order, 1 if the second object comes
 * first, or 0 if neither object comes before the other.
 * @param spec
 * @return {*}
 * @private
 */

LocalCollection._compileSort = function compileSort(spec) {
  const sortSpecParts = [];

  if (spec instanceof Array) {
    for (let i = 0; i < spec.length; i++) {
      if (typeof spec[i] === "string") {
        sortSpecParts.push({
          lookup: LocalCollection._makeLookupFunction(spec[i]),
          ascending: true,
        });
      } else {
        sortSpecParts.push({
          lookup: LocalCollection._makeLookupFunction(spec[i][0]),
          ascending: spec[i][1] !== "desc",
        });
      }
    }
  } else if (typeof spec === "object" && spec !== null) {
    Object.keys(spec).forEach((key) => {
      sortSpecParts.push({
        lookup: LocalCollection._makeLookupFunction(key),
        ascending: spec[key] >= 0,
      });
    });
  } else {
    throw Error("Bad sort specification: ", JSON.stringify(spec));
  }

  if (sortSpecParts.length === 0)
    return function () {
      return 0;
    };

  // reduceValue takes in all the possible values for the sort key along various
  // branches, and returns the min or max value (according to the bool
  // findMin). Each value can itself be an array, and we look at its values
  // too. (ie, we do a single level of flattening on branchValues, then find the
  // min/max.)
  const reduceValue = (branchValues, findMin) => {
    let reduced = undefined;
    let first = true;
    // Iterate over all the values found in all the branches, and if a value is
    // an array itself, iterate over the values in the array separately.
    Object.entries(branchValues).forEach(([key, branchValue]) => {
      // Value not an array? Pretend it is.
      if (!isArray(branchValue)) {
        branchValue = [branchValue];
      }
      // Value is an empty array? Pretend it was missing, since that's where it
      // should be sorted.
      if (isArray(branchValue) && branchValue.length === 0) {
        branchValue = [undefined];
      }

      branchValue.forEach((value) => {
        // We should get here at least once: lookup functions return non-empty
        // arrays, so the outer loop runs at least once, and we prevented
        // branchValue from being an empty array.
        if (first) {
          reduced = value;
          first = false;
        } else {
          // Compare the value we found to the value we found so far, saving it
          // if it's less (for an ascending sort) or more (for a descending
          // sort).
          const cmp = LocalCollection._f._cmp(reduced, value);
          if ((findMin && cmp > 0) || (!findMin && cmp < 0)) reduced = value;
        }
      });
    });
    return reduced;
  };

  return (a, b) => {
    for (const specPart of sortSpecParts) {
      const aValue = reduceValue(specPart.lookup(a), specPart.ascending);
      const bValue = reduceValue(specPart.lookup(b), specPart.ascending);
      const compare = LocalCollection._f._cmp(aValue, bValue);

      if (compare !== 0) {
        return specPart.ascending ? compare : -compare;
      }
    }
    return 0;
  };
};

exports.compileDocumentSelector = compileDocumentSelector;
exports.compileSort = LocalCollection._compileSort;
