# Data Lens

**An in‑browser, AI‑native analytics studio.** Drop a file, ask in plain language, and get a filtered, cross‑linked, AI‑authored **dashboard**, **report**, and **SQL workspace** — running **100% in your browser**, so your data never leaves the tab.

- **Hackathon track:** Work & Productivity
- **Live demo:** https://datalens.savhascelik.workers.dev/
- **Stack:** React + Vite, DuckDB‑WASM (local analytical DB), ECharts. Bring‑your‑own LLM key (OpenAI/GPT‑5.6, Gemini, Vertex, or local Ollama) via one OpenAI‑compatible client.

## What it does
- **Ask, don't configure.** A goal‑driven agent builds dashboards, applies cross‑filters, writes reports and runs SQL through a typed capability registry.
- **One central widget model** — KPI, charts, gauge, slicer, table, and a filter‑aware **AI Insight** card (the model writes SQL *and* an HTML template that re‑renders when you filter).
- **Cross‑filter across files** with automatic relationship/join detection.
- **Vision in the loop** — attach a screenshot of any widget/dashboard/report to the chat, or let the agent capture one itself.
- **Reports** — a block editor (text, chart, table, AI‑Insight, AI‑Writer) with clean print/PDF export.
- **SQL Lab** — natural language → multi‑table SQL; each query is a saved card; materialize it as a view and attach any widget (incl. AI Insight) to the result.

## Run locally
```bash
npm install
npm run dev      # dev server (Vite) — open the printed localhost URL
npm run build    # production build (tsc -b + vite build)
npm test         # 87 unit tests (vitest)
```
Then open **Settings**, choose a provider (OpenAI/GPT‑5.6 recommended for vision + tools), paste your API key, and import a CSV.

## Built with Codex and GPT‑5.6
This project was designed and implemented in an agentic loop with **Codex, powered by GPT‑5.6** — not autocomplete, but an engineer in the loop.

- **How Codex accelerated the workflow.** Every feature followed the same fast cycle: read the real codebase → plan → edit across many files → run `npm run build` + `vitest` → read failures → fix. The result was a **green build and passing tests at every checkpoint (87 tests)**, which made large refactors safe to do quickly.
- **Where the key decisions were made.** GPT‑5.6 drove the hard architecture calls: collapsing two conflicting filter mechanisms into **one central cross‑filter**; designing the **typed capability registry** that the product's own AI agent uses (search → call → execute → ask, with a budget guard); the **AI Insight** card (SQL + HTML template bound to live, filtered data); and the SQL Lab pattern of **materializing a query as a view and attaching widgets to it**. Product/design calls — one unified widget "chrome" (settings, maximize, add‑to‑report, ask‑AI), and privacy‑by‑architecture — were reasoned through the same way.
- **How GPT‑5.6 + Codex shaped the final result.** GPT‑5.6 also ships *inside* the product: at runtime it writes SQL, authors HTML insight cards and report prose, and reads charts via vision. Codex earned its keep on the unglamorous parts too — sweeping cross‑file refactors (retiring a legacy widget system for the instance model), authoring the tests that keep those refactors honest, and provider‑protocol details (e.g., handling the different image formats OpenAI vs. local Ollama expect).

## Privacy
Your data stays in the browser (DuckDB‑WASM + IndexedDB). Only your prompts — and, if you choose, a screenshot — go to the model you configured. No backend, no server‑side secrets.

## License
Apache License 2.0 — free to use with **attribution**; patent & trademark protections retained. See [LICENSE](LICENSE).
