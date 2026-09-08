import { invoke } from "@tauri-apps/api/core";
import { localDatabaseCommand } from "./local-store";

type StorageUsage = Readonly<{ databaseBytes: number; walBytes: number; shmBytes: number; recoveryBytes: number; totalBytes: number }>;
export type StorageRecoveryReport = Readonly<{ state: string; backupPath: string | null; before: StorageUsage; after: StorageUsage | null }>;
export type LocalDatabaseInfo = Readonly<{ path: string; localMode: boolean; recovery?: StorageRecoveryReport | null }>;
export const deleteStorageRecoveryBackup = () => localDatabaseCommand<StorageRecoveryReport>("delete_storage_recovery_backup");

export const readLocalDatabaseInfo = () => invoke<LocalDatabaseInfo>("local_database_info");
export const revealLocalDatabase = () => invoke<void>("reveal_local_database");
export const backupLocalDatabase = () => localDatabaseCommand<boolean>("backup_local_database");
export const createProtectedLocalBackup = () => localDatabaseCommand<string>("create_protected_local_backup");
export const restoreLocalDatabase = (confirmation: string) =>
  localDatabaseCommand<string | null>("restore_local_database", { confirmation });
