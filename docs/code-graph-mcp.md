# Code-graph MCP (CodeGraphContext) — opt-in

A project-scoped [CodeGraphContext](https://github.com/CodeGraphContext/CodeGraphContext) MCP server
is **configured but not enabled** in [`.mcp.json`](../.mcp.json). It indexes the codebase into a graph
(functions, imports, call/usage edges) so an agent can answer "who calls this?" / "what would this
change break?" without grepping the whole tree.

## Why it's opt-in, not on by default

Per the DX-6 rationale (`docs/plans/agentic-dx-plan.md` §Step DX-6): **add a code-graph MCP only when
codebase navigation is demonstrably costing real time — not speculatively.** So this repo ships the
config but leaves it disabled:

- `.mcp.json` lists the `code-graph` server, but Claude Code **prompts for approval** before running
  any project MCP server, and `.claude/settings.json` does **not** auto-enable it
  (`enableAllProjectMcpServers` / `enabledMcpjsonServers` are intentionally absent).
- Nothing launches until you approve it. If you never approve it, this is a no-op.

## Enable it (only if you want it)

1. **Install the server** (Python; isolated install recommended):
   ```bash
   pipx install codegraphcontext        # or: pip install codegraphcontext
   ```
2. **Run a Neo4j instance** the server can write to (Docker is easiest):
   ```bash
   docker run -d --name gitwarden-neo4j -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/please-change-me neo4j:5
   ```
3. **Point the server at it** via environment (no secret is committed — `.mcp.json` reads these):
   ```bash
   export NEO4J_URI="bolt://localhost:7687"
   export NEO4J_USERNAME="neo4j"
   export NEO4J_PASSWORD="please-change-me"
   ```
4. **Approve the server** the next time Claude Code starts in this repo (it will ask about the
   project `code-graph` server). Then index the repo from within the session, e.g. ask the agent to
   "index this codebase with the code-graph tools" (CodeGraphContext exposes an `add_code_to_graph`
   /indexing tool).

## Disable / remove

- Decline the approval prompt, or
- Remove the `code-graph` entry from `.mcp.json`.

Credentials live only in your shell environment; `.mcp.json` references `${NEO4J_PASSWORD}` and never
stores it. See `SECURITY.md` for the repo's never-commit-secrets rule.
