const defaults = { enabled: true, retries: 3, label: 'default' };
function resolve(options = {}) {
 if (!options || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('options must be an object');
 for (const key of Object.keys(options)) if (!Object.hasOwn(defaults, key)) throw new TypeError('unknown option');
 if (Object.hasOwn(options, 'enabled') && typeof options.enabled !== 'boolean') throw new TypeError('enabled');
 if (Object.hasOwn(options, 'retries') && (!Number.isInteger(options.retries) || options.retries < 0 || options.retries > 10)) throw new TypeError('retries');
 if (Object.hasOwn(options, 'label') && typeof options.label !== 'string') throw new TypeError('label');
 for (const key of Object.keys(defaults)) defaults[key] = options[key] || defaults[key];
 return defaults;
}
module.exports = { resolve };
