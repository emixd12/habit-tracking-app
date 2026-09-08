import { invoke } from "@tauri-apps/api/core";

type StorageUsage = Readonly<{ databaseBytes: number; walBytes: number; shmBytes: number; recoveryBytes: number; totalBytes: number }>;
export type StorageRecoveryReport = Readonly<{ state: string; backupPath: string | null; before: StorageUsage; after: StorageUsage | null }>;
export type LocalDatabaseInfo = Readonly<{ path: string; localMode: boolean; recovery?: StorageRecoveryReport | null }>;
export const deleteStorageRecoveryBackup = () => invoke<StorageRecoveryReport>("delete_storage_recovery_backup");

export const readLocalDatabaseInfo = () => invoke<LocalDatabaseInfo>("local_database_info");
export const revealLocalDatabase = () => invoke<void>("reveal_local_database");
export const backupLocalDatabase = () => invoke<boolean>("backup_local_database");
export const createProtectedLocalBackup = () => invoke<string>("create_protected_local_backup");
export const restoreLocalDatabase = (confirmation: string) =>
  invoke<string | null>("restore_local_database", { confirmation });
