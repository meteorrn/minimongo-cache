const { randomHex } = require("../helpers/randomHex");
const NullTransaction = require("../../src/NullTransaction");
const { expect } = require("chai");

describe("NullTransaction", function () {
  it("contains no ops", function () {
    const transaction = new NullTransaction();

    expect(transaction.canPushTransaction()).to.equal(true);

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
});
