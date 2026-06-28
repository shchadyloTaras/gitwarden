# CONTEXT — gitwarden

Canonical glossary for the GitWarden product spec. Roles and terms here are authoritative; the spec uses them verbatim.

## Glossary

### Roles

- **Developer** — the person using GitWarden. Works across multiple GitHub accounts (primary persona: an employee with separate **work** and **personal** accounts; secondary: a contractor with one or more **client** accounts). The sole human actor in the MVP.

### Terms

- **Profile** — a named local Git working identity (e.g. Personal / Work / Client): an author name + email, an expected GitHub account/host, and a reference to an existing SSH key alias. A Profile describes a *working context*, not ownership of a repo.
- **Active Profile** — the Profile the Developer currently has selected as in-use.
- **Bound Profile** — the single Profile a given Repository is assigned to (the identity that Repository is expected to use).
- **Repository** — a local Git repository registered in the app, optionally bound to a Profile.
- **Effective Identity** — the author name and email Git will actually use for a Repository, together with **where it comes from** (repository-local config vs global config).
- **Author Identity** — the name/email written into a commit.
- **Transport Identity** — the SSH key / credential that actually authenticates a push. May differ from the Author Identity (right email, wrong key).
- **Safety Verdict** — the result GitWarden surfaces before an identity-bearing action: **safe**, **warning**, or **blocked**, with human-readable reasons.
- **Identity-bearing action** — any action that writes or transmits identity: commit, push (and, for visibility, fetch/pull/clone/branch-switch/repo-setup).
- **Assumed / unverified fact** — a fact GitWarden cannot confirm locally (notably the GitHub account behind an SSH key); shown as assumed, never asserted as verified.
