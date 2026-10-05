// Qualification data for a trusted performance idiom, not a general runtime
// speed guarantee. Extend only after output-equivalent process measurements.
const QUALIFIED_SHA256 = '2f9242613c497736f77c20fdb669a18b7c815e489e8a2e8cf5047ee75fd2e3e0';
const example = `func build_prefix(capacity) {
 mut out := range(0, capacity)
 mut used := 0
 while used < capacity {
  out[used] = used * used
  used += 1
 }
 return slice(out, 0, used)
}
print(to_json(build_prefix(0)))
print(to_json(build_prefix(3)))`;
function qualified(runtime) {
 return runtime?.sha256 === QUALIFIED_SHA256 && runtime.pinned === true && runtime.backend === 'default';
}
function allocationContext(runtime) {
 return qualified(runtime)
  ? 'On this qualified VM, repeated push copies arrays. For bounded output, allocate range(0, capacity) INSIDE a function, fill out[i], then slice(out, 0, used). The allocation guide has the verified pattern.'
  : 'Allocation performance is not qualified for this binary/backend; measure before making complexity or speed claims.';
}
module.exports={QUALIFIED_SHA256,example,qualified,allocationContext};
