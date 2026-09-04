# Desktop local database controls acceptance

Ticket 117 passed native acceptance on 2026-08-31.

Settings displayed the exact managed database path:
`~/Library/Application Support/app.cadence.desktop/cadence.sqlite3`.
**Reveal in Finder** opened that Application Support folder and selected the
exact live database.

**Back Up** saved `/private/tmp/cadence-native-qa/ticket-117-backup.sqlite3`
through the native save dialog. The file used mode `0600`. SQLite integrity
returned `ok`, foreign-key validation returned no rows, and the profile remained
available.

After the required human approval, the native restore picker opened that
verified backup. Cadence reported the protected pre-restore backup at:
`~/Library/Application Support/app.cadence.desktop/Backups/<protected-backup>.sqlite3`.

The restored live database and protected backup both passed integrity `ok`, no
foreign-key rows, schema version 6, and mode `0600`. The protected copy used a
read-only immutable inspection because the sandbox prevented journal creation.
Cadence then quit and relaunched successfully. Timeline loaded normally from
the restored database.

Automated evidence also passed: 43 Rust tests, 1,372 repository tests, desktop
typecheck/build, root typecheck/build, lint with seven existing warnings,
agents, interactions, and resolvers checks. The signed local app bundle built.
DMG packaging failed later and is not a Ticket 117 acceptance requirement.
