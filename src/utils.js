/**
 * Utilities for db handling
 */

const {
  pluck,
  rest,
  first,
  last,
  initial,
  arraysAreEqual,
  sortBy,
} = require("./tools");
const { compileDocumentSelector } = require("./selector");
const { compileSort } = require("./selector");

// Compile a document selector (query) to a lambda function
exports.compileDocumentSelector = compileDocumentSelector;

/**
 * Processes a find with sorting and filtering and limiting.
 * @param items {Array|Object} the items to search through
 * @param selector {object} mongo selector
 * @param options {object?} optional sort, skip and limit transform
 * @return {*|Array}
 */
exports.processFind = function processFind(items, selector, options) {
  const values = Object.values(items);
  let filtered = values.filter(compileDocumentSelector(selector));

  // Handle geospatial operators
  filtered = processNearOperator(selector, filtered);
  filtered = processGeoIntersectsOperator(selector, filtered);

  if (options && options.sort) {
    filtered.sort(compileSort(options.sort));
  }

  if (options && options.skip) {
    filtered = rest(filtered, options.skip);
  }

  if (options && options.limit) {
    filtered = first(filtered, options.limit);
  }

  // Clone to prevent accidental updates, or apply fields if present
  if (options && options.fields) {
    filtered = exports.filterFields(filtered, options.fields);
  }

  return filtered;
};

/**
 * Filter fields by `fields` option. Creates new objects, does not mutate the
 * original objects.
 *
 * @param items {Array|Object} the items to apply the filter on
 * @param fields {object} fields definitions, like `{ _id: 1 }` or `{ secrets: 0 }`
 * @return {*}
 */
exports.filterFields = function filterFields(items, fields) {
  // Handle trivial case
  if (fields == null) {
    fields = {};
  }
  if (Object.keys(fields).length === 0) {
    return items;
  }

  // TODO throw if fields contain both inclusive and exclusive criteria

  // For each item
  return items.map((item) => {
    let field, from, obj, path, pathElem;
    const newItem = {};

    // TODO move this check out of map to increase performance

    if (first(Object.values(fields)) === 1) {
      // Include fields
      for (field of Array.from(Object.keys(fields).concat(["_id"]))) {
        path = field.split(".");

        // Determine if path exists
        obj = item;
        for (pathElem of Array.from(path)) {
          if (obj) {
            obj = obj[pathElem];
          }
        }

        if (obj == null) {
          continue;
        }

        // Go into path, creating as necessary
        from = item;
        let to = newItem;
        for (pathElem of Array.from(initial(path))) {
          to[pathElem] = to[pathElem] || {};

          // Move inside
          to = to[pathElem];
          from = from[pathElem];
        }

        // Copy value
        to[last(path)] = from[last(path)];
      }

      return newItem;
    } else {
      // Exclude fields
      for (field of Array.from(Object.keys(fields).concat(["_id"]))) {
        path = field.split(".");

        // Go inside path
        obj = item;
        for (pathElem of Array.from(initial(path))) {
          if (obj) {
            obj = obj[pathElem];
          }
        }

        // If not there, don't exclude
        if (obj == null) {
          continue;
        }

        delete obj[last(path)];
      }

      return item;
    }
  });
};

const pattern = "xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx";

/**
 * Creates a unique identifier string of 32 characters length.
 * @return {string}
 */
exports.createUid = () =>
  pattern.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

/**
 * @private
 * @param selector
 * @param list
 * @return {*}
 */
const processNearOperator = function (selector, list) {
  const keys = Object.keys(selector || {});

  for (const key of keys) {
    const value = selector[key];
    if (value != null && value["$near"]) {
      const geo = value["$near"]["$geometry"];
      if (geo.type !== "Point") {
        break;
      }

      list = list.filter((doc) => doc[key] && doc[key].type === "Point");

      // Get distances
      let distances = list.map((doc) => ({
        doc,

        distance: getDistanceFromLatLngInM(
          geo.coordinates[1],
          geo.coordinates[0],
          doc[key].coordinates[1],
          doc[key].coordinates[0]
        ),
      }));

      // Filter non-points
      distances = distances.filter((item) => item.distance >= 0);

      // Sort by distance
      distances = distances.sort(sortBy("distance"));

      // Filter by maxDistance
      if (value["$near"]["$maxDistance"]) {
        distances = distances.filter(
          (item) => item.distance <= value["$near"]["$maxDistance"]
        );
      }

      // Limit to 100
      distances = first(distances, 100);

      // Extract docs
      list = pluck(distances, "doc");
    }
  }
  return list;
};

/**
 * Very simple polygon check. Assumes that is a square
 * @private
 * @param point
 * @param polygon
 * @return {boolean}
 */
const pointInPolygon = function (point, polygon) {
  // Check that first == last
  const firstEntry = first(polygon.coordinates[0]);
  const lastEntry = last(polygon.coordinates[0]);

  if (!arraysAreEqual(firstEntry, lastEntry)) {
    throw new Error("First must equal last");
  }

  const coordinates = polygon.coordinates[0] || [];
  const firstCoordinates = coordinates.map((coord) => coord[0]);
  const firstPoint = point.coordinates[0];
  const secondPoint = point.coordinates[1];

  // Check bounds
  if (firstPoint < Math.min.apply(this, firstCoordinates)) {
    return false;
  }

  const secondCoordinates = coordinates.map((coord) => coord[1]);

  if (secondPoint < Math.min.apply(this, secondCoordinates)) {
    return false;
  }

  if (firstPoint > Math.max.apply(this, firstCoordinates)) {
    return false;
  }

  if (secondPoint > Math.max.apply(this, secondCoordinates)) {
    return false;
  }

  return true;
};

/**
 * From http://www.movable-type.co.uk/scripts/latlong.html
 * @private
 * @param lat1
 * @param lng1
 * @param lat2
 * @param lng2
 * @return {number}
 */
const getDistanceFromLatLngInM = function (lat1, lng1, lat2, lng2) {
  const R = 6370986; // Radius of the earth in m
  const dLat = deg2rad(lat2 - lat1); // deg2rad below
  const dLng = deg2rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in m
  return d;
};

/**
 * @private
 * @param deg
 * @return {number}
 */
const deg2rad = (deg) => deg * (Math.PI / 180);

/**
 * @private
 * @param selector
 * @param list
 * @return {*}
 */
const processGeoIntersectsOperator = function (selector, list) {
  const keys = Object.keys(selector || {});

  for (const key of keys) {
    const value = selector[key];
    if (value != null && value["$geoIntersects"]) {
      const geo = value["$geoIntersects"]["$geometry"];
      if (geo.type !== "Polygon") {
        break;
      }

      // Check within for each
      list = list.filter((doc) => {
        // Reject non-points
        if (!doc[key] || doc[key].type !== "Point") {
          return false;
        }

        // Check polygon
        return pointInPolygon(doc[key], geo);
      });
    }
  }

  return list;
};

/**
 * Tidy up upsert parameters to always be a list of { doc: <doc>, base: <base> },
 * doing basic error checking and making sure that _id is present
 * Returns [items, success, error]
 * @param docs
 * @param bases
 * @param success
 * @param error
 * @return {*[]}
 */
exports.regularizeUpsert = function regularizeUpsert(
  docs,
  bases,
  success,
  error
) {
  // Handle case of bases not present
  if (typeof bases === "function") {
    [bases, success, error] = Array.from([undefined, bases, success]);
  }

  // Handle single upsert
  if (!Array.isArray(docs)) {
    docs = [docs];
    bases = [bases];
  } else {
    bases = bases || [];
  }

  // Make into list of { doc: .., base: }
  const items = docs.map((doc, i) => ({
    doc,
    base: i < bases.length ? bases[i] : undefined,
  }));

  // check for _id
  for (let item of Array.from(items)) {
    if (item.doc._id == null) {
      throw new Error("All documents in the upsert must have an _id");
    }
  }

  return [items, success, error];
};

/**
 * Throws an Error if a property name is part of the Object prototype-chain.
 * @param name {string}
 * @throws {Error}
 */
exports.preventProto = (name) => {
  if (name in {}) {
    throw new Error(`Not allowed: ${name} is a prototype property.`);
  }
};
