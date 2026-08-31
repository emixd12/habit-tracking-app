// Requested sync boundary. Tracking never depends on a network or cloud identity.
// Outbox records, tombstones, and cursors remain untouched until sync is explicitly implemented.
export const SyncEngine = {
  async sync() { return { status: "disabled" as const }; },
};
