import type { AiDashboardPlan, Dataset } from './types'

// Desteklenen LLM sağlayıcıları.
//  - openai: OpenAI (veya OpenAI-uyumlu herhangi bir uç)
//  - gemini: Google AI Studio (Gemini) — OpenAI-uyumlu uç (API key)
//  - vertex: Google Vertex AI — OpenAI-uyumlu uç (OAuth access token + proje/bölge)
//  - ollama: yerel Ollama
export type AiProvider = 'openai' | 'gemini' | 'vertex' | 'ollama'

export interface AiSettings {
  provider: AiProvider
  apiKey: string        // openai/gemini: API key; vertex: OAuth access token
  baseUrl: string       // boşsa sağlayıcı varsayılanı kullanılır
  model: string
  project?: string      // vertex: GCP proje kimliği
  location?: string     // vertex: bölge (ör. us-central1)
}

export function getAiSettings(): AiSettings {
  return {
    provider: (localStorage.getItem('data-lens-ai-provider') as AiProvider) || 'openai',
    apiKey: localStorage.getItem('data-lens-ai-apikey') || '',
    baseUrl: localStorage.getItem('data-lens-ai-baseurl') || '',
    model: localStorage.getItem('data-lens-ai-model') || '',
    project: localStorage.getItem('data-lens-ai-project') || '',
    location: localStorage.getItem('data-lens-ai-location') || '',
  }
}

export function saveAiSettings(settings: AiSettings) {
  localStorage.setItem('data-lens-ai-provider', settings.provider)
  localStorage.setItem('data-lens-ai-apikey', settings.apiKey)
  localStorage.setItem('data-lens-ai-baseurl', settings.baseUrl)
  localStorage.setItem('data-lens-ai-model', settings.model)
  localStorage.setItem('data-lens-ai-project', settings.project || '')
  localStorage.setItem('data-lens-ai-location', settings.location || '')
}

// Sağlayıcı varsayılan taban URL'i (kullanıcı boş bırakırsa). Vertex proje/bölgeye bağlıdır.
export function providerDefaults(provider: AiProvider): { baseUrl: string; model: string } {
  switch (provider) {
    case 'openai': return { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
    case 'gemini': return { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash' }
    case 'vertex': return { baseUrl: '', model: 'google/gemini-2.0-flash' } // base proje/bölgeden üretilir
    case 'ollama': return { baseUrl: 'http://localhost:11434/v1', model: 'llama3' }
  }
}

export interface ResolvedEndpoint {
  baseUrl: string
  model: string
  headers: Record<string, string>
  provider: AiProvider
}

// Tüm LLM çağrıları (chat + dashboard plan) bu tek çözümleyiciyi kullanır.
// Sağlayıcıya göre taban URL, kimlik doğrulama başlığı ve model varsayılanını kurar.
export function resolveLlmEndpoint(): ResolvedEndpoint {
  const s = getAiSettings()
  const def = providerDefaults(s.provider)
  let baseUrl = (s.baseUrl || '').trim()
  let model = (s.model || '').trim() || def.model
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (s.provider === 'vertex') {
    const location = (s.location || 'us-central1').trim()
    const project = (s.project || '').trim()
    if (!baseUrl) {
      baseUrl = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/endpoints/openapi`
    }
    if (s.apiKey) headers['Authorization'] = `Bearer ${s.apiKey}` // OAuth access token
  } else {
    if (!baseUrl) baseUrl = def.baseUrl
    // openai + gemini API key'i Bearer olarak; ollama'da auth yok.
    if ((s.provider === 'openai' || s.provider === 'gemini') && s.apiKey) {
      headers['Authorization'] = `Bearer ${s.apiKey}`
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, '')
  // openai/ollama özel base'lerinde /v1 eksikse ekle. gemini (/openai) ve vertex (/openapi)
  // kendi yollarını taşır; dokunma.
  if ((s.provider === 'openai' || s.provider === 'ollama') && !baseUrl.endsWith('/v1')) {
    baseUrl = `${baseUrl}/v1`
  }

  return { baseUrl, model, headers, provider: s.provider }
}

export async function fetchAvailableModels(
  provider: AiProvider,
  baseUrlOverride?: string,
  apiKeyOverride?: string
): Promise<string[]> {
  let baseUrl = (baseUrlOverride || '').trim()
  const apiKey = (apiKeyOverride || '').trim()

  // Vertex için model listeleme basit değil (OAuth + farklı uç) → elle giriş.
  if (provider === 'vertex') return []

  if (!baseUrl) baseUrl = providerDefaults(provider).baseUrl

  baseUrl = baseUrl.replace(/\/+$/, '')

  // Ollama: önce yerel /api/tags
  if (provider === 'ollama') {
    try {
      const tagsBase = baseUrl.replace(/\/v1$/, '')
      const response = await fetch(`${tagsBase}/api/tags`, {
        headers: { 'Content-Type': 'application/json' }
      })
      if (response.ok) {
        const json = await response.json()
        if (json && Array.isArray(json.models)) {
          return json.models.map((m: any) => m.name)
        }
      }
    } catch (e) {
      console.warn('Ollama tags call failed, falling back to openai-format /v1/models', e)
    }
  }

  // OpenAI-uyumlu /models (openai, gemini, ve modern ollama). gemini base zaten /openai ile biter.
  let requestUrl = baseUrl
  if ((provider === 'openai' || provider === 'ollama') && !requestUrl.endsWith('/v1')) {
    requestUrl = `${requestUrl}/v1`
  }
  requestUrl = `${requestUrl}/models`

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if ((provider === 'openai' || provider === 'gemini') && apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const response = await fetch(requestUrl, { method: 'GET', headers })

  if (!response.ok) {
    throw new Error(`Models fetch failed with status: ${response.status}`)
  }

  const json = await response.json()
  if (json && Array.isArray(json.data)) {
    return json.data.map((m: any) => m.id)
  }

  return []
}

export async function requestDashboardPlan(
  prompt: string,
  datasets: Dataset[],
  activeDataset: Dataset,
): Promise<AiDashboardPlan> {
  // Tüm sağlayıcılar için tek çözümleyici (openai/gemini/vertex/ollama).
  const { baseUrl, model, headers } = resolveLlmEndpoint()

  // Construct the active table schema description
  const activeTableSchema = {
    name: activeDataset.name,
    tableName: activeDataset.tableName,
    rowCount: activeDataset.totalRows,
    columns: activeDataset.columns.map((col) => ({
      name: col.name,
      type: col.kind,
      sample: col.sample,
    })),
  }

  const systemPrompt = `You are an expert data analyst and business intelligence generator.
Your task is to analyze the user's natural language request and the provided database schema to generate a structured "Dashboard Plan" in JSON format.

The active database table you must query is named "${activeDataset.tableName}".
The columns available in this table are:
${JSON.stringify(activeTableSchema.columns, null, 2)}

Strict rules for SQL queries:
1. Generate ONLY standard DuckDB SQL queries. DuckDB SQL is highly compliant with PostgreSQL.
2. ALWAYS use double quotes for table names and column names. Example: SELECT "MyColumn" FROM "${activeDataset.tableName}". Do NOT write SELECT MyColumn FROM Table.
3. Every query must be a read-only SELECT statement. No insert/update/delete/alter/drop/pragma queries are allowed.
4. For components of type "kpi", the query MUST return a single row with a column named "value" (e.g. SELECT SUM("Sales") as "value" FROM "${activeDataset.tableName}").
5. For components of type "bar_chart", the query must return two columns: a category column (first) and a numeric metric column named "value" (second). Example: SELECT "Region", COUNT(*) as "value" FROM "${activeDataset.tableName}" GROUP BY 1 ORDER BY 2 DESC LIMIT 10.
6. For components of type "table", the query should return columns relevant to the user request. Limit results with a LIMIT clause (e.g., LIMIT 10 or 20) to prevent slow UI loading.

You must return a raw JSON object conforming EXACTLY to this TypeScript interface:
interface AiDashboardPlan {
  title: string; // A descriptive title for the dashboard based on the user's prompt
  components: {
    id: string; // Unique string ID like "comp_1", "comp_2"
    type: "kpi" | "bar_chart" | "table";
    title: string; // Title for this card (e.g., "En Çok Satış Yapan 5 Şehir")
    sql: string; // The DuckDB SQL query to execute
  }[];
}

Generate between 1 and 4 components depending on what is necessary to answer the prompt.
IMPORTANT: You MUST return ONLY the raw JSON string. Do NOT wrap the JSON in markdown code blocks like \`\`\`json ... \`\`\` or include any additional markdown, explanations, or commentary. Output a single, parseable JSON object.`

  const userMessage = `User Request: "${prompt}"
Active Table: "${activeDataset.tableName}"`

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(
      `AI analiz motorundan hata döndü: ${response.status} ${response.statusText}\n${errorText || 'Detay bulunamadı.'}`,
    )
  }

  const result = await response.json()
  let content = result.choices?.[0]?.message?.content || ''
  
  // Clean potential markdown wrap
  content = content.trim()
  if (content.startsWith('```')) {
    content = content.replace(/^```(json)?/, '').replace(/```$/, '').trim()
  }

  try {
    const plan = JSON.parse(content) as AiDashboardPlan
    validatePlan(plan)
    return plan
  } catch (err: any) {
    console.error('Failed to parse AI output:', content)
    throw new Error(`AI planı geçerli bir JSON yapısında üretilemedi: ${err.message || err}`)
  }
}

function validatePlan(plan: AiDashboardPlan): asserts plan is AiDashboardPlan {
  if (!plan || typeof plan.title !== 'string' || !Array.isArray(plan.components) || plan.components.length === 0) {
    throw new Error('AI geçerli bir dashboard planı döndürmedi.')
  }
  for (const component of plan.components) {
    if (!component || !['kpi', 'bar_chart', 'table'].includes(component.type) || typeof component.sql !== 'string') {
      throw new Error('AI planındaki bir bileşen geçersiz.')
    }
  }
}
export { validatePlan }
