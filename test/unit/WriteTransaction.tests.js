const { randomHex } = require("../helpers/randomHex");
const ReadOnlyTransaction = require("../../src/ReadOnlyTransaction");
const WriteTransaction = require("../../src/WriteTransaction");
const NullTransaction = require("../../src/NullTransaction");
const ReadTransaction = require("../../src/ReadTransaction");
const SynchronousWriteTransaction = require("../../src/SynchronousWriteTransaction");
const { expect } = require("chai");
const { tickAsync } = require("../helpers/tickAsync");
const { timeoutAsync } = require("../helpers/timeoutAsync");
const MemoryDB = require("../../src/MemoryDb");

describe("WriteTransaction", function () {
  let transaction;
  let collectionName;
  let db;
  beforeEach(function () {
    db = new MemoryDB();
    transaction = new WriteTransaction(db);
    collectionName = randomHex();
  });

  describe("reads", function () {
    it("has no read implementation", function () {
      const result = { _id: randomHex(), foo: "bar" };
      expect(transaction.get("foo", result)).to.deep.equal(result);
      expect(transaction.find("foo", result)).to.deep.equal(result);
      expect(transaction.findOne("foo", result)).to.deep.equal(result);

      expect(transaction.dirtyIds).to.deep.equal({});
      expect(transaction.traces).to.deep.equal({});
      expect(transaction.queued).to.equal(false);
    });
  });
  describe("upsert", function () {
    it("sets all doc ids to dirty", async function () {
      let flushed = false;
      transaction._flush = () => {
        flushed = true;
      };

      const docs = [{ _id: randomHex(), _version: randomHex(), foo: "bar" }];
      const result = randomHex();
      const actual = transaction.upsert(collectionName, result, docs);
      expect(actual).to.equal(result);
      expect(transaction.queued).to.equal(true);
      expect(transaction.dirtyIds[collectionName]).to.deep.equal({
        [docs[0]._id]: true,
      });

      await tickAsync();
      await tickAsync();
      await tickAsync();

      expect(flushed).to.equal(true);
    });
  });
  describe("del", function () {
    it("sets the doc to dirty", async function () {
      let flushed = false;
      transaction._flush = () => {
        flushed = true;
      };

      const docs = { _id: randomHex(), _version: randomHex(), foo: "bar" };
      const result = randomHex();
      const actual = transaction.upsert(collectionName, result, docs);
      expect(actual).to.equal(result);
      expect(transaction.queued).to.equal(true);
      expect(transaction.dirtyIds[collectionName]).to.deep.equal({
        [docs._id]: true,
      });

      await tickAsync();
      await tickAsync();
      await tickAsync();

      expect(flushed).to.equal(true);
    });
  });
  describe("_flush", function () {
    it("flushes the queue and catches up the emitted change event", async function () {
      const _id = randomHex();
      const _version = 1;

      transaction.dirtyIds[collectionName] = {
        [_id]: true,
      };

      const collection = db.addCollection(collectionName);
      const doc = collection.upsert({ _id, _version });

      let changedDocs = [];
      db.on("change", (docs) => {
        changedDocs = docs;
      });

      transaction._flush();

      await timeoutAsync(100);

      expect(transaction.dirtyIds).to.deep.equal({});
      expect(transaction.queued).to.equal(false);
      expect(changedDocs).to.deep.equal({
        [collectionName]: [doc],
      });
    });
  });
  describe("canPushTransaction", function () {
    it("returns true", function () {
      expect(transaction.canPushTransaction()).to.equal(true);
    });
  });
});
