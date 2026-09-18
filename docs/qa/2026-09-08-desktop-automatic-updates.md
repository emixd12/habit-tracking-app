# Automatic update downloads — 2026-09-08

Ticket 131 is implemented atop repair commit
509f7a88c26621bacade4537b82f8e3bd3bcf0ab. This branch excludes unrelated
Note shortcut runtime changes, migrations, and dependency changes.

Parent inspected the complete diff and verified agents, interactions, resolvers,
lint, web and desktop types, 1,544 JavaScript tests (25 skipped), web and desktop
builds, 86 native tests, 17 SQLite contracts, core, design-system, desktop parity,
marketing build, and marketing checks. Seven existing lint warnings remain.
Public-source checks reported zero findings and public-trust checks passed.

The initial isolated review found database maintenance could overlap restart.
Backup, restore, protected backup creation, and recovery-backup deletion now share
the pending-command guard. Tests cover native-dialog lifetimes, completion, and
failure. Parent reran the required JavaScript checks and builds after correction.
Fresh correction review returned `ship`, with no blockers.

The Settings fixture passed keyboard actions, retry, progress and error semantics,
manual-download preference, reduced motion, and narrow layout without overflow.
This fixture evidence does not replace signed installed acceptance.

Repair preview.21 is installed. The live database shrank from 6.21 GB to 6.53 MB
and integrity checks passed. The protected recovery backup remains intact.
The owner must complete the macOS Keychain prompt before normal sync convergence
and unchanged reconciliation can be verified. Ticket 131 remains in progress and
unreleased until that repair acceptance and its own signed installed checks pass.

## Installed correction — 2026-09-09

Preview.22 opened after owner Keychain approval. Installed testing found that
its separate download call lacked native permission: main.json still allowed
only the old combined download-and-install command. Preview.23 used identical
source. The public feed was restored to verified repair preview.21 after this
finding; installed clients are not downgraded.

The correction replaces the combined permission with allow-download and
allow-install. The installed plugin's generated permission definitions and the
native build's generated capability file confirm both command permissions.
A new runnable capability regression check passes. Parent verification passed
1,545 JavaScript tests (25 skipped), required governance checks, lint, types,
and web/desktop builds. Preview.24 passed native build and all artifact checks.
Fresh correction review returned `ship`, with no findings. Replacement release
activation and direct installed acceptance remain pending.
