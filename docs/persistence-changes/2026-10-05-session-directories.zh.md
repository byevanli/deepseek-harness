---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-05-session-directories

[English](2026-10-05-session-directories.md) | 中文

## 概述

新增会话创建时固定保存附加目录的持久化快照。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

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
## 兼容性

没有该事件的已有会话保留空附加目录列表。读取方必须识别该事件；旧读取方拒绝它，避免以不同的文件权限回放。会话头部、事件外壳和物理代际不变。工作区存储版本独立管理。

<a id="verification"></a>
## 验证

针对 sandbox-policy、sandbox roots、会话创建与分叉、子 Agent 的测试覆盖固定目录投影、已有会话保持和目录继承。各平台运行器的真实执行仍须在对应平台验证。

<a id="dev-note"></a>
## 开发备注

无。
