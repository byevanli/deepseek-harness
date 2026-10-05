---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-05-session-directories

English | [中文](2026-10-05-session-directories.zh.md)

## Summary

Adds a durable snapshot of the additional directories captured when a session is created.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-05-session-directories
baseline: false
changes:
  - root: "event:sandbox/directories"
    previous: null
    after: "57d29f4094454c38fae542e107efbd63d5572575c1c7f34a0d35d1fb6d98bf95"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing sessions without the event retain an empty additional-directory list. The event is required on read: older readers refuse it instead of replaying different filesystem permissions. The session header, envelope and physical generation remain unchanged. Workspace storage versioning is independent.

<a id="verification"></a>
## Verification

Focused sandbox-policy, sandbox roots, session creation/fork and child-agent tests exercise captured directory projection, unchanged existing sessions and inherited configuration. Cross-platform runner execution remains platform-specific.

<a id="dev-note"></a>
## Dev Note

None.
