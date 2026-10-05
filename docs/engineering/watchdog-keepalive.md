# Watchdog continuation 408/EPIPE — 2026-10-05

AI Chat's Node 22 HTTP streaming helper used the global keep-alive agent. Kujo's
HTTP server can start reading the next request header while the current long
response is still being produced. When that read times out, the vendored tiny_http
client queues an empty HTTP 408 response. Reusing the socket after the preceding
successful response can consume that 408 or encounter EPIPE. This is distinct from
an inference timeout and from a tool-command timeout.

Evidence: local benchmark logs recorded empty 408 responses in 5–38 ms, after
successful provider rounds. A provider-free Kujo fixture with a 100 ms inbound
read deadline and a 400 ms handler reproduced `200, 408, EPIPE, 200`. With a fresh
connection per request, the same four requests returned 200. A `Connection: close`
header alone with a reusable agent was insufficient in this fixture; disabling
pooling with `agent:false` was necessary.

The AI Chat fix selects fresh connections for managed Watchdog streaming rounds,
including Hermes routed through Watchdog. Other provider transports retain their
existing pooling. It does not retry inference, raise timeouts, alter tools, or
change proxy authentication. Loopback TCP connection setup is paid once per round.
No measured claim about its overall latency is made.

Reproduce without model usage:

```sh
node scripts/reproduce-watchdog-keepalive.js /absolute/path/to/qualified/kujo
node --test --test-name-pattern='Watchdog tool continuations|fresh streaming connections|default HTTP transport aborts' tests/server-routes.test.js
```

The fixture delay models the condition being tested; it is not a production fix.
Tests assert distinct sockets and exactly one request per provider round, including
when a server advertises keep-alive. Existing cancellation coverage remains.

Read-only upstream inspection: Kujo `0d22cc0ec18785a3bb13aad85a3a4528e6f17adf`,
`vendor/tiny_http-0.12.0/src/client.rs` (read-timeout response in `Iterator::next`),
`src/http_request_utils.rs` (default 10-second inbound read timeout), and
`src/interpreter/mod.rs` (routed HTTP setup). Watchdog
`a842217c794d9115f54863d69cffffae2485f663` uses that routed server. Reproduction used
AI Chat's pinned Kujo 1.7.0 binary; source HEAD alone is not proof of a running
process's build. No sibling files were modified.

Cross-repository follow-up: fix the HTTP connection lifecycle in Kujo so a slow
response cannot poison a subsequent request, with persistent-connection tests.
AI Chat's scoped mitigation removes its dependency on that upstream fix. Other
Kujo HTTP clients may still be affected; do not infer every 408 shares this cause.
