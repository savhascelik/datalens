// ai/sql.ts
// Doğal dil istemini DuckDB SQL sorgusuna çeviren yardımcı (SQL Lab için).
// Yüklü TÜM tabloların şemasını verir → model gerektiğinde tablolar arası JOIN yazabilir.

import { chatComplete } from './llm/chatClient'
import type { Dataset } from '../types'

function allSchemas(datasets: Dataset[]): string {
  if (!datasets.length) return '(no tables loaded)'
  return datasets.map(d => {
    const cols = (d.columns ?? []).map(c => `"${c.name}" ${c.kind}`).join(', ')
    return `- "${d.tableName}" (${d.totalRows} rows): ${cols}`
  }).join('\n')
}

// prompt + yüklü datasetler → tek bir DuckDB SELECT/WITH sorgusu (düz metin).
// primaryTable verilirse model önceliği ona verir (aktif dosya), ama gerekirse join yapabilir.
export async function requestSqlFromPrompt(prompt: string, datasets: Dataset[], primaryTable?: string): Promise<string> {
  const resp = await chatComplete({
    messages: [
      {
        role: 'system',
        content: `You are a DuckDB SQL expert. Convert the user's request into ONE read-only DuckDB SQL query.

AVAILABLE TABLES:
${allSchemas(datasets)}
${primaryTable ? `\nPrimary/active table: "${primaryTable}" (prefer it unless the request needs others).` : ''}

RULES:
- Return ONLY the SQL text — no explanations, no markdown code fences.
- Read-only: a single SELECT (or WITH ... SELECT). No INSERT/UPDATE/DELETE/CREATE/DROP.
- Always double-quote identifiers, e.g. SELECT t."col" FROM "table" t.
- You MAY JOIN across the available tables when the request needs data from more than one.
- Add a sensible LIMIT (e.g. 100) unless the request implies an aggregate.`,
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.1,
  })
  let sql = (resp.content ?? '').trim()
  if (sql.startsWith('```')) sql = sql.replace(/^```(sql)?/i, '').replace(/```$/, '').trim()
  return sql
}
