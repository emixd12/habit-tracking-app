export type AccountDeletionActionState = {
  status: "idle" | "error";
  message: string;
};

export const ACCOUNT_DELETION_INITIAL_STATE: AccountDeletionActionState = {
  status: "idle",
  message: "",
};
