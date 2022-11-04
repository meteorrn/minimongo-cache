const EventEmitter = require('eventemitter3');
const WriteTransaction = require('./WriteTransaction');
const WithObservableWrites = {
  getDefaultTransaction() {
    this.setMaxListeners(0);
    return new WriteTransaction(this);
  },
};

Object.assign(WithObservableWrites, EventEmitter.prototype);

module.exports = WithObservableWrites;
