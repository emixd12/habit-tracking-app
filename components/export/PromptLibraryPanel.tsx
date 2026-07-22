import { PromptCopyAction } from "@/components/export/PromptCopyAction";
import { EXPORT_PROMPT_TEMPLATES } from "@/lib/export-prompts";

export function PromptLibraryPanel() {
  return (
    <section className="bg-background py-1" aria-labelledby="export-prompts-title">
      <h3 id="export-prompts-title" className="text-xl leading-tight">
        Analysis prompts
      </h3>
      <p className="mt-2 max-w-3xl text-sm text-muted-readable">
        Copy a prompt into your own AI assistant together with an export of the
        same range. Each prompt states which export format and options it needs.
        Whatever the export contains, including notes and historical definitions
        when those options are selected, becomes visible to the assistant you
        paste it into.
      </p>
      <ul className="mt-4 divide-y divide-line">
        {EXPORT_PROMPT_TEMPLATES.map((template) => (
          <li key={template.id}>
            <details>
              <summary className="product-disclosure-trigger flex min-h-11 items-start gap-2 py-4">
                <span
                  aria-hidden="true"
                  className="product-disclosure-indicator mt-2"
                />
                <span className="grid min-w-0 gap-1">
                  <span className="break-words text-sm font-bold text-foreground">
                    {template.title}
                  </span>
                  <span className="max-w-[42rem] text-sm text-muted-readable">
                    {template.purpose}
                  </span>
                </span>
              </summary>
              <div className="grid gap-3 pb-4 pl-4">
                <p className="max-w-3xl text-sm text-muted-readable">
                  {template.requirements}
                </p>
                <pre className="whitespace-pre-wrap border border-line bg-surface p-4 text-sm leading-6 text-foreground">
                  {template.prompt}
                </pre>
                <PromptCopyAction
                  prompt={template.prompt}
                  templateTitle={template.title}
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
