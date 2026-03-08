---
name: log-session
description: Log a summary of the current session's work to a daily session log file. Use at the end of a session to record what was done.
argument-hint: "[optional summary]"
---

# Log Session

Append a session summary to a daily log file in `session-logs/`.

## Instructions

1. Determine today's date (YYYY-MM-DD format).
2. Check if `session-logs/YYYY-MM-DD.md` exists.
   - If it exists, read it and append a new `---` separator + session entry at the bottom.
   - If it doesn't exist, create it with a `# YYYY-MM-DD` heading and the first entry.
3. Review the work done in this conversation — look at git log, recent changes, and context.
4. Write the entry following the format below.
5. Keep entries concise but comprehensive — someone reading should understand what changed and why.

If the user provides $ARGUMENTS, use that as context for the session summary.

## Format

For a new file:

```markdown
# YYYY-MM-DD

## HH:MM — Brief Title

### Area of Work
- What was done
- Key decisions made
- Notable issues encountered

### Commit
- `hash` on `branch-name`
```

For appending to an existing file:

```markdown

---

## HH:MM — Brief Title

### Area of Work
- What was done

### Commit
- `hash` on `branch-name`
```
