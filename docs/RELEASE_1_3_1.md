# AI Chat 1.3.1

Improves approval recovery and attention-inbox feedback, updates markdown parsing, and supports patched Node 26 with a compatible SQLite binding. Reproducible script-generation benchmarks now preserve delivery limitations alongside measured results.

Use Node 26.12.1 (or the supported patched Node 22/24 branches) and install dependencies with `npm ci`. Install Chromium with `npm run browser:install` when using browser tools. Native dependencies are specific to the Node ABI; startup checks can repair an incompatible binding.

This remains a local application release, not a deployed enterprise certification. The historical mixed-provider soak and target-environment acceptance boundaries remain documented; no incomplete roadmap item is promoted by this maintenance release.
