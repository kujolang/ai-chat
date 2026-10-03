# Kujo documentation starting points

This is reference guidance, not a task solution. Verify behavior against the installed runtime.

Official references:
- Documentation: https://docs.kujolang.ai/
- Runtime source and docs: https://github.com/kujolang/kujo
- MCP framework: https://github.com/kujolang/mcp

Readable local sources, relative to workspace_0:
- `Kujolang/kujo-repos/kujo/docs/LANGUAGE_SPEC.md`: binding rules, function declarations, control flow, operators.
- `Kujolang/kujo-repos/kujo/docs/STANDARD_LIBRARY_REFERENCE.md`: exact builtin names/signatures and examples.
- `Kujolang/kujo-repos/mcp/README.md`: MCP framework capabilities and integration boundaries; read only if relevant.

Start with targeted reads/searches of the language specification and standard-library reference rather than guessing from another language. The available `documentation_query` tool can retrieve configured Kujo corpus citations; direct local sources are also available. Check `kujo --version` and `kujo check <file>`.

Verified reference facts:
- Functions use `func`, bindings use `:=`; `mut counter := 0` followed by `counter += 1` is documented.
- `while` has a condition and brace-delimited block; `%` is the remainder operator.
- `args()` returns user arguments only, excluding the script name. Check length before indexing.
- `parse_int("42")`, `to_int("42")`, and `to_string(42)` are documented. Do not invent conversion or clock functions; look up the exact builtin before using it.

The MCP repository is a server framework, not an automatically connected language oracle. Only invoke tools actually exposed in this session. No MCP installation, server startup, network access or configuration changes are needed for this task. The public links identify provenance; use the local sources under the existing benchmark's network restriction.
