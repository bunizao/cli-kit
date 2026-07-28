# Cross-tool conformance

This suite runs the shared CLI contract against the published `ontrack`, `moodle-cli`, and
`edstem-cli` packages. It deliberately lives here so contract changes have one release gate.

Install the published tools, then run:

```sh
npm install --ignore-scripts --no-save ontrack moodle-cli edstem-cli
npm test
```

Set `CONFORMANCE_BIN_DIR` when binaries are installed elsewhere. Missing binaries are skipped for
local development; CI requires all three with `CONFORMANCE_REQUIRED=1`.

The generic suite covers usage errors, all help/version forms, `commands --json`, the shared
`commands.schema.json` shape, and the closed verb set. Authentication failures, mutation
confirmation, and the recording HTTP stub are fixture-driven because they need valid tool-specific
arguments. Add those cases to `cases.json` as each tool lands its normalized release; the runner
fails in required mode while any case remains missing.
