---
kind: upgrade-guide
description: "Workspace storage gains additional directories, and new chats capture their own directory configuration."
---

# Multi-directory workspaces

English | [中文](guide.zh.md)

## Change

A workspace has one primary directory and optional additional directories. New chats start in the primary directory and capture the additional directories. Editing the workspace affects new chats only; existing chats retain their working directory and access configuration. Removing a directory registration does not delete files or revoke access from existing chats.

Workspace storage advances from domain version 2 to 3. Version 2 records read with an empty additional-directory list. The first successful write atomically publishes version 3. Workspace identities, names, chat membership, ordering, pins and archives are retained. Older applications reject the new workspace version. Chats with additional directories contain a required `sandbox/directories` event; readers that do not recognize it refuse those chats.

## Migration

1. Stop the application and back up the complete Harness home before upgrading. Keep the backup separate from the active home, including any externally configured storage location.
2. Install the new application and start normally. No directory movement or manual record editing is required. Verify existing workspaces, chat order, pins and archives before editing a workspace.
3. Open **Edit workspace** to add directories. Choose **Make primary** on another directory before removing the current primary. At least one directory must remain. Save once to commit the complete form; Cancel leaves the saved configuration unchanged.
4. Start a new chat and verify its working directory and Files panel. The active sandbox mode still controls writes; adding directories does not enable unrestricted access.
5. To return to an older application, stop the new application and restore the complete pre-upgrade backup into a separate home before opening it with the older version. New-format chats and post-backup changes are not included in that recovery. Do not lower stored version numbers or delete session events.
