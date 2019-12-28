# Time to Live Datastore _(datastore-ttl)_

[![Made by Textile](https://img.shields.io/badge/made%20by-Textile-informational.svg?style=flat-square)](https://textile.io)
[![Chat on Slack](https://img.shields.io/badge/slack-slack.textile.io-informational.svg?style=flat-square)](https://slack.textile.io)
[![GitHub license](https://img.shields.io/github/license/textileio/js-datastore-ttl.svg?style=flat-square)](./LICENSE)
[![GitHub package.json version](https://img.shields.io/github/package-json/v/textileio/js-datastore-ttl.svg?style=popout-square)](./package.json)
[![npm (scoped)](https://img.shields.io/npm/v/@textile/datastore-ttl.svg?style=popout-square)](https://www.npmjs.com/package/@textile/datastore-ttl)
[![Release](https://img.shields.io/github/release/textileio/js-datastore-ttl.svg?style=flat-square)](https://github.com/textileio/js-datastore-ttl/releases/latest)
[![docs](https://img.shields.io/badge/docs-master-success.svg?style=popout-square)](https://textileio.github.io/js-datastore-ttl)
[![standard-readme compliant](https://img.shields.io/badge/standard--readme-OK-green.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)

> An implementation of the [Datastore interface](https://github.com/ipfs/interface-datastore) that
supports a time-to-live (TTL) for key-value pairs.

After the TTL expires on a given key, the entry will be automatically cleared from the datastore
unless it is refreshed in the mean time. In this way you can build utilities like session managers
where a given session is refreshed with each interaction but expires after a set period of time
since the last interaction. This library borrows inspiration and ideas from [level-ttl](https://github.com/Level/level-ttl).

## Table of Contents

<details><summary>Click to expand</summary>

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

</details>

## Background

`TTLDatastore` uses an internal scan every 10 seconds by default, this limits the available resolution of your TTL values, possibly delaying a delete for up to 10 seconds. The resolution can be tuned by passing the `frequency` option to the constructor.

Of course, a scan takes some resources, particularly on a data store that makes heavy use of TTLs. If you don't require high accuracy for actual deletions then you can increase the `frequency`. Note though that a scan only involves invoking a query that returns only the entries due to expire, so it doesn't have to manually check through all entries with a TTL. Depending on the backing Datastore, this could be reasonably efficient, or extremely slow. So keep that in mind.

### Default TTL

You can set a default TTL value for all your keys by specifying the `ttl` option to the constructor. This can be overridden by explicitly setting the TTL value on `put` or by calling the top-level `ttl` method.

## Install

```
npm i @textileio/datastore-ttl
```

## Usage

```typescript
import { MemoryDatastore, Key } from 'interface-datastore'

// Use any compliant Datastore
const child = new MemoryDatastore()
const key = new Key('foo')
const store = new TTLDatastore(child)
await ttl.put(key, Buffer.from('bar'), 1000)
// Wait 900 milliseconds...
await ttl.ttl(key, 100) // Keep alive for another 100 milliseconds
await ttl.has(key) // true
// Wait 110 milliseconds
await ttl.has(key) // false
```

There are also several useful examples included in the [`tests` folder](https://github.com/textileio/js-datastore-ttl/tree/master/tests) of this repo.

## API

See [https://textileio.github.io/js-datastore-ttl](https://textileio.github.io/js-datastore-ttl)

## Maintainers

[Carson Farmer](https://github.com/textileio)

## Contributing

See [the contributing file](CONTRIBUTING.md). PRs accepted!

Small note: If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT](LICENSE) (c) 2019 Textile.io

## Thanks

Big thanks to the find folks behind [`Level/level-ttl`](https://github.com/Level/level-ttl/blob/master/CONTRIBUTORS.md).
