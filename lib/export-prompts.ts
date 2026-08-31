export * from "@cadence/core/export-prompts";

export async function copyPromptText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined,
): Promise<"copied" | "failed"> {
  if (!clipboard) {
    return "failed";
  }

  try {
    await clipboard.writeText(text);
    return "copied";
  } catch {
    return "failed";
  }
}
