import { ReactNode } from 'react'
import type { WidgetInstance } from '../../types'

export interface WidgetContext {
  t: (key: string, options?: any) => string;
  activeDataset: any;
  // Panoya bağlı tüm veri setleri (config popover'ın widget'ın kendi tablosunun
  // kolonlarını bulabilmesi için — widget.sourceTable aktif tablodan farklı olabilir).
  datasets?: any[];
  detectedColumns: any;
  activeDashboard: any;
  setDashboards: React.Dispatch<React.SetStateAction<any[]>>;
  addChartToReport: (type: string, title: string, data: any[], xAxisKey: string, yAxisKey: string) => void;
  // AI İçgörü kartının o anki render edilmiş HTML'ini rapora ekler (snapshot).
  addInsightToReport?: (title: string, html: string) => void;
  // Bir widget'ı büyütülmüş (maximize) modda göster. DashboardTab widget'ı büyük render eder.
  onMaximizeWidget: (widgetId: string) => void;
  // Çoklu dosya / çapraz filtre bağlamı:
  filters: import('../../types').ActiveFilter[];
  relationships: import('../../types').Relationship[];
  toggleStructuredFilter: (tableName: string, column: string, value: string, op?: 'eq' | 'contains') => void;
  isDbReady: boolean;
  // Ortak "rapora ekle" kabuk butonu için: içerik bileşenleri (grafik) o anki verisini
  // rapora ekleyecek fonksiyonu bu map'e widget id'siyle kaydeder; WidgetShell başlığındaki
  // buton bu fonksiyonu çağırır. Ref map olduğu için yeniden render tetiklemez.
  reportActions?: { current: Map<string, () => void> };
  // Widget büyütülmüş modda mı render ediliyor (bileşen buna göre yükseklik/sayfa ayarlar).
  isMaximized?: boolean;
}

export interface IDashboardWidget {
  id: string;
  isVisible(context: WidgetContext): boolean;
  getTitle(context: WidgetContext): string;
  getIcon(context: WidgetContext): ReactNode;
  canMaximize(context: WidgetContext): boolean;
  renderContent(context: WidgetContext): ReactNode;
  // Çoklu (instance) widget ise alttaki model. WidgetShell başlığı ortak kontrolleri
  // (ayarlar ⚙ / tür değiştir / rapora ekle) bundan üretir. Legacy sabit widget'larda yok.
  instance?: WidgetInstance;
}
