function createCounter(initial, persist) {
 let value = initial;
 return {read: () => value, async increment(delta) {
  const next = value + delta;
  await persist(next);
  value = next;
  return value;
 }};
}
module.exports = { createCounter };
