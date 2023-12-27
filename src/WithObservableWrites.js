const WriteTransaction = require("./WriteTransaction");
const WithObservableWrites = {
  getDefaultTransaction() {
    return new WriteTransaction(this);
  },
};

module.exports = WithObservableWrites;
