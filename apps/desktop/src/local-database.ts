import { invoke } from "@tauri-apps/api/core";

export type LocalDatabaseInfo = Readonly<{ path: string; localMode: boolean }>;

export const readLocalDatabaseInfo = () => invoke<LocalDatabaseInfo>("local_database_info");
export const revealLocalDatabase = () => invoke<void>("reveal_local_database");
export const backupLocalDatabase = () => invoke<boolean>("backup_local_database");
export const createProtectedLocalBackup = () => invoke<string>("create_protected_local_backup");
export const restoreLocalDatabase = (confirmation: string) =>
  invoke<string | null>("restore_local_database", { confirmation });
