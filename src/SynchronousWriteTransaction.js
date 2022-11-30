const cannotRead = () => {
  throw new Error('Cannot read in a SynchronousWriteTransaction');
};

function SynchronousWriteTransaction() {}

Object.assign(SynchronousWriteTransaction.prototype, {
  get: cannotRead,
  find: cannotRead,
  findOne: cannotRead,
  upsert: (_, result) => result,
  del: (_, result) => result,
  canPushTransaction: () => false,
});

module.exports = SynchronousWriteTransaction;
