const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

const pluck = (list, fieldName) => {
  return list.map(entry => {
    if (hasOwn(entry, fieldName)) {
      return entry[fieldName];
    }
  });
};

const first = (array, n = 0) => {
  if (!n) return array[0];
  const length = array.length;
  const upper = Math.min(n, length);
  return array.slice(0, upper);
};

const last = (array) => {
  const length = array.length;
  if (length === 0) {
    return []
  }
  return array[length - 1];
};

const initial = (array, n = -1) => array.slice(0, n);

const arraysAreEqual = (a, b) => {
  if (a === b) { return true }
  if (a.length !== b.length ) { return false }
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return JSON.stringify(sortedA) === JSON.stringify(sortedB)
};

/**
 * Returns all but the first n elements of an array.
 * @param list {Array} the input array
 * @param n {number} number of elements to skip
 * @return {Array} the new array
 */
const rest = (list, n) => list.slice(n, list.length);

const sortBy = (key) => {
  return (a, b) => (a[key] > b[key]) ? 1 : ((b[key] > a[key]) ? -1 : 0);
};

const mixin = (destination, source) => {

};

module.exports = {
  hasOwn,
  pluck,
  first,
  last,
  rest,
  initial,
  arraysAreEqual,
  sortBy
};
