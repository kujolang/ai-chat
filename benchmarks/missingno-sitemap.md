# TEST 1: Audit a local sitemap.xml

## Prompt

Write one standalone Kujo 1.7 script. Return exactly one fenced kujo code block.
The CLI accepts exactly one local XML filename using args(). Read it with read_file.
Produce one JSON object on stdout with exactly these keys:
entries (number of direct sitemap url entries), unique_urls (number), urls (distinct
nonempty trimmed loc text in first occurrence order), duplicate_urls (each repeated
URL once, in the order its second occurrence is encountered), missing_loc (number
of entries with no nonempty loc), missing_lastmod (number with no nonempty lastmod).
Count missing_lastmod even when loc is missing. Compare URLs literally after trim;
do not normalize them, fetch them, or validate dates. Use the first matching direct
loc/lastmod child of each entry, ignoring later duplicates of that child.

Accept only a root named urlset with namespace either empty or
http://www.sitemaps.org/schemas/sitemap/0.9. Count only direct url children with the
same namespace as root, and only their direct loc/lastmod children in that namespace.
Ignore unrelated extension elements and nested loc elements. Empty urlset is valid.
Reject sitemapindex, other roots/namespaces, malformed XML, DTDs, missing files and
wrong argument counts: exit 1, empty stdout, one JSON {"error":"nonempty message"}
on stderr. Successful execution exits 0 with empty stderr. No network or writes.

Verified runtime reference (not an implementation):
- let x := expression; mut x := expression; reassignment x = expression.
- func name(x) { return x }; for child in values { ... }; while condition { ... }.
- Dictionary bracket access node["name"]; arrays via push(array,value), returning
  the new array. has_key(dict,key) returns INTEGER 0 or 1, not boolean.
- args() excludes the script name; len, trim, read_file, print, eprint, exit,
  to_json, keys are available. try { ... } except e { ... } catches runtime errors.
- parse_xml_bounded(xml,{}) is built in. It rejects malformed XML and DTDs.
  It returns {ok:true,code:"XML_DOCUMENT_PARSED",root:NODE,...}.
  Each NODE has name (local name), namespace (URI or empty string), text (direct
  decoded text, including CDATA), children (array), attributes, qualified_name.
  XML entities are decoded by the parser. Default limits: 8 MiB input, depth64,
  100000 elements. No imports or external tools required.

Example: two url entries both with loc https://example.com/ and no lastmod yield
{"entries":2,"unique_urls":1,"urls":["https://example.com/"],"duplicate_urls":["https://example.com/"],"missing_loc":0,"missing_lastmod":2}.
