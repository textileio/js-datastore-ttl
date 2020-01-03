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
const chai_1 = require("chai");
const interface_datastore_1 = require("interface-datastore");
const index_1 = require("./index");
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const key = new interface_datastore_1.Key('foo');
const value = Buffer.from('bar');
describe('Datastore TTL', () => {
    describe('interface-datastore', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('interface-datastore/src/tests')({
            setup() {
                return new index_1.TTLDatastore(new interface_datastore_1.MemoryDatastore());
            },
            teardown() {
                return;
            },
        });
    });
    describe('ttl features', () => {
        let ttl;
        beforeEach(() => {
            ttl = new index_1.TTLDatastore(new interface_datastore_1.MemoryDatastore(), undefined, { ttl: 100, frequency: 20 });
        });
        it('should have default options', () => {
            chai_1.expect(ttl).to.have.ownProperty('store');
            chai_1.expect(ttl).to.have.ownProperty('options');
            chai_1.expect(ttl.options).to.deep.equal({ ttl: 100, frequency: 20 });
        });
        it('should handle a single ttl entry with put', () => __awaiter(void 0, void 0, void 0, function* () {
            yield ttl.put(key, value, 100);
            yield sleep(70); // before ttl
            chai_1.expect(yield ttl.has(key)).to.equal(true);
            yield sleep(170); // after ttl
            chai_1.expect(yield ttl.has(key)).to.equal(false);
        }));
        it('should delay expiration with additional call to put', () => __awaiter(void 0, void 0, void 0, function* () {
            yield ttl.put(key, value, 100);
            yield sleep(70); // before ttl
            yield ttl.put(key, Buffer.from('bar again'), 100);
            chai_1.expect(yield ttl.has(key)).to.equal(true);
            yield sleep(70); // after original ttl
            chai_1.expect(yield ttl.has(key)).to.equal(true);
            yield sleep(200); // after all ttl
            chai_1.expect(yield ttl.has(key)).to.equal(false);
        }));
        it('should set expiration with top-level ttl method', () => __awaiter(void 0, void 0, void 0, function* () {
            yield ttl.put(key, value); // no ttl
            yield ttl.ttl(key, 100);
            chai_1.expect(yield ttl.has(key)).to.equal(true);
            yield sleep(130); // after ttl
            chai_1.expect(yield ttl.has(key)).to.equal(false);
        }));
        it('should safely delete a key and its ttl metadata', () => __awaiter(void 0, void 0, void 0, function* () {
            const now = Date.now();
            yield ttl.put(key, value, 100);
            const exp = yield ttl.expiration(key);
            chai_1.expect(exp).to.greaterThan(now + 95);
            chai_1.expect(exp).to.lessThan(now + 105);
            yield ttl.delete(key);
            chai_1.expect(yield ttl.has(key)).to.equal(false);
            try {
                yield ttl.expiration(key);
                throw new Error('should have thrown');
            }
            catch (err) {
                chai_1.expect(err.toString()).to.equal('Error: Not Found');
            }
        }));
        it('should encode expiration time as iso timestamp', () => __awaiter(void 0, void 0, void 0, function* () {
            const now = Date.now();
            yield ttl.put(key, value, 100);
            const exp = yield ttl.expiration(key);
            chai_1.expect(exp).to.greaterThan(now + 95);
            chai_1.expect(exp).to.lessThan(now + 105);
            yield ttl.delete(key);
            try {
                yield ttl.expiration(key);
                throw new Error('should have thrown');
            }
            catch (err) {
                chai_1.expect(err.toString()).to.equal('Error: Not Found');
            }
        }));
        it('should not expire keys when ttl is turned off', () => __awaiter(void 0, void 0, void 0, function* () {
            yield ttl.put(key, value, 100);
            yield ttl.stopTTL();
            chai_1.expect(yield ttl.has(key)).to.equal(true);
            const int = ttl.startTTL();
            yield sleep(200); // after ttl _and_ restart time
            chai_1.expect(yield ttl.has(key)).to.equal(false);
        }));
        describe('ttl batch', () => {
            it('should support ttl on put', () => __awaiter(void 0, void 0, void 0, function* () {
                const batch = ttl.batch(100);
                batch.put(key, value);
                chai_1.expect(yield ttl.has(key)).to.equal(false);
                yield batch.commit();
                chai_1.expect(yield ttl.has(key)).to.equal(true);
                yield sleep(200);
                const test = yield ttl.has(key);
                chai_1.expect(test).to.equal(false);
            }));
            it('should support delete for ttl values', () => __awaiter(void 0, void 0, void 0, function* () {
                yield ttl.put(key, value, 200);
                const batch = ttl.batch(100);
                batch.delete(key);
                chai_1.expect(yield ttl.has(key)).to.equal(true);
                yield batch.commit();
                chai_1.expect(yield ttl.has(key)).to.equal(false);
            }));
            it('should correctly expire batched items', () => __awaiter(void 0, void 0, void 0, function* () {
                var e_1, _a, e_2, _b;
                const batch = ttl.batch(100);
                batch.put(key.child(new interface_datastore_1.Key('1')), value);
                batch.put(key.child(new interface_datastore_1.Key('2')), value);
                batch.put(key.child(new interface_datastore_1.Key('3')), value);
                yield batch.commit();
                let list = [];
                try {
                    for (var _c = __asyncValues(ttl.query({})), _d; _d = yield _c.next(), !_d.done;) {
                        const { key } = _d.value;
                        list.push(key);
                    }
                }
                catch (e_1_1) { e_1 = { error: e_1_1 }; }
                finally {
                    try {
                        if (_d && !_d.done && (_a = _c.return)) yield _a.call(_c);
                    }
                    finally { if (e_1) throw e_1.error; }
                }
                chai_1.expect(list).to.have.length(3);
                ttl.ttl(key.child(new interface_datastore_1.Key('3')), 300);
                yield sleep(200);
                list = [];
                const it = ttl.query({ prefix: key.toString() });
                try {
                    for (var it_1 = __asyncValues(it), it_1_1; it_1_1 = yield it_1.next(), !it_1_1.done;) {
                        const kv = it_1_1.value;
                        list.push(kv.key);
                    }
                }
                catch (e_2_1) { e_2 = { error: e_2_1 }; }
                finally {
                    try {
                        if (it_1_1 && !it_1_1.done && (_b = it_1.return)) yield _b.call(it_1);
                    }
                    finally { if (e_2) throw e_2.error; }
                }
                chai_1.expect(list).to.have.length(1);
            }));
        });
    });
});
//# sourceMappingURL=index.spec.js.map