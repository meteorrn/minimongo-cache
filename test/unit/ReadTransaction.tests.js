const { randomHex } = require("../helpers/randomHex");
const ReadTransaction = require("../../src/ReadTransaction");
const ReadOnlyTransaction = require("../../src/ReadOnlyTransaction");
const WriteTransaction = require("../../src/WriteTransaction");
const NullTransaction = require("../../src/NullTransaction");
const SynchronousWriteTransaction = require("../../src/SynchronousWriteTransaction");
const { expect } = require("chai");

describe("ReadTransaction", function () {
  let transaction;
  let collectionName;
  beforeEach(function () {
    transaction = new ReadTransaction();
    collectionName = randomHex();
  });
  describe("get", function () {
    it("throws if result contains no _id at all");
    it("throws if result contains not given _id");
    it("returns the unmutated result", function () {
      const result = { _id: randomHex() };
      const actual = transaction.get(collectionName, result, result._id);
      expect(actual).to.equal(result);
      expect(actual).to.deep.equal({ _id: result._id });
    });
    it("adds the _id to dirty ids", function () {
      const result = { _id: randomHex() };
      transaction.get(collectionName, result, result._id);
      expect(transaction.dirtyIds[collectionName][result._id]).to.equal(true);
    });
  });
  describe("find", function () {
    it("throws if result is not an array");
    it("returns the unmutated result", function () {
      const result = [{ _id: randomHex() }];
      const actual = transaction.find(collectionName, result);
      expect(actual).to.equal(result);
      expect(actual).to.deep.equal([{ _id: result[0]._id }]);
    });
    it("adds the collection name to dirty scans", function () {
      const result = [{ _id: randomHex() }];
      transaction.find(collectionName, result);
      expect(transaction.dirtyScans[collectionName]).to.equal(true);
    });
  });
  describe("findOne", function () {
    it("throws if result is not a single object");
    it("returns the unmutated result", function () {
      const result = { _id: randomHex() };
      const actual = transaction.findOne(collectionName, result);
      expect(actual).to.equal(result);
      expect(actual).to.deep.equal({ _id: result._id });
    });
    it("adds the collection name to dirty scans", function () {
      const result = { _id: randomHex() };
      transaction.findOne(collectionName, result);
      expect(transaction.dirtyScans[collectionName]).to.equal(true);
    });
  });
  describe("canPushTransaction", function () {
    it("can only push SynchronousWriteTransacitons", function () {
      expect(
        transaction.canPushTransaction(new SynchronousWriteTransaction())
      ).to.equal(true);
      [
        NullTransaction,
        ReadTransaction,
        ReadOnlyTransaction,
        WriteTransaction,
      ].forEach((T) =>
        expect(transaction.canPushTransaction(new T())).to.equal(false)
      );
    });
  });
});
