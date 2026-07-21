// ai/agent/tools.ts
// Meta-tools exposed to the LLM. Descriptions are ENGLISH (model-facing, canonical);
// the user-facing result messages are localized via i18n elsewhere.
//   - search_capabilities: find capabilities by keyword (token-cheap)
//   - call_capability: run a discovered capability by id
//   - execute_code: Code Mode (isolated Web Worker sandbox)
//   - ask_user: ask the user one clarifying question and stop

import type { ToolDef } from '../llm/chatClient'
import { searchCapabilities, executeCapability, getCapability } from '../capabilities/registry'
import { runCode } from '../codeMode/executor'
import { getAiRuntimeSettings } from '../settings'
import i18n from '../../i18n'

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'search_capabilities',
      description:
        'Search for actions (capabilities) you can perform, by keyword. Always search first to find the right capability before acting. Query in ENGLISH regardless of the user language. Returns up to 5 results (id, title, description, argsSchema).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'English keywords to search (e.g. "bar chart", "cross filter", "create dashboard", "column schema")' },
          limit: { type: 'integer', description: 'Number of results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'call_capability',
      description:
        'Run a capability found via search_capabilities by its id and arguments. Capabilities are NOT directly callable functions: never call a name like "dashboard.create" directly — always wrap it as call_capability({ id, args }). Args must match the capability argsSchema.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Capability id (e.g. "widget.setChartColumns")' },
          args: { type: 'object', description: 'Arguments for the capability' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_code',
      description:
        'Write browser JavaScript to run multiple capabilities in one turn (conditional/looping). Inside the code use `await datalens.call(capabilityId, args)`. Use for complex multi-step work.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'JavaScript that uses datalens.call(...)' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description:
        'If the request is genuinely ambiguous and you cannot resolve it from the schema/sample data, ask the user ONE short question BEFORE proceeding. Use only when truly necessary and on its own (not alongside other tools).',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'A single, clear question for the user' },
        },
        required: ['question'],
      },
    },
  },
]

// --- Araç çalıştırıcıları ---

export function runSearchCapabilities(args: any): { ok: true; results: any } {
  const query = String(args?.query ?? '')
  const limit = Number(args?.limit) || 5
  return { ok: true, results: searchCapabilities(query, limit) }
}

export async function runCallCapability(args: any) {
  const id = String(args?.id ?? '')
  if (!id) return { success: false, message: 'id gerekli', error: 'missing_id' }
  return executeCapability(id, args?.args ?? {})
}

// Model bazen keşfettiği yeteneği call_capability ile sarmalamak yerine doğrudan
// (ör. "dashboard.create") çağırır. Bu yaygın hatayı yakalamak için: araç adı
// kayıtlı bir capability id'siyse onu doğrudan çalıştırırız (hoşgörü ilkesi).
export function isCapabilityId(name: string): boolean {
  return !!getCapability(name)
}

export async function runDirectCapability(name: string, args: any) {
  return executeCapability(name, args ?? {})
}

// Code Mode: kullanıcı kodunu izole Web Worker sandbox'ta çalıştırır.
// Yalnızca kayıtlı capability'lere `datalens.call` ile erişilir; timeout + çağrı
// limiti executor tarafından uygulanır.
export async function runExecuteCode(args: any) {
  const code = String(args?.code ?? '')
  if (!code.trim()) {
    return { success: false, message: i18n.t('ai.tool.codeEmpty', { defaultValue: 'Çalıştırılacak kod boş.' }), error: 'empty_code' }
  }
  const { timeoutMs } = getAiRuntimeSettings()
  const res = await runCode(code, { timeoutMs })
  return {
    success: res.success,
    message: res.success
      ? i18n.t('ai.tool.codeRanCalls', { defaultValue: '{{count}} yetenek çağrısı çalıştırıldı.', count: res.calls })
      : (res.message || i18n.t('ai.tool.codeDisabled')),
    error: res.error,
    data: { calls: res.calls, logs: res.logs, result: res.data },
  }
}
