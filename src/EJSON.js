// we use the same mechanism as react-native does:
// https://github.com/facebook/react-native/blob/main/Libraries/Utilities/binaryToBase64.js
// so there are no extra deps when using rn
// also, base64-js is fully js and browser-compatible
const base64 = require("base64-js");
const { hasProp, objSize, isArguments } = require("./helpers");
const EJSON = {}; // Global!
const customTypes = new Map();

/**
 * Add a custom type, using a method of your choice to get to and
 * from a basic JSON-able representation.  The factory argument
 * is a function of JSON-able --> your object
 * The type you add must have:
 * - A clone() method, so that Meteor can deep-copy it when necessary.
 * - A equals() method, so that Meteor can compare it
 * - A toJSONValue() method, so that Meteor can serialize it
 * - a typeName() method, to show how to look it up in our type table.
 * It is okay if these methods are monkey-patched on.
 *
 * @param name
 * @param factory
 */
EJSON.addType = function addType(name, factory) {
  if (customTypes.has(name)) throw new Error(`Type ${name} already present`);
  customTypes.set(name, factory);
};

const builtinConverters = [
  {
    // Date
    matchJSONValue: function (obj) {
      return hasProp(obj, "$date") && objSize(obj) === 1;
    },
    matchObject: function (obj) {
      return obj instanceof Date;
    },
    toJSONValue: function (obj) {
      return { $date: obj.getTime() };
    },
    fromJSONValue: function (obj) {
      return new Date(obj.$date);
    },
  },
  {
    // Binary
    matchJSONValue: function (obj) {
      return hasProp(obj, "$binary") && objSize(obj) === 1;
    },
    matchObject: function (obj) {
      return (
        (typeof Uint8Array !== "undefined" && obj instanceof Uint8Array) ||
        (obj && hasProp(obj, "$Uint8ArrayPolyfill"))
      );
    },
    toJSONValue: function (obj) {
      return { $binary: _base64Encode(obj) };
    },
    fromJSONValue: function (obj) {
      return _base64Decode(obj.$binary);
    },
  },
  {
    // Escaping one level
    matchJSONValue: function (obj) {
      return hasProp(obj, "$escape") && objSize(obj) === 1;
    },
    matchObject: function (obj) {
      if (obj === null || obj === undefined) {
        return false;
      }
      const size = objSize(obj);
      if (size === 0 || size > 2) {
        return false;
      }
      return builtinConverters.some((converter) =>
        converter.matchJSONValue(obj),
      );
    },
    toJSONValue: function (obj) {
      const newObj = {};
      Object.entries(obj).forEach(([key, value]) => {
        newObj[key] = EJSON.toJSONValue(value);
      });
      return { $escape: newObj };
    },
    fromJSONValue: function (obj) {
      const newObj = {};
      Object.entries(obj.$escape).forEach(([key, value]) => {
        newObj[key] = EJSON.fromJSONValue(value);
      });
      return newObj;
    },
  },
  {
    // Custom
    matchJSONValue: function (obj) {
      return (
        hasProp(obj, "$type") && hasProp(obj, "$value") && objSize(obj) === 2
      );
    },
    matchObject: function (obj) {
      return EJSON._isCustomType(obj);
    },
    toJSONValue: function (obj) {
      return { $type: obj.typeName(), $value: obj.toJSONValue() };
    },
    fromJSONValue: function (obj) {
      const typeName = obj.$type;
      const converter = customTypes.get(typeName);
      return converter(obj.$value);
    },
  },
];

const _base64Decode = (str) => {
  return base64.toByteArray(str);
};

const _base64Encode = (obj) => {
  return base64.fromByteArray(obj);
};

/**
 * Returns, whether an object is of a custom registered type
 * @private
 * @param obj
 * @return {boolean}
 */
EJSON._isCustomType = function _isCustomType(obj) {
  return !!(
    obj &&
    typeof obj.toJSONValue === "function" &&
    typeof obj.typeName === "function" &&
    customTypes.has(obj.typeName())
  );
};

//for both arrays and objects, in-place modification.
const adjustTypesToJSONValue = (EJSON._adjustTypesToJSONValue = function (obj) {
  if (obj === null) return null;
  const maybeChanged = toJSONValueHelper(obj);
  if (maybeChanged !== undefined) return maybeChanged;
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value !== "object" && value !== undefined) return; // continue
    const changed = toJSONValueHelper(value);
    if (changed) {
      obj[key] = changed;
      return; // on to the next key
    }
    // if we get here, value is an object but not adjustable
    // at this level.  recurse.
    adjustTypesToJSONValue(value);
  });
  return obj;
});

// Either return the JSON-compatible version of the argument, or undefined (if
// the item isn't itself replaceable, but maybe some fields in it are)
const toJSONValueHelper = function (item) {
  for (const converter of builtinConverters) {
    if (converter.matchObject(item)) {
      return converter.toJSONValue(item);
    }
  }
  return undefined;
};

/**
 * Serialize an EJSON-compatible value into its plain JSON representation.
 * @param item {object} A value to serialize to plain JSON.
 * @return {object}
 */
EJSON.toJSONValue = function toJSONValue(item) {
  const changed = toJSONValueHelper(item);
  if (changed !== undefined) return changed;
  if (typeof item === "object") {
    item = EJSON.clone(item);
    adjustTypesToJSONValue(item);
  }
  return item;
};

//for both arrays and objects. Tries its best to just
// use the object you hand it, but may return something
// different if the object you hand it itself needs changing.
const adjustTypesFromJSONValue = (EJSON._adjustTypesFromJSONValue = function (
  obj,
) {
  if (obj === null) return null;
  const maybeChanged = fromJSONValueHelper(obj);
  if (maybeChanged !== obj) return maybeChanged;
  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === "object") {
      const changed = fromJSONValueHelper(value);
      if (value !== changed) {
        obj[key] = changed;
        return;
      }
      // if we get here, value is an object but not adjustable
      // at this level.  recurse.
      adjustTypesFromJSONValue(value);
    }
  });
  return obj;
});

// Either return the argument changed to have the non-json
// rep of itself (the Object version) or the argument itself.

// DOES NOT RECURSE.  For actually getting the fully-changed value, use
// EJSON.fromJSONValue
const fromJSONValueHelper = function (value) {
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value);

    if (
      keys.length <= 2 &&
      keys.every((k) => typeof k === "string" && k.substr(0, 1) === "$")
    ) {
      for (const converter of builtinConverters) {
        if (converter.matchJSONValue(value)) {
          return converter.fromJSONValue(value);
        }
      }
    }
  }

  return value;
};

/**
 * Deserialize an EJSON value from its plain JSON representation.
 * @param item {object} A value to deserialize into EJSON.
 * @return {object}
 */
EJSON.fromJSONValue = function fromJSONValue(item) {
  const changed = fromJSONValueHelper(item);
  if (changed === item && typeof item === "object") {
    item = EJSON.clone(item);
    adjustTypesFromJSONValue(item);
    return item;
  } else {
    return changed;
  }
};

/**
 * Serialize a value to a string.
 * For EJSON values, the serialization fully represents the value.
 * For non-EJSON values, serializes the same way as JSON.stringify.
 * @param item {object} A value to stringify.
 * @return {string}
 */
EJSON.stringify = function stringify(item) {
  return JSON.stringify(EJSON.toJSONValue(item));
};

/**
 * Parse a string into an EJSON value. Throws an error if the string is not valid EJSON.
 * @param item
 * @return {Object|any}
 */
EJSON.parse = function parse(item) {
  return EJSON.fromJSONValue(JSON.parse(item));
};

/**
 *
 * @param obj
 * @return {boolean|any}
 */
EJSON.isBinary = function isBinary(obj) {
  return (
    (typeof Uint8Array !== "undefined" && obj instanceof Uint8Array) ||
    (obj && obj.$Uint8ArrayPolyfill)
  );
};

/**
 * Return true if a and b are equal to each other.
 * eturn false otherwise.
 * Uses the equals method on a if present,
 * otherwise performs a deep comparison.
 * @param a
 * @param b
 * @param options
 * @return {*}
 */
EJSON.equals = function quals(a, b, options) {
  let i;
  const keyOrderSensitive = !!(options && options.keyOrderSensitive);
  if (a === b) return true;
  if (!a || !b)
    // if either one is falsy, they'd have to be === to be equal
    return false;
  if (!(typeof a === "object" && typeof b === "object")) return false;
  if (a instanceof Date && b instanceof Date)
    return a.valueOf() === b.valueOf();
  if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
  if (typeof a.equals === "function") return a.equals(b, options);

  // Array.isArray works across iframes while instanceof won't
  const aIsArray = Array.isArray(a);
  const bIsArray = Array.isArray(b);

  // if not both or none are array they are not equal
  if (aIsArray !== bIsArray) {
    return false;
  }

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false;
    for (i = 0; i < a.length; i++) {
      if (!EJSON.equals(a[i], b[i], options)) return false;
    }
    return true;
  }
  // fall back to structural equality of objects
  let ret;
  if (keyOrderSensitive) {
    const bKeys = Object.keys(b);
    i = 0;
    ret = Object.entries(a).every(([x, val]) => {
      if (i >= bKeys.length) {
        return false;
      }
      if (x !== bKeys[i]) {
        return false;
      }
      if (!EJSON.equals(val, b[bKeys[i]], options)) {
        return false;
      }
      i++;
      return true;
    });
    return ret && i === bKeys.length;
  } else {
    i = 0;
    ret = Object.entries(a).every(([key, val]) => {
      if (!hasProp(b, key)) {
        return false;
      }
      if (!EJSON.equals(val, b[key], options)) {
        return false;
      }
      i++;
      return true;
    });
    return ret && objSize(b) === i;
  }
};

/**
 *
 * @param v
 * @return {*}
 */
EJSON.clone = function clone(v) {
  let ret;
  if (typeof v !== "object") return v;
  if (v === null) return null; // null has typeof "object"
  if (v instanceof Date) return new Date(v.getTime());
  if (EJSON.isBinary(v)) {
    return Uint8Array.from(v);
  }
  if (Array.isArray(v) || isArguments(v)) {
    // For some reason, _.map doesn't work in this context on Opera (weird test
    // failures).
    // TODO test with newer opera
    return v.map((entry) => EJSON.clone(entry));
  }
  // handle general user-defined typed Objects if they have a clone method
  if (typeof v.clone === "function") {
    return v.clone();
  }
  // handle other objects
  ret = {};
  Object.entries(v).forEach(([key, value]) => {
    ret[key] = EJSON.clone(value);
  });
  return ret;
};

module.exports = EJSON;
