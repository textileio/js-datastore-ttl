"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const buffer_1 = require("buffer");
const async_rwlock_1 = require("async-rwlock");
const interface_datastore_1 = require("interface-datastore");
const datastore_core_1 = require("datastore-core");
const lexicographic_integer_1 = require("lexicographic-integer");
const duration_1 = require("./duration");
exports.Duration = duration_1.Duration;
const ttlPrefix = new interface_datastore_1.Key('ttl');
const expPrefix = new interface_datastore_1.Key('exp');
class TTLBatch {
    constructor(ttl, batch, ttlOn, ttlOff) {
        this.ttl = ttl;
        this.batch = batch;
        this.ttlOn = ttlOn;
        this.ttlOff = ttlOff;
        this.on = [];
        this.off = [];
    }
    put(key, value) {
        this.on.push(key);
        return this.batch.put(key, value);
    }
    delete(key) {
        this.off.push(key);
        return this.batch.delete(key);
    }
    commit() {
        return __awaiter(this, void 0, void 0, function* () {
            this.off.length && (yield this.ttlOff(this.off));
            this.on.length && (yield this.ttlOn(this.on, this.ttl));
            return this.batch.commit();
        });
    }
}
exports.TTLBatch = TTLBatch;
/**
 * TTLDatastore is an implementation of the Datastore interface that supports a time-to-live
 * (TTL) for datastore entries. After the TTL expires on a given key, the entry will be
 * automatically cleared from the datastore unless it is refreshed in the mean time. In this way
 * you can build utilities like session managers where a given session is refreshed with each
 * interaction but expires after a set period of time since the last interaction.
 *
 * @note TTLDatastore borrows ideas from https://github.com/Level/level-ttl.
 */
class TTLDatastore {
    /**
     * TTLDatastore creates a new datastore that supports TTL expirations.
     *
     * @param store The underlying Datastore to wrap with TTL expirations.
     * @param meta A Datastore to use for storing TTL information. Will default to a
     * NamespaceDatastore that stores all TTL metadata in the input `store` under a `ttl` prefix.
     * If you don't want to mix your metadata with your keys, consider provider your own store directly.
     * @param options A set of options for controlling the underlying TTL mechanics.
     */
    constructor(store, meta = new datastore_core_1.NamespaceDatastore(store, ttlPrefix), options) {
        var _a, _b;
        this.store = store;
        this.meta = meta;
        this.interval = 0;
        this.options = {
            frequency: ((_a = options) === null || _a === void 0 ? void 0 : _a.frequency) || duration_1.Duration.Second * 10,
            ttl: ((_b = options) === null || _b === void 0 ? void 0 : _b.ttl) || 0,
        };
        this.lock = new async_rwlock_1.RWLock();
        this.startTTL();
    }
    /**
     * The core method that checks for expired keys.
     */
    checkTTL() {
        var e_1, _a;
        return __awaiter(this, void 0, void 0, function* () {
            yield this.lock.readLock();
            try {
                const exp = lexicographic_integer_1.pack(Date.now(), 'hex');
                // @note: ttlPrefix is required 'hack' because NamespaceDatastore doesn't take this into account
                // @fixme: Assuming ttlPrefix is not a good idea, we should extract the prefix from the meta store
                const lte = ttlPrefix.child(expPrefix.child(new interface_datastore_1.Key(exp)));
                const query = {
                    prefix: expPrefix.toString(),
                    filters: [item => item.key.less(lte)],
                };
                const meta = this.meta.batch();
                const store = this.store.batch();
                try {
                    for (var _b = __asyncValues(this.meta.query(query)), _c; _c = yield _b.next(), !_c.done;) {
                        const { key, value } = _c.value;
                        const k = new interface_datastore_1.Key(value); // the value _is_ the key
                        meta.delete(key); // exp key that matches this query
                        meta.delete(k); // key for tracking exp timestamp
                        store.delete(k); // the _actual_ data that should expire
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (_c && !_c.done && (_a = _b.return)) yield _a.call(_b);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                yield meta.commit();
                yield store.commit();
            }
            finally {
                this.lock.unlock();
            }
            return;
        });
    }
    /**
     * addTTL sets the TTL metadata for given (array of) keys.
     * @param keys The keys
     * @param ttl The time-to-live, in milliseconds. Skips update if not specified or infinitely large.
     */
    addTTL(keys, ttl) {
        return __awaiter(this, void 0, void 0, function* () {
            if (ttl === undefined || ttl == Infinity)
                return;
            // @todo: Can we share a single 'batch' between addTTL and removeTTL?
            yield this.lock.writeLock();
            try {
                yield this.removeTTL(keys);
                // Uses UTC because we don't need locale support
                const exp = lexicographic_integer_1.pack(Date.now() + (ttl || this.options.ttl), 'hex');
                const batch = this.meta.batch();
                for (const key of keys) {
                    batch.put(expPrefix.child(new interface_datastore_1.Key(exp)).child(key), key.toBuffer());
                    batch.put(key, buffer_1.Buffer.from(exp));
                }
                return yield batch.commit();
            }
            finally {
                this.lock.unlock();
            }
        });
    }
    /**
     * removeTTL deletes the TTL metadata for given (array of) keys.
     * @param keys The keys
     */
    removeTTL(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            const batch = this.meta.batch();
            for (const key of keys) {
                try {
                    const exp = yield this.meta.get(key);
                    batch.delete(expPrefix.child(new interface_datastore_1.Key(exp)).child(key));
                    batch.delete(key);
                }
                catch (err) {
                    // pass
                }
            }
            return yield batch.commit();
        });
    }
    /**
     * put stores a value with the given key.
     * @note If you put the same entry twice, you refresh the TTL to the last put operation.
     * @param key The key.
     * @param value The value.
     * @param ttl The time-to-live, in milliseconds. Defaults to `options.ttl`.
     */
    put(key, value, ttl) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.addTTL([key], ttl);
            return this.store.put(key, value);
        });
    }
    /**
     * delete removes the content stored under the given key.
     * @param key The key.
     */
    delete(key) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.removeTTL([key]);
            return this.store.delete(key);
        });
    }
    /**
     * batch returns a Batch object with which you can chain multiple operations.
     * The operations are only executed upon calling `commit`. Any `put` operation on a batch
     * will use the supplied TTL value.
     */
    batch(ttl) {
        return new TTLBatch(ttl || this.options.ttl, this.store.batch(), this.addTTL.bind(this), this.removeTTL.bind(this));
    }
    // TTL-specific methods
    /**
     * expiration returns the expiration UTC timestamp in milliseconds for a given key.
     * @param key The key.
     */
    expiration(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const buf = yield this.meta.get(key);
            return lexicographic_integer_1.unpack(buf.toString());
        });
    }
    /**
     * ttl inserts or updates a TTL for a given key.
     * @note This will update the TTL even if the given key doesn't exist yet, but may in the future.
     * @param key The key.
     * @param ttl The time-to-live, in milliseconds. Defaults to `options.ttl`.
     */
    ttl(key, ttl) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.addTTL([key], ttl);
        });
    }
    /**
     * stopTTL clears the underlying TTL timer.
     * If stopped, keys will no longer expire, but any new entires will still be given TTL values,
     * which may expire after the timer is restarted (@see startTTL).
     */
    stopTTL() {
        return __awaiter(this, void 0, void 0, function* () {
            // We can't close the store while an iterator is in progress so if one is, defer
            yield this.lock.readLock();
            try {
                clearInterval(this.interval);
                this.interval = 0;
            }
            finally {
                this.lock.unlock();
            }
        });
    }
    /**
     * startTTL starts the underlying TTL timer.
     * This is called by default upon datastore initialization, but can be used to restart a the
     * TTL timer after stopTTL has been called (@see stopTTL).
     */
    startTTL() {
        if (this.interval === 0) {
            this.interval = setInterval(this.checkTTL.bind(this), this.options.frequency);
            this.interval.unref && this.interval.unref();
        }
        return this.interval;
    }
    // Methods not affected by TTL
    /**
     * get retrieves the value stored under the given key.
     * @param key The key.
     */
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.store.get(key);
        });
    }
    /**
     * has checks for the existence of a given key.
     * @param key The key.
     */
    has(key) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.store.has(key);
        });
    }
    /**
     * query searches the store for key/value pairs matching a given query.
     * @param query Object describing the query parameters.
     */
    query(query) {
        query.filters = [...(query.filters || []), item => !item.key.isDecendantOf(ttlPrefix)];
        return this.store.query(query);
    }
    /**
     * open the datastore.
     * This is only needed if the store was closed before, otherwise this is taken care of by the
     * constructor. If a store is reopened, the TTL timing is not automatically restarted
     * (@see startTTL).
     */
    open() {
        return __awaiter(this, void 0, void 0, function* () {
            return this.store.open();
        });
    }
    /**
     * close the datastore.
     * This should always be called to ensure resources are cleaned up. This will wait until the
     * TTL timer has been cleared before resolving.
     */
    close() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.stopTTL();
            return this.store.close();
        });
    }
}
exports.TTLDatastore = TTLDatastore;
//# sourceMappingURL=index.js.map