// ai/insight.ts
// "AI İçgörü" (özgür/yaratıcı widget) üreteci. LLM'e şemayı verip şu yapıyı ister:
//   { htmlTemplate, queries: { <ad>: { sql, type } } }
// - queries: DuckDB SQL; HER ZAMAN `data` adlı tabloya yazılır (biz onu merkezi filtreyle
//   besleriz → içerik filtre-duyarlı olur).
// - htmlTemplate: {{degisken}}, {{obje.alan}}, {{deger | format}}, {{#dizi}}...{{/dizi}},
//   {{?kosul}}...{{/kosul}} destekli Mustache-benzeri şablon (utils/templateEngine).
//

import { chatComplete } from './llm/chatClient'
import type { Dataset } from '../types'
import type { InsightQuery } from '../services/widgetData'

export interface AiInsightSpec {
  htmlTemplate: string
  queries: Record<string, InsightQuery>
}

function buildSystemPrompt(dataset: Dataset): string {
  const columns = (dataset.columns ?? []).map(c => `${c.name}:${c.kind}`).join(', ')
  return `You design a small, self-contained HTML "insight card" for an in-browser analytics app (DuckDB).

You MUST return ONLY a raw JSON object (no markdown, no code fences) with EXACTLY this shape:
{
  "htmlTemplate": "<html fragment using {{placeholders}}>",
  "queries": { "<name>": { "sql": "<DuckDB SELECT>", "type": "single" | "array" } }
}

RULES FOR queries:
- Each query is DuckDB SQL and MUST read from a table literally named "data" (SELECT ... FROM data ...).
  "data" is already filtered by the dashboard's active cross-filters — never invent WHERE for filters yourself.
- Available columns on "data": ${columns || '(unknown)'}.
- Quote identifiers with double quotes, e.g. SELECT "Region", COUNT(*) AS n FROM data GROUP BY 1.
- type "single": the query returns ONE row; reference fields as {{name.field}}.
- type "array": the query returns MANY rows; iterate with {{#name}} ... {{/name}} and reference row fields directly (e.g. {{Region}}, {{n}}).
- Keep queries read-only SELECTs. Use LIMIT for array queries.

RULES FOR htmlTemplate:
- Return an HTML FRAGMENT (no <html>/<body>); Tailwind CSS (Play CDN) is available, so use Tailwind utility classes for styling.
- Use the template variables from your queries. Formatters: {{v | number}}, {{v | currency}}, {{v | percent}}, {{v | compact}}.
- Make it visually appealing and compact (a card/summary). It must render meaningfully with the given data.
- Do NOT include <script> tags or external resources other than Tailwind (already injected).

Return ONLY the JSON object.`
}

// prompt + dataset şemasına göre {htmlTemplate, queries} üretir.
export async function requestAiInsight(prompt: string, dataset: Dataset): Promise<AiInsightSpec> {
  const resp = await chatComplete({
    messages: [
      { role: 'system', content: buildSystemPrompt(dataset) },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  })

  let content = (resp.content ?? '').trim()
  // Olası markdown çitini temizle.
  if (content.startsWith('```')) {
    content = content.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  }
  // İlk { ... son } aralığını almaya çalış (model başına/sonuna metin eklerse).
  const first = content.indexOf('{')
  const last = content.lastIndexOf('}')
  if (first > 0 || last < content.length - 1) {
    if (first >= 0 && last > first) content = content.slice(first, last + 1)
  }

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch (err: any) {
    throw new Error(`AI içgörü geçerli JSON üretemedi: ${err?.message ?? err}`)
  }

  const htmlTemplate = typeof parsed?.htmlTemplate === 'string' ? parsed.htmlTemplate : ''
  const rawQueries = (parsed && typeof parsed.queries === 'object' && parsed.queries) || {}
  const queries: Record<string, InsightQuery> = {}
  for (const [name, q] of Object.entries(rawQueries as Record<string, any>)) {
    if (q && typeof q.sql === 'string') {
      queries[name] = { sql: q.sql, type: q.type === 'array' ? 'array' : 'single' }
    }
  }

  if (!htmlTemplate) throw new Error('AI içgörü boş htmlTemplate döndürdü.')
  return { htmlTemplate, queries }
}
