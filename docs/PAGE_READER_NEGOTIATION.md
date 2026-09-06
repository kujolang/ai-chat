# Page Reader content negotiation

`web_fetch` requests `Accept: text/markdown, text/html;q=0.9, text/plain;q=0.8`.
Servers offering Markdown can return it directly; servers returning HTML or plain
text retain the existing extraction path. Markdown is preserved as bounded text,
including code fences, and remains untrusted evidence. Existing decompression,
charset, cancellation, redirect/DNS, byte, and result limits still apply.

Negotiation uses one request per redirect hop. There is no capability probe,
second fetch, or retry on 406: that status remains `web_fetch_upstream_failed`.
Servers should vary cached negotiated representations by `Accept`. Page Reader
has no shared response cache. Negotiation is owned by `lib/page-fetch.js` and
preserved by the read-only HTTP client's allowed request headers.

This does not select a programming language or prune code tabs. It sends no
`Accept-Language`, `X-Code-Language`, or other code-language header. Browser
navigation, search APIs, model-provider requests, and action adapters retain their
own protocol behavior. Markdown links remain in returned text; unlike HTML,
Markdown is not parsed into the separate `links` array.

`node --test tests/page-fetch.test.js` verifies negotiated compressed Markdown,
code-fence preservation, HTML/plain fallback, truncation, no extra 406 request,
and the existing network and output bounds.
