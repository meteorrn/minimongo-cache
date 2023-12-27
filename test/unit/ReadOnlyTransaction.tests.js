const { randomHex } = require("../helpers/randomHex");
const ReadOnlyTransaction = require("../../src/ReadOnlyTransaction");
const WriteTransaction = require("../../src/WriteTransaction");
const NullTransaction = require("../../src/NullTransaction");
const ReadTransaction = require("../../src/ReadTransaction");
const SynchronousWriteTransaction = require("../../src/SynchronousWriteTransaction");
const { expect } = require("chai");

describe("ReadOnlyTransaction", function () {
  it("is is readonly", function () {
    const transaction = new ReadOnlyTransaction();
    const result = { _id: randomHex, foo: "bar" };
    expect(transaction.get("foo", result)).to.deep.equal(result);
    expect(transaction.find("foo", result)).to.deep.equal(result);
    expect(transaction.findOne("foo", result)).to.deep.equal(result);

    expect(() => transaction.upsert()).to.throw(
      "Cannot write outside of a WriteTransaction"
    );
    expect(() => transaction.del()).to.throw(
      "Cannot write outside of a WriteTransaction"
    );
  });

  it("cannot push WriteTransactions", function () {
    const transaction = new ReadOnlyTransaction();
    [
      ReadOnlyTransaction,
      NullTransaction,
      SynchronousWriteTransaction, // TODO shouldn't this be excluded, too?
      ReadTransaction,
    ].forEach((T) => {
      expect(transaction.canPushTransaction(new T())).to.equal(true);
    });

    expect(transaction.canPushTransaction(new WriteTransaction())).to.equal(
      false
    );
  });
});
