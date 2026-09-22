"use client";

import { useEffect, useRef, useState } from "react";
import ontology from "@/docs/ontology/briefing-workbench.json";
import presets from "@/packages/core/src/data/briefing-presets.json";
import references from "@/packages/core/src/data/briefing-references.json";

const presetPath = "packages/core/src/data/briefing-presets.json";
const referencePath = "packages/core/src/data/briefing-references.json";
const ontologyPath = "docs/ontology/briefing-workbench.json";
const searchText = (text: string) => text.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();

function SourceFile({ path, repositoryRoot, symbol }: { path: string; repositoryRoot: string; symbol?: string }) {
  const [message, setMessage] = useState("");
  const absolutePath = repositoryRoot ? `${repositoryRoot}/${path}` : path;
  return <div className="space-y-1 text-sm">
    <code className="block break-all">{absolutePath}{symbol ? ` · ${symbol}` : ""}</code>
    <div className="flex flex-wrap items-center gap-x-4">
      {repositoryRoot ? <a className="inline-flex min-h-11 items-center underline" href={`vscode://file${absolutePath.split("/").map(encodeURIComponent).join("/")}`}>Open in VS Code</a> : null}
      <button type="button" className="min-h-11 underline" onClick={async () => {
        try { await navigator.clipboard.writeText(absolutePath); setMessage("File path copied."); }
        catch { setMessage("Copy unavailable. Select the file path above."); }
      }}>Copy file path</button>
      <span role="status">{message}</span>
    </div>
  </div>;
}

function JsonDocument({ value, filename }: { value: unknown; filename: string }) {
  const text = JSON.stringify(value, null, 2);
  return <>
    <a className="inline-flex min-h-11 items-center underline" download={filename} href={`data:application/json;charset=utf-8,${encodeURIComponent(text)}`}>Download {filename}</a>
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{text}</pre>
  </>;
}

/** Repository documents only. This component receives no account facts or comparison results. */
export function BriefingWorkbenchGuide({ repositoryRoot = "" }: { repositoryRoot?: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const glossary = useRef<HTMLDetailsElement>(null);
  const categories = [...new Set(ontology.terms.map(term => term.category))];
  const filtered = ontology.terms.filter(term => (!category || term.category === category) &&
    searchText(`${term.id} ${term.label} ${term.category} ${term.definition} ${term.contracts.map(contract => `${contract.path} ${contract.symbol}`).join(" ")}`).includes(searchText(query)));
  useEffect(() => {
    const reveal = () => {
      const id = window.location.hash.slice("#briefing-term-".length);
      if (!window.location.hash.startsWith("#briefing-term-") || !ontology.terms.some(term => term.id === id)) return;
      setQuery(""); setCategory("");
      if (glossary.current) glossary.current.open = true;
      requestAnimationFrame(() => document.getElementById(`briefing-term-${id}`)?.focus());
    };
    reveal(); window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return <section aria-label="Workbench glossary and documents" className="space-y-2 border-t pt-3">
    {/* A fragment target makes the browser open this native disclosure before React hydrates. */}
    <details ref={glossary} id="briefing-glossary" suppressHydrationWarning>
      <summary className="min-h-11 cursor-pointer py-2">Glossary: statuses and settings</summary>
      <div className="space-y-4 pb-4">
        <p className="max-w-prose text-sm">Definitions follow the current code contracts. Each term has a stable ID, source symbols and related terms. Model style settings express instructions, not guaranteed wording.</p>
        <div className="flex flex-wrap gap-3">
          <label className="grid min-w-0 flex-1 gap-1">Search glossary<input type="search" className="min-h-11 w-full border p-2" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <label className="grid min-w-0 gap-1">Term category<select className="min-h-11 max-w-full border p-2" value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
        </div>
        <p className="text-sm" role="status">{filtered.length} of {ontology.terms.length} terms</p>
        <div className="max-h-[36rem] overflow-auto">
          {filtered.map(term => <article key={term.id} id={`briefing-term-${term.id}`} tabIndex={-1} className="space-y-2 border-t py-4">
            <h3 className="text-lg">{term.label}</h3>
            <a className="inline-block break-all text-xs underline" href={`#briefing-term-${term.id}`}>{term.id}</a>
            <p className="max-w-prose text-sm">{term.definition}</p>
            {term.contracts.map(contract => <SourceFile key={`${contract.path}:${contract.symbol}`} {...contract} repositoryRoot={repositoryRoot} />)}
            {term.relatedIds.length ? <p className="flex flex-wrap items-center gap-x-3 text-sm">Related: {term.relatedIds.map(id => <a className="inline-flex min-h-11 items-center break-all underline" key={id} href={`#briefing-term-${id}`} onClick={() => { setQuery(""); setCategory(""); }}>{ontology.terms.find(candidate => candidate.id === id)?.label ?? id}</a>)}</p> : null}
          </article>)}
          {!filtered.length ? <p>No terms match. Try a status code or configuration field.</p> : null}
        </div>
        <SourceFile path={ontologyPath} repositoryRoot={repositoryRoot} />
        <a className="inline-flex min-h-11 items-center underline" download="briefing-workbench-ontology.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(ontology, null, 2))}`}>Download ontology</a>
      </div>
    </details>
    <details id="briefing-documents">
      <summary className="min-h-11 cursor-pointer py-2">Preset and reference documents</summary>
      <div className="space-y-6 pb-4">
        <p className="max-w-prose text-sm">Inspect the repository documents below. Open them in VS Code, or copy a file path into your editor. Downloads are copies. Workbench drafts do not change these files.</p>
        <section className="space-y-2" aria-label="Preset document">
          <h3 className="text-lg">Preset document</h3>
          <SourceFile path={presetPath} repositoryRoot={repositoryRoot} />
          <p className="max-w-prose text-sm">Edit a preset’s config using the glossary field definitions. Keep unique IDs and the cadence-default entry. Editing cadence-default changes the local daily configuration after reload; hosted promotion requires review and deployment.</p>
          <JsonDocument value={presets} filename="briefing-presets.json" />
        </section>
        <section className="space-y-2 border-t pt-4" aria-label="Reference document">
          <h3 className="text-lg">Reference document</h3>
          <SourceFile path={referencePath} repositoryRoot={repositoryRoot} />
          <p className="max-w-prose text-sm">Review the original source before editing its summary, applicability or limitations. Bump the entry revision and catalog version. Use withdrawn to retire a source. A valid citation ID does not prove support.</p>
          <ul>{references.references.map(source => <li key={source.id}><a className="inline-flex min-h-11 items-center underline" href={source.url} target="_blank" rel="noreferrer">Read original: {source.title}</a></li>)}</ul>
          <JsonDocument value={references} filename="briefing-references.json" />
        </section>
        <p className="max-w-prose text-sm">After editing, run <code>npm run test -- tests/briefing-config.test.ts tests/briefing-references.test.ts tests/briefing-ontology.test.ts</code>. Reload the workbench to load the documents. Generation still requires Run comparison.</p>
      </div>
    </details>
  </section>;
}
