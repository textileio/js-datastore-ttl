import { Buffer } from 'buffer'
import { RWLock } from 'async-rwlock'
import { Datastore, Key, Batch, Query } from 'interface-datastore'
import { NamespaceDatastore } from 'datastore-core'
import { pack, unpack } from 'lexicographic-integer'

const ttlPrefix = new Key('ttl')
const expPrefix = new Key('exp')

export { Duration } from './duration'

export interface TTLDatastoreOptions {
  /**
   * The number of milliseconds an entry should remain in the datastore. Defaults to 0, which
   * "disables" TTL. This default can be overridden by explicitly setting the TTL value in calls
   * to `put` and/or `batch`.
   */
  ttl: number
  /**
   * How often to check for expiring entries. Defaults to every 10 seconds, or 10000 milliseconds.
   */
  frequency: number
}

type TTLOnFunction = (keys: Key[], ttl: number) => Promise<void>
type TTLOffFunction = (keys: Key[]) => Promise<void>

export class TTLBatch<Value = Buffer> implements Batch<Value> {
  private on: Key[] = []
  private off: Key[] = []
  constructor(
    public ttl: number,
    private batch: Batch<Value>,
    private ttlOn: TTLOnFunction,
    private ttlOff: TTLOffFunction,
  ) {}
  put(key: Key, value: Value, ttl?: number) {
    this.on.push(key)
    return this.batch.put(key, value)
  }
  delete(key: Key) {
    this.off.push(key)
    return this.batch.delete(key)
  }
  async commit() {
    this.off.length && (await this.ttlOff(this.off))
    this.on.length && (await this.ttlOn(this.on, this.ttl))
    return this.batch.commit()
  }
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
export class TTLDatastore<Value = Buffer> implements Datastore<Value> {
  private lock: RWLock
  private interval: number | NodeJS.Timeout = 0
  /**
   * TTLDatastore creates a new datastore that supports TTL expirations.
   *
   * @param store The underlying Datastore to wrap with TTL expirations.
   * @param meta A Datastore to use for storing TTL information. Will default to a
   * NamespaceDatastore that stores all TTL metadata in the input `store` under a `ttl` prefix.
   * If you don't want to mix your metadata with your keys, consider provider your own store directly.
   * @param options A set of options for controlling the underlying TTL mechanics.
   */
  constructor(
    public store: Datastore<Value>,
    private meta: Datastore<Buffer> = new NamespaceDatastore(store, ttlPrefix),
    readonly options: TTLDatastoreOptions = { ttl: 0, frequency: 10000 },
  ) {
    this.lock = new RWLock()
    this.startTTL()
  }

  /**
   * The core method that checks for expired keys.
   */
  private async checkTTL() {
    await this.lock.readLock()
    try {
      const exp: string = pack(Date.now(), 'hex')
      // @note: ttlPrefix is required 'hack' because NamespaceDatastore doesn't take this into account
      const lte = ttlPrefix.child(expPrefix.child(new Key(exp)))
      const query: Query<Buffer> = {
        prefix: expPrefix.toString(),
        filters: [item => item.key.toString() <= lte.toString()],
      }
      const meta = this.meta.batch()
      const store = this.store.batch()
      for await (const { key, value } of this.meta.query(query)) {
        const k = new Key(value) // the value _is_ the key
        meta.delete(key) // exp key that matches this query
        meta.delete(k) // key for tracking exp timestamp
        store.delete(k) // the _actual_ data that should expire
      }
      await meta.commit()
      await store.commit()
    } finally {
      this.lock.unlock()
    }
  }

  /**
   * addTTL sets the TTL metadata for given (array of) keys.
   * @param keys The keys
   * @param ttl The time-to-live, in milliseconds. Skips update if not specified.
   */
  protected async addTTL(keys: Key[], ttl?: number) {
    if (ttl === undefined) return
    // @todo: Can we share a single 'batch' between addTTL and removeTTL?
    await this.lock.writeLock()
    try {
      await this.removeTTL(keys)
      // Uses UTC because we don't need locale support
      const exp = pack(Date.now() + (ttl || this.options.ttl), 'hex')
      const batch = this.meta.batch()
      for (const key of keys) {
        batch.put(expPrefix.child(new Key(exp)).child(key), key.toBuffer())
        batch.put(key, Buffer.from(exp))
      }
      return await batch.commit()
    } finally {
      this.lock.unlock()
    }
  }

  /**
   * removeTTL deletes the TTL metadata for given (array of) keys.
   * @param keys The keys
   */
  protected async removeTTL(keys: Key[]) {
    const batch = this.meta.batch()
    for (const key of keys) {
      try {
        const exp = await this.meta.get(key)
        batch.delete(expPrefix.child(new Key(exp)).child(key))
        batch.delete(key)
      } catch (err) {
        // pass
      }
    }
    return await batch.commit()
  }

  /**
   * put stores a value with the given key.
   * @note If you put the same entry twice, you refresh the TTL to the last put operation.
   * @param key The key.
   * @param value The value.
   * @param ttl The time-to-live, in milliseconds. Defaults to `options.ttl`.
   */
  async put(key: Key, value: Value, ttl?: number) {
    await this.addTTL([key], ttl)
    return this.store.put(key, value)
  }

  /**
   * delete removes the content stored under the given key.
   * @param key The key.
   */
  async delete(key: Key) {
    await this.removeTTL([key])
    return this.store.delete(key)
  }

  /**
   * batch returns a Batch object with which you can chain multiple operations.
   * The operations are only executed upon calling `commit`. Any `put` operation on a batch
   * will use the supplied TTL value.
   */
  batch(ttl?: number) {
    return new TTLBatch(ttl || this.options.ttl, this.store.batch(), this.addTTL.bind(this), this.removeTTL.bind(this))
  }

  // TTL-specific methods

  /**
   * expiration returns the expiration UTC timestamp in milliseconds for a given key.
   * @param key The key.
   */
  async expiration(key: Key): Promise<number> {
    const buf = await this.meta.get(key)
    return unpack(buf.toString())
  }

  /**
   * ttl inserts or updates a TTL for a given key.
   * @note This will update the TTL even if the given key doesn't exist yet, but may in the future.
   * @param key The key.
   * @param ttl The time-to-live, in milliseconds. Defaults to `options.ttl`.
   */
  async ttl(key: Key, ttl?: number) {
    return this.addTTL([key], ttl)
  }

  /**
   * stopTTL clears the underlying TTL timer.
   * If stopped, keys will no longer expire, but any new entires will still be given TTL values,
   * which may expire after the timer is restarted (@see startTTL).
   */
  async stopTTL() {
    // We can't close the store while an iterator is in progress so if one is, defer
    await this.lock.readLock()
    try {
      clearInterval(this.interval as number)
      this.interval = 0
    } finally {
      this.lock.unlock()
    }
  }

  /**
   * startTTL starts the underlying TTL timer.
   * This is called by default upon datastore initialization, but can be used to restart a the
   * TTL timer after stopTTL has been called (@see stopTTL).
   */
  startTTL() {
    if (this.interval === 0) {
      this.interval = setInterval(this.checkTTL.bind(this), this.options.frequency)
      this.interval.unref && this.interval.unref()
    }
    return this.interval
  }

  // Methods not affected by TTL

  /**
   * get retrieves the value stored under the given key.
   * @param key The key.
   */
  async get(key: Key) {
    return this.store.get(key)
  }

  /**
   * has checks for the existence of a given key.
   * @param key The key.
   */
  async has(key: Key) {
    return this.store.has(key)
  }

  /**
   * query searches the store for key/value pairs matching a given query.
   * @param query Object describing the query parameters.
   */
  query(query: Query<Value>) {
    query.filters = [...(query.filters || []), item => !item.key.isDecendantOf(ttlPrefix)]
    return this.store.query(query)
  }

  /**
   * open the datastore.
   * This is only needed if the store was closed before, otherwise this is taken care of by the
   * constructor. If a store is reopened, the TTL timing is not automatically restarted
   * (@see startTTL).
   */
  async open() {
    return this.store.open()
  }

  /**
   * close the datastore.
   * This should always be called to ensure resources are cleaned up. This will wait until the
   * TTL timer has been cleared before resolving.
   */
  async close() {
    await this.stopTTL()
    return this.store.close()
  }
}
