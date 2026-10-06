// Small standard-library patterns, not complete benchmark solutions.
// Qualified by scripts/verify-kujo-reference.js against the declared runtime.
const topics = {
 presence: `// Presence is not truthiness; has_key returns numeric 0/1.
func option(value, key, fallback) {
 if has_key(value, key) == 1 { return value[key] }
 return fallback
}
let settings := {"enabled": false, "count": 0}
print(option(settings, "enabled", true))
print(option(settings, "count", 9))
print(option(settings, "missing", "fallback"))`,
 staged_validation: `// Check every proposed change before publishing a replacement.
func proposed_total(current, changes) {
 mut next := current
 for change in changes {
  if !is_int(change) { return {"ok": false} }
  if change < -10 || change > 10 { return {"ok": false} }
  next += change
  if next < 0 || next > 10 { return {"ok": false} }
 }
 return {"ok": true, "value": next}
}
mut visible := 3
let rejected := proposed_total(visible, [2, -9])
if rejected["ok"] { visible = rejected["value"] }
print(visible)
let accepted := proposed_total(visible, [2, -1])
if accepted["ok"] { visible = accepted["value"] }
print(visible)`,
 quoted_text: `// Quote one CSV cell with the standard library; preserve its contents.
func quoted(text) { return "\\\"" + replace(text, "\\\"", "\\\"\\\"") + "\\\"" }
print(quoted("a,b"))
print(quoted("say \\\"hi\\\""))`
};
const expected = {presence:'false\n0\nfallback', staged_validation:'3\n4', quoted_text:'"a,b"\n"say ""hi"""'};
module.exports = {topics, expected};
