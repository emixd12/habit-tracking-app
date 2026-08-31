# Desktop asset provenance review — 2026-08-30

The owner confirmed ownership and authorized distribution of all six exact
assets inside Cadence on 2026-08-31. Fresh SHA-256 checks match the files below.
This resolves their Cadence bundling permission gate. It does not grant an MIT
license for these assets or authorize public hosting without separate approval.
Font and Lucide license evidence remains recorded separately.

## Owner authorization — 2026-08-31

The owner stated: "All six assets listed in" this record "belong to me/Cadence"
and "I authorize their distribution inside Cadence." This is explicit ownership
and distribution authorization for every file/hash in the table below. No
additional receipt or repeated permission request is needed for that scope.

The source instruction is the 2026-08-31 Ticket 113 preview request attached at
`/Users/emi/.codex/attachments/24dcc29e-7fda-4852-afe3-8ad7da82ba92/pasted-text.txt`.
The authorization preserves third-party notices, existing MIT exclusions, and
reserved trademark rights. It does not authorize unrelated relicensing or
publication of artifacts or an updater feed without concrete hosting approval.

## Scope and policy

The initial 2026-08-30 review inspected the six entries in
`/private/tmp/cadence-local-rights-inventory.json`,
their current bytes, reachable Git history, introducing commits, nearby tracked
files, binary metadata, and existing license decisions. No assets changed.
No external publication, provider action, GUI operation, or rights assumption
occurred. This is not an audit of every dependency or marketing asset.

[README.md](../../README.md#license-and-security) expressly excludes
`public/brand/**`, `public/icons/**`, and `public/sounds/**` from the MIT grant
pending provenance review. The approved
[Ticket 099 decision](../OPEN_SOURCE_DECISION_PACKET.md#3-non-code-copyright-scope-and-cadence-trademark-posture)
preserves that exclusion and reserves Cadence marks. Neither a Git author nor
permission to add a file establishes its redistribution terms. The subsequent
owner statement above supplies the specific Cadence distribution authorization;
the repository's broader exclusions remain unchanged.

## Six authorized assets

All SHA-256 values were recomputed on 2026-08-31 and match the supplied inventory.
The original review also matched the current-byte Git revisions listed below.
Those revisions establish repository history only. Each row's current permission
comes from the owner's 2026-08-31 statement, not inferred Git authorship.

| File | SHA-256 | Current bytes present in commit | Evidence and authorized scope |
| --- | --- | --- | --- |
| `public/brand/cadence-logo.png` | `c5f698ff125803070fedeb797d0b9d32027a4d83c33dcf7a0421454149c07e6a` | `6abd0978344fefbf192a8cad14cbd9d2878c08be` | Owner confirms ownership and authorizes distribution inside Cadence, 2026-08-31. Logo replaced June 11. |
| `public/brand/cadence-page-banner-lines-dots.png` | `8eb882a88f723d9a78a1640a4096a1fe3c0fe394978e3f12837fa12442778030` | `38b0ef7d35ae1a8445b8caef36dea2b100b77830` | Owner confirms ownership and authorizes distribution inside Cadence, 2026-08-31. Banner added June 27. |
| `public/brand/cadence-timeline-horse-lines-dots-clear-background.png` | `12f4279caa5800836881b08275d5ec0bbd95579f3e2781a3593be16a9e61419b` | `71dccde6608957864ae5b150aa5a605ac8839131` | Owner confirms ownership and authorizes distribution inside Cadence, 2026-08-31. Timeline image replaced June 25. |
| `public/brand/cadence-timeline-horse-lines-dots-mobile-right-18.png` | `3537cbfa926e1e1c0b7d0a50080874a59bd329daf30647d54b08e7df6395f398` | `89e8d5f061b3c0916f06d6a820de23e30d5bd9fd` | Owner confirms ownership and authorizes distribution inside Cadence, 2026-08-31. Mobile banner added August 27. |
| `public/sounds/completion-chime.mp3` | `c374131cd75897f87d5eb2885076a730e737e371b06bb54f7ac57cded35d303c` | `65036ae425290ae21048147d831352c2d2ce078c` | Owner confirms ownership and authorizes distribution inside Cadence, 2026-08-31. June 10 entry records the user-provided MP3. |
| `public/icons/cadence-notification-icon.png` | `64bc2add743280952f9c705af2b9248642748b66c8b657c4086705b2b3bcd126` | `4525a60a46015b2c001f4306bc7baddd1dfc4604` | Owner confirms ownership and authorizes distribution inside Cadence, 2026-08-31. Notification icon added June 26. |

The first five files are explicit inputs in
[the desktop Vite configuration](../../apps/desktop/vite.config.ts).
The notification icon is the app-bundle icon input in
[the Tauri configuration](../../apps/desktop/src-tauri/tauri.conf.json).
The owner's authorization covers bundling these assets inside Cadence. Merely
copying or converting bytes would not itself have established permission.

The initial metadata review supplied no asset-specific permission:

- The logo contains an sRGB color profile with a Hewlett-Packard copyright
  string. That metadata identifies the color profile, not the logo's creator.
- The horse images and notification icon contain dimensions, resolution,
  orientation, or color-space metadata. The desktop horse's XMP contains only
  orientation. The page banner has no textual metadata chunks.
- The chime has an ID3 encoder tag, `Lavf60.16.100`. No title, artist, copyright,
  license URL, or ID3v1 tag was found. Encoder identity does not identify origin.

## Documented third-party license evidence

These independent licenses remain required; the owner's asset authorization
does not replace them.

| Material | Verified local evidence | Preservation requirement recorded by its license |
| --- | --- | --- |
| IBM Plex Sans Variable, Fontsource 5.2.8 | `packages/ui/fonts.css` resolves the installed package. All six compiled WOFF2 files match package bytes. `packages/ui/LICENSE.fonts.txt` matches the package license and `apps/desktop/dist/licenses/IBM-Plex-Sans-OFL.txt`. | OFL-1.1 permits bundling under its conditions, including preservation of the copyright/license notice. Keep the font under OFL; modified-font naming restrictions remain applicable. |
| Lucide React 1.34.0 | Installed package metadata identifies ISC. The complete `node_modules/lucide-react/LICENSE` matches `apps/desktop/dist/licenses/lucide.txt`. | Preserve the complete notice: it contains ISC terms and the MIT notice for listed Feather-derived icons. |

Notice SHA-256 values:

- IBM Plex Sans: `d0283623ef57e722fd0eb688a8041589670c608ab780cd3612d06ba6f153d3fd`.
- Lucide, including Feather notice: `b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57`.

## Authorization limits

The six listed assets may be distributed inside Cadence under the owner's
statement. This record does not relicense them under MIT, grant third parties
Cadence trademark rights, or extend permission to unrelated assets. Keep all
required third-party notices. A different asset or changed hash needs its own
scope check; do not repeat the resolved permission question for these bytes.

## Verification

- Recomputed six SHA-256 hashes and compared them with the supplied inventory.
- Matched each current binary against its recorded Git revision.
- Read introducing/replacement commits and related documentation.
- Inspected PNG chunks, EXIF/XMP fields, MP3 tags, and nearby tracked notices.
- Compared bundled font bytes and both bundled notice files with package sources.
- The initial review changed no asset, license policy, `STATUS.md`, or ticket state.
- On 2026-08-31, recomputed all six hashes and recorded the explicit owner
  statement against each matching file. No asset bytes or license policy changed.
