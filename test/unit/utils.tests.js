const { randomHex } = require("../helpers/randomHex");
const {
  createUid,
  filterFields,
  processFind,
  regularizeUpsert,
} = require("../../src/utils");
const { expect } = require("chai");

describe("utils", function () {
  describe(createUid.name, function () {
    const uidRegExp = /^[a-f0-9]{32}$/;

    it("creates a new random id each time", function () {
      const created = new Set();
      const max = 100000;

      let i;
      for (i = 0; i < max; i++) {
        const uid = createUid();
        expect(uidRegExp.test(uid), uid).to.equal(true);
        expect(created.has(uid)).to.equal(false);
        created.add(uid);
      }
    });
  });
  describe(processFind.name, function () {
    it("Processes a find", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { bar: "baz", _id: randomHex() },
      ];
      const selector = {};
      const options = {};

      const found = processFind(items, selector, options);
      expect(found).to.deep.equal(items);
    });
    it("processes a filter", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { bar: "baz", _id: randomHex() },
      ];
      const selector = { _id: items[1]._id };

      const found = processFind(items, selector);
      expect(found).to.deep.equal([items[1]]);

      // $in
      const ids = items.map((i) => i._id);
      const foundAll = processFind(items, { _id: { $in: ids } });
      expect(foundAll).to.deep.equal(items);
    });
    it("processes a skip", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { bar: "baz", _id: randomHex() },
      ];
      const selector = {};

      const found = processFind(items, selector, { skip: 1 });
      expect(found).to.deep.equal([items[1]]);
    });
    it("processes a sort", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { foo: "baz", _id: randomHex() },
      ];
      const selector = {};

      const found1 = processFind(items, selector, { sort: { foo: 1 } });
      expect(found1).to.deep.equal(items);

      const found2 = processFind(items, selector, { sort: { foo: -1 } });
      expect(found2).to.deep.equal([].concat(items).reverse());

      // should have no effect
      const found3 = processFind(items, selector, { sort: { bar: -1 } });
      expect(found3).to.deep.equal(items);
    });
    it("processes a limit", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { bar: "baz", _id: randomHex() },
      ];
      const selector = {};
      const options = { limit: 1 };

      const found = processFind(items, selector, options);
      expect(found).to.deep.equal([items[0]]);
    });
    it("filters fields", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { foo: "baz", _id: randomHex() },
        null,
      ];
      const selector = {};
      const options = { fields: { _id: 0 } };

      const found = processFind(items, selector, options);
      expect(found).to.deep.equal(items.map((i) => i && { foo: i.foo }));
    });
  });
  describe(filterFields.name, function () {
    it("handles trivial cases", function () {
      expect(filterFields()).to.equal(undefined);
      expect(filterFields(null)).to.equal(null);
    });
    it("default includes _id when not exlcuded", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { foo: "baz", _id: randomHex() },
      ];
      expect(filterFields(items, { foo: 1 })).to.deep.equal(items);
    });
    it("filters by given inclusion criteria", function () {
      const items = [
        { foo: "bar", bar: "baz", _id: randomHex() },
        { foo: "baz", bar: "foo", _id: randomHex() },
      ];
      const expected = items.map((i) => ({ foo: i.foo, _id: i._id }));
      expect(filterFields(items, { foo: 1 })).to.deep.equal(expected);
    });
    it("filters by given exclusion criteria", function () {
      const items = [
        { foo: "bar", bar: "baz", _id: randomHex() },
        { foo: "baz", bar: "foo", _id: randomHex() },
        null,
      ];
      const expected = items.map((i) => i && { bar: i.bar });
      expect(filterFields(items, { foo: 0 })).to.deep.equal(expected);
    });
    it("throws if inclusion and exclusion criteria exist at the same time");
  });
  describe(regularizeUpsert.name, function () {
    it("does Tidy up upsert parameters to always be a list of { doc: <doc>, base: <base> }", function () {
      const items = [
        { foo: "bar", _id: randomHex() },
        { bar: "baz", _id: randomHex() },
      ];
      const bases = [{ foo: "bar" }];
      const success = () => {};
      const error = () => {};
      expect(regularizeUpsert(items, bases, success, error)).to.deep.equal([
        [
          { doc: items[0], base: bases[0] },
          { doc: items[1], base: undefined },
        ],
        success,
        error,
      ]);

      // single params
      expect(
        regularizeUpsert(items[0], bases[0], success, error)
      ).to.deep.equal([[{ doc: items[0], base: bases[0] }], success, error]);

      // bases from function
      const getBase = () => bases[0];
      expect(regularizeUpsert(items[0], getBase, success, error)).to.deep.equal(
        [[{ doc: items[0], base: undefined }], getBase, success]
      );
    });
    it("is making sure that _id is present", function () {
      expect(() => regularizeUpsert([{ foo: "bar" }])).to.throw(
        "All documents in the upsert must have an _id"
      );
    });
  });
});
