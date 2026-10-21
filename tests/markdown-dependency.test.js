const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

// Exercise the same browser distribution served by /vendor/markdown-it.
const bundle = fs.readFileSync(require.resolve("markdown-it/dist/markdown-it.min.js"), "utf8");
function render(source) {
 const context = vm.createContext({ source });
 vm.runInContext(bundle, context);
 return vm.runInContext('markdownit({html:false,linkify:true,breaks:true,typographer:false}).render(source)', context, { timeout: 10000 });
}

test("browser Markdown preserves legitimate formatting and rejects raw HTML", () => {
 const output = render('**bold**\n\n[link](https://example.com)\n\n<script>alert(1)</script>');
 assert.match(output, /<strong>bold<\/strong>/);
 assert.match(output, /href="https:\/\/example.com"/);
 assert.doesNotMatch(output, /<script>/);
 assert.match(output, /&lt;script&gt;/);
});

test("browser Markdown bounds unclosed multiline reference labels and titles", () => {
 // GHSA-gfr2-rv44-r23c: the previous release repeatedly copied growing strings.
 for (const source of ['[a]: /u "' + 'x\n'.repeat(200000), '[' + 'a\n'.repeat(200000)]) {
  assert.equal(typeof render(source), "string");
 }
});
