export type ColumnKind = 'number' | 'string' | 'date' | 'boolean' | 'unknown'

export interface ColumnProfile {
  name: string
  kind: ColumnKind
  nonEmptyCount: number
  emptyCount: number
  uniqueCount: number
  sample: string
}

export interface Dataset {
  name: string
  tableName: string
  totalRows: number
  headers: string[]
  rows: string[][]
  columns: ColumnProfile[]
}

export interface ImportProgress {
  value: number
  message: string
}

export type QueryRow = Record<string, any>

// Desteklenen grafik türleri (tek doğruluk kaynağı). Yeni tip eklendikçe burada büyür;
// ChartView, ChartWidgetView ve widget.setChartColumns bu kümeye göre çalışır.
export type ChartKind = 'bar' | 'line' | 'pie' | 'scatter' | 'treemap' | 'funnel' | 'radar'

// Uygulama çalışma alanı sekmeleri (state-aware agent + navigasyon için).
export type WorkspaceTab = 'files' | 'dashboard' | 'sqllab' | 'reports'

export interface DashboardModel {
  totalRows: number
  totalValue?: number
  numericColumn?: string
  categoryColumn?: string
  categoryOptions: string[]
  categoryRows: QueryRow[]
}

export interface AiComponent {
  id: string
  type: 'kpi' | 'bar_chart' | 'table'
  title: string
  sql: string
  xAxisKey?: string
  yAxisKey?: string
}

export interface AiDashboardPlan {
  title: string
  components: AiComponent[]
}

export interface ExecutedAiComponent extends AiComponent {
  rows: QueryRow[]
}

export interface WidgetLayout {
  id: string
  colSpan: number // 3, 4, 6, 8, 12 out of 12 columns
  height: 'short' | 'medium' | 'tall'
}

// ==================== CROSS-FILTER & RELATIONSHIPS ====================

// Yapılandırılmış aktif filtre: hangi dosyanın (tablo) hangi kolonundan hangi değerle
// geldiği net. Çoklu dosyada bu belirsizliği çözmek için kolon adı yerine kullanılır.
export interface ActiveFilter {
  tableName: string
  column: string
  value: string
  // Karşılaştırma operatörü: 'eq' (varsayılan, tam eşleşme) veya 'contains' (ILIKE %v%).
  op?: 'eq' | 'contains'
}

// İki tablo arasındaki ilişki (foreign key). fromTable.fromColumn -> toTable.toColumn.
export interface Relationship {
  id: string
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  // one-to-many: fromTable(child) çoğul, toTable(parent) tekil (toColumn benzersiz)
  cardinality: 'one-to-one' | 'one-to-many' | 'many-to-one'
  // Otomatik tespit güveni (0-1). Kullanıcı onaylayınca confirmed=true olur.
  confidence?: number
  confirmed?: boolean
}

// Otomatik tespit motorunun ürettiği aday ilişki önerisi.
export interface RelationshipSuggestion extends Relationship {
  reason: string          // neden önerildi (isim eşleşmesi, değer kapsama vb.)
  matchRatio: number      // child değerlerinin parent'ta bulunma oranı (0-1)
}

// Genişletilebilir widget örneği: her widget kendi tablosuna ve config'ine bağlı.
// Yeni ECharts tipleri eklendikçe config genişler.
export interface WidgetInstance {
  id: string
  type: string            // 'bar' | 'line' | 'pie' | 'kpi' | 'table' | ...
  sourceTable: string     // widget hangi dosyaya (tablo) bağlı
  config: {
    xColumn?: string
    yColumn?: string
    aggregation?: 'sum' | 'count' | 'avg' | 'min' | 'max'
    chartType?: 'bar' | 'line' | 'pie' | 'scatter'
    [key: string]: any
  }
}

// Yapılandırılabilir tek bir KPI kartı. İstenilen kadar eklenebilir.
export interface KpiCardConfig {
  id: string
  label: string                 // kullanıcı etiketi (boşsa otomatik üretilir)
  column: string                // hangi kolon (count için boş olabilir)
  aggregation: 'count' | 'count-distinct' | 'sum' | 'avg' | 'min' | 'max'
  format?: 'number' | 'currency' | 'compact' | 'percent'
  color?: string
}

export interface Dashboard {
  id: string
  name: string
  linkedTableNames: string[]
  // @deprecated Legacy düz filtre. Yeni structured filtre `filters` alanında.
  activeFilters: Record<string, string>
  // Yapılandırılmış çapraz filtreler (çoklu dosya destekli).
  filters?: ActiveFilter[]
  // Tablolar arası ilişkiler (kullanıcı onaylı + otomatik tespit).
  relationships?: Relationship[]
  // Genişletilebilir widget örnekleri (yeni model). Boşsa legacy dbBar/dbLine kullanılır.
  widgets?: WidgetInstance[]
  // Yeni model işareti: true ise pano YALNIZCA widgets[] (instance) ile render edilir;
  // legacy sabit widget'lar (kpis/chartBar/chartLine/table) gizlenir. Yeni oluşturulan
  // (auto + kullanıcı) panolar bu bayrakla gelir. Tanımsız/false → eski hibrit davranış korunur.
  instancesOnly?: boolean
  dbBarX: string
  dbBarY: string
  dbBarType: ChartKind
  dbLineX: string
  dbLineY: string
  dbLineType: ChartKind
  layoutOrder?: string[]
  widgetsLayout?: WidgetLayout[]
  rglLayout?: Array<{ i: string; x: number; y: number; w: number; h: number }>
  // Kullanıcının panodan kaldırdığı widget id'leri (kalıcı). Geri getirilebilir.
  hiddenWidgets?: string[]
  // Yapılandırılabilir KPI kartları. Tanımlıysa sabit 3 KPI yerine bunlar gösterilir.
  kpiCards?: KpiCardConfig[]
}

export interface ReportBlock {
  id: string
  type: 'markdown' | 'chart' | 'insight' | 'aiText'
  content?: string
  // aiText bloğu için LLM istemi (markdown içerik `content`'e üretilir).
  prompt?: string
  // AI İçgörü bloğu: o anki render edilmiş HTML anlık görüntüsü (rapor statik snapshot).
  html?: string
  title?: string
  chart?: {
    type: string
    title: string
    data: any[]
    xAxisKey: string
    yAxisKey: string
  }
}

export interface Report {
  id: string
  name: string
  blocks: ReportBlock[]
  createdAt: string
}

// SQL Lab sorgu kartı: doğal dil istemi + SQL + saklanan sonuç. Dashboard/report kartları
// gibi kalıcı; yeniden yürütülünce sonuçlar güncellenir.
export interface SqlCard {
  id: string
  title: string
  prompt: string            // doğal dil istemi (AI ile SQL üretimi için)
  sql: string
  results: QueryRow[] | null
  error: string | null
  view: 'table' | 'chart'
  chartType: 'bar' | 'line' | 'pie'
  xKey: string
  yKey: string
  // Sorgu sonucuna bağlı widget'lar (kartın SQL'i bir DuckDB view'ına materyalize edilir,
  // widget'lar bu view'ı kaynak tablo olarak kullanır). Yeniden yürütmede view + widget'lar tazelenir.
  widgets?: WidgetInstance[]
  runVersion?: number
}
