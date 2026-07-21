# LLM analysis API contract

The browser calls `POST /api/analysis` with the user's prompt, the active DuckDB table name, and **schema/profile metadata only**. Never send the full uploaded dataset by default.

Column `type` values are always the language-independent canonical set: `string`, `number`, `date`, `boolean`, `unknown`. The UI may display translated labels, but these labels must never be used in LLM prompts, SQL rules, or API contracts.

The server authenticates to the selected LLM provider and returns JSON only:

```json
{
  "title": "Sales performance overview",
  "summary": "Revenue is concentrated in three regions.",
  "components": [
    {
      "id": "revenue-by-region",
      "type": "bar_chart",
      "title": "Revenue by region",
      "sql": "SELECT region AS label, SUM(revenue) AS value FROM \"sales_abc\" GROUP BY 1 ORDER BY 2 DESC LIMIT 12",
      "labelColumn": "label",
      "valueColumn": "value"
    }
  ]
}
```

Allowed component types: `kpi`, `bar_chart`, `table`.

The API must instruct the LLM to produce one JSON object and must not accept or return UI source code. The browser independently rejects all non-`SELECT`/`WITH` SQL and forbids statement separators and write, file, extension, or network-related SQL commands before execution.
