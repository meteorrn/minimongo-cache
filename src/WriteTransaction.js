/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const { each } = require("./tools");
const NullTransaction = require("./NullTransaction");
const { preventProto } = require("./utils");

class WriteTransaction extends NullTransaction {
  constructor(db) {
    super();
    this.db = db;
    this.dirtyIds = {};
    this.queued = false;
    this.traces = {};
  }

  _ensureQueued() {
    if (this.db.debug) {
      this.traces[new Error().stack.split("\n").slice(1).join("\n")] = true;
    }

    if (!this.queued) {
      this.queued = true;
      return process.nextTick(() => this._flush());
    }
  }

  upsert(collectionName, result, docs) {
    preventProto(collectionName);
    if (!Array.isArray(docs)) {
      docs = [docs];
    }
    this.dirtyIds[collectionName] = this.dirtyIds[collectionName] || {};
    docs.forEach((doc) => {
      return (this.dirtyIds[collectionName][doc._id] = true);
    });
    this._ensureQueued();
    return result;
  }

  del(collectionName, result, id) {
    preventProto(collectionName);
    this.dirtyIds[collectionName] = this.dirtyIds[collectionName] || {};
    this.dirtyIds[collectionName][id] = true;
    this._ensureQueued();
    return result;
  }

  canPushTransaction(transaction) {
    return true;
  } // nested writes would be bad, but impossible.

  _flush() {
    const ReadOnlyTransaction = require("./ReadOnlyTransaction");

    const changeRecords = {};
    each(this.dirtyIds, (collectionName) => {
      const ids = this.dirtyIds[collectionName];
      const documentFragments = [];
      each(ids, (id) => {
        const version = this.db.collections[collectionName].versions[id];
        documentFragments.push({ _id: id, _version: version });
      });
      changeRecords[collectionName] = documentFragments;
    });
    this.dirtyIds = {};
    this.queued = false;

    return this.db.batchedUpdates(() => {
      return this.db.withTransaction(new ReadOnlyTransaction(), () => {
        let e;
        if (this.db.debug) {
          const { traces } = this;
          this.traces = {};
          const prev_prepare = Error.prepareStackTrace;
          Error.prepareStackTrace = (e) => {
            let { stack } = e;
            each(traces, (trace) => {
              stack += `\nFrom observed write:\n${trace}`;
            });
            return stack;
          };

          try {
            return this.db.emit("change", changeRecords);
          } catch (error) {
            e = error;
            return this.db.uncaughtExceptionHandler(e);
          } finally {
            Error.prepareStackTrace = prev_prepare;
          }
        } else {
          try {
            return this.db.emit("change", changeRecords);
          } catch (error1) {
            e = error1;
            return this.db.uncaughtExceptionHandler(e);
          }
        }
      });
    });
  }
}

module.exports = WriteTransaction;
