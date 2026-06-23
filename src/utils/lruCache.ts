/**
 * Lynnix
 * File-based hypermedia routing middleware for Node.js, Mutor.js, and HTMX.
 *
 * @author Onah Victor <victoronah.dev@gmail.com>
 * @repository https://github.com/allAboutJS/Lynnix
 * @license MIT
 */

export default class LRUCache<K, V> {
	private cache: Map<K, V> = new Map();

	constructor(private size = 5_000) {}

	set(key: K, value: V) {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		if (this.cache.size >= this.size) {
			this.cache.delete(this.cache.keys().next().value as K);
		}

		this.cache.set(key, value);
	}

	get(key: K) {
		if (!this.cache.has(key)) {
			return null;
		}

		const value = this.cache.get(key);

		this.cache.delete(key);
		this.cache.set(key, value as V);

		return value as V;
	}

	has(key: K) {
		return this.cache.has(key);
	}
}
