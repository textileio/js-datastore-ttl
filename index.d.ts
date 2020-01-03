/// <reference types="node" />
import { Datastore, Key, Batch, Query } from 'interface-datastore';
import { Duration } from './duration';
export { Duration };
export interface TTLDatastoreOptions {
    /**
     * The number of milliseconds an entry should remain in the datastore. Defaults to 0, which
     * "disables" TTL. This default can be overridden by explicitly setting the TTL value in calls
     * to `put` and/or `batch`.
     */
    ttl: number;
    /**
     * How often to check for expiring entries. Defaults to every 10 seconds, or 10000 milliseconds.
     */
    frequency: number;
}
declare type TTLOnFunction = (keys: Key[], ttl: number) => Promise<void>;
declare type TTLOffFunction = (keys: Key[]) => Promise<void>;
export declare class TTLBatch<Value = Buffer> implements Batch<Value> {
    ttl: number;
    private batch;
    private ttlOn;
    private ttlOff;
    private on;
    private off;
    constructor(ttl: number, batch: Batch<Value>, ttlOn: TTLOnFunction, ttlOff: TTLOffFunction);
    put(key: Key, value: Value): void;
    delete(key: Key): void;
    commit(): Promise<void>;
}
/**
 * TTLDatastore is an implementation of the Datastore interface that supports a time-to-live
 * (TTL) for datastore entries. After the TTL expires on a given key, the entry will be
 * automatically cleared from the datastore unless it is refreshed in the mean time. In this way
 * you can build utilities like session managers where a given session is refreshed with each
 * interaction but expires after a set period of time since the last interaction.
 *
 * @note TTLDatastore borrows ideas from https://github.com/Level/level-ttl.
 */
export declare class TTLDatastore<Value = Buffer> implements Datastore<Value> {
    store: Datastore<Value>;
    private meta;
    private lock;
    private interval;
    readonly options: TTLDatastoreOptions;
    /**
     * TTLDatastore creates a new datastore that supports TTL expirations.
     *
     * @param store The underlying Datastore to wrap with TTL expirations.
     * @param meta A Datastore to use for storing TTL information. Will default to a
     * NamespaceDatastore that stores all TTL metadata in the input `store` under a `ttl` prefix.
     * If you don't want to mix your metadata with your keys, consider provider your own store directly.
     * @param options A set of options for controlling the underlying TTL mechanics.
     */
    constructor(store: Datastore<Value>, meta?: Datastore<Buffer>, options?: TTLDatastoreOptions);
    /**
     * The core method that checks for expired keys.
     */
    private checkTTL;
    /**
     * addTTL sets the TTL metadata for given (array of) keys.
     * @param keys The keys
     * @param ttl The time-to-live, in milliseconds. Skips update if not specified or infinitely large.
     */
    protected addTTL(keys: Key[], ttl?: number): Promise<void>;
    /**
     * removeTTL deletes the TTL metadata for given (array of) keys.
     * @param keys The keys
     */
    protected removeTTL(keys: Key[]): Promise<void>;
    /**
     * put stores a value with the given key.
     * @note If you put the same entry twice, you refresh the TTL to the last put operation.
     * @param key The key.
     * @param value The value.
     * @param ttl The time-to-live, in milliseconds. Defaults to `options.ttl`.
     */
    put(key: Key, value: Value, ttl?: number): Promise<void>;
    /**
     * delete removes the content stored under the given key.
     * @param key The key.
     */
    delete(key: Key): Promise<void>;
    /**
     * batch returns a Batch object with which you can chain multiple operations.
     * The operations are only executed upon calling `commit`. Any `put` operation on a batch
     * will use the supplied TTL value.
     */
    batch(ttl?: number): TTLBatch<Value>;
    /**
     * expiration returns the expiration UTC timestamp in milliseconds for a given key.
     * @param key The key.
     */
    expiration(key: Key): Promise<number>;
    /**
     * ttl inserts or updates a TTL for a given key.
     * @note This will update the TTL even if the given key doesn't exist yet, but may in the future.
     * @param key The key.
     * @param ttl The time-to-live, in milliseconds. Defaults to `options.ttl`.
     */
    ttl(key: Key, ttl?: number): Promise<void>;
    /**
     * stopTTL clears the underlying TTL timer.
     * If stopped, keys will no longer expire, but any new entires will still be given TTL values,
     * which may expire after the timer is restarted (@see startTTL).
     */
    stopTTL(): Promise<void>;
    /**
     * startTTL starts the underlying TTL timer.
     * This is called by default upon datastore initialization, but can be used to restart a the
     * TTL timer after stopTTL has been called (@see stopTTL).
     */
    startTTL(): number | NodeJS.Timeout;
    /**
     * get retrieves the value stored under the given key.
     * @param key The key.
     */
    get(key: Key): Promise<Value>;
    /**
     * has checks for the existence of a given key.
     * @param key The key.
     */
    has(key: Key): Promise<boolean>;
    /**
     * query searches the store for key/value pairs matching a given query.
     * @param query Object describing the query parameters.
     */
    query(query: Query<Value>): AsyncIterable<import("interface-datastore").Result<Value>>;
    /**
     * open the datastore.
     * This is only needed if the store was closed before, otherwise this is taken care of by the
     * constructor. If a store is reopened, the TTL timing is not automatically restarted
     * (@see startTTL).
     */
    open(): Promise<void>;
    /**
     * close the datastore.
     * This should always be called to ensure resources are cleaned up. This will wait until the
     * TTL timer has been cleared before resolving.
     */
    close(): Promise<void>;
}
