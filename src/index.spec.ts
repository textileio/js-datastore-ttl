import { expect } from 'chai'
import { MemoryDatastore, Key } from 'interface-datastore'
import { NamespaceDatastore } from 'datastore-core'
import { TTLDatastore } from './index'

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const key = new Key('foo')
const value = Buffer.from('bar')

describe('Datastore TTL', () => {
  describe('interface-datastore', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('interface-datastore/src/tests')({
      setup() {
        const store = new MemoryDatastore()
        return new TTLDatastore(store)
      },
      teardown() {
        return
      },
    })
  })
  describe('ttl features', () => {
    let ttl: TTLDatastore
    beforeEach(() => {
      const store = new MemoryDatastore()
      ttl = new TTLDatastore(store, new NamespaceDatastore(store, new Key('ttl')), { ttl: 100, frequency: 20 })
    })
    it('should have default options', () => {
      expect(ttl).to.have.ownProperty('store')
      expect(ttl).to.have.ownProperty('options')
      expect(ttl.options).to.deep.equal({ ttl: 100, frequency: 20 })
    })
    it('should handle a single ttl entry with put', async () => {
      await ttl.put(key, value, 100)
      await sleep(70) // before ttl
      expect(await ttl.has(key)).to.equal(true)
      await sleep(170) // after ttl
      expect(await ttl.has(key)).to.equal(false)
    })
    it('should delay expiration with additional call to put', async () => {
      await ttl.put(key, value, 100)
      await sleep(70) // before ttl
      await ttl.put(key, Buffer.from('bar again'), 100)
      expect(await ttl.has(key)).to.equal(true)
      await sleep(70) // after original ttl
      expect(await ttl.has(key)).to.equal(true)
      await sleep(200) // after all ttl
      expect(await ttl.has(key)).to.equal(false)
    })
    it('should set expiration with top-level ttl method', async () => {
      await ttl.put(key, value) // no ttl
      await ttl.ttl(key, 100)
      expect(await ttl.has(key)).to.equal(true)
      await sleep(130) // after ttl
      expect(await ttl.has(key)).to.equal(false)
    })
    it('should safely delete a key and its ttl metadata', async () => {
      const now = Date.now()
      await ttl.put(key, value, 100)
      const exp = await ttl.expiration(key)
      expect(exp).to.greaterThan(now + 95)
      expect(exp).to.lessThan(now + 105)
      await ttl.delete(key)
      expect(await ttl.has(key)).to.equal(false)
      try {
        await ttl.expiration(key)
        throw new Error('should have thrown')
      } catch (err) {
        expect(err.toString()).to.equal('Error: Not Found')
      }
    })
    it('should encode expiration time as iso timestamp', async () => {
      const now = Date.now()
      await ttl.put(key, value, 100)
      const exp = await ttl.expiration(key)
      expect(exp).to.greaterThan(now + 95)
      expect(exp).to.lessThan(now + 105)
      await ttl.delete(key)
      try {
        await ttl.expiration(key)
        throw new Error('should have thrown')
      } catch (err) {
        expect(err.toString()).to.equal('Error: Not Found')
      }
    })
    it('should not expire keys when ttl is turned off', async () => {
      await ttl.put(key, value, 100)
      await ttl.stopTTL()
      expect(await ttl.has(key)).to.equal(true)
      const int = ttl.startTTL()
      await sleep(200) // after ttl _and_ restart time
      expect(await ttl.has(key)).to.equal(false)
    })
    describe('ttl batch', () => {
      it('should support ttl on put', async () => {
        const batch = ttl.batch(100)
        batch.put(key, value)
        expect(await ttl.has(key)).to.equal(false)
        await batch.commit()
        expect(await ttl.has(key)).to.equal(true)
        await sleep(200)
        const test = await ttl.has(key)
        expect(test).to.equal(false)
      })
      it('should support delete for ttl values', async () => {
        await ttl.put(key, value, 200)
        const batch = ttl.batch(100)
        batch.delete(key)
        expect(await ttl.has(key)).to.equal(true)
        await batch.commit()
        expect(await ttl.has(key)).to.equal(false)
      })
    })
  })
})
