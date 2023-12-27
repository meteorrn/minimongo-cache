const { randomHex } = require("../helpers/randomHex");
const SynchronousWriteTransaction = require("../../src/SynchronousWriteTransaction");
const { expect } = require("chai");

describe("SynchronousWriteTransaction", function () {
  it("is not read", function () {
    const transaction = new SynchronousWriteTransaction();

    const result = { _id: randomHex, foo: "bar" };
    expect(() => transaction.get()).to.throw(
      "Cannot read in a SynchronousWriteTransaction"
    );
    expect(() => transaction.find()).to.throw(
      "Cannot read in a SynchronousWriteTransaction"
    );
    expect(() => transaction.findOne()).to.throw(
      "Cannot read in a SynchronousWriteTransaction"
    );

    expect(transaction.upsert("", result)).to.deep.equal(result);
    expect(transaction.del("", result)).to.deep.equal(result);

    expect(transaction.canPushTransaction()).to.equal(false);
  });
});
