// components/IntroJourney.tsx
// Anasayfada gösterilen animasyonlu "yolculuk": Veri → (AI) → Pano → Rapor.
// Saf CSS animasyonları (styles.css içindeki .dlj-* / @keyframes), ek bağımlılık yok.
// compact=true: başlıksız, saydam, upload kartının İÇİNE gömülebilen ince şerit
// (yükleme alanıyla aynı kutuda dursun, dikey yer israf etmesin).

import { Database, FileText, Sparkles } from 'lucide-react'

const Node = ({ icon, title, sub, delay, accent }: { icon: React.ReactNode; title: string; sub: string; delay: number; accent?: boolean }) => (
  <div className="dlj-node" style={{ animationDelay: `${delay}ms`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: '84px', textAlign: 'center' }}>
    <div className="dlj-icon" style={{
      width: '52px', height: '52px', borderRadius: '14px', display: 'grid', placeItems: 'center',
      background: accent ? 'var(--color-primary)' : 'var(--bg-tertiary)',
      color: accent ? 'var(--color-primary-dark)' : 'var(--color-primary)',
      border: '1px solid var(--border-color)', boxShadow: accent ? '0 8px 24px rgba(0,0,0,0.18)' : 'none',
    }}>{icon}</div>
    <div>
      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ fontSize: '10px', color: 'var(--text-muted)', maxWidth: '120px' }}>{sub}</div>
    </div>
  </div>
)

const Connector = ({ delay }: { delay: number }) => (
  <div className="dlj-connector"><span className="dlj-travel" style={{ animationDelay: `${delay}ms` }} /></div>
)

const MiniDashboard = () => (
  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '24px' }}>
    {[0.5, 0.9, 0.65, 1].map((h, i) => (
      <span key={i} className="dlj-bar" style={{ animationDelay: `${700 + i * 120}ms`, width: '5px', height: `${h * 24}px`, borderRadius: '2px', background: 'var(--color-primary-dark)' }} />
    ))}
  </div>
)

export function IntroJourney({ t, compact = false }: { t: (key: string, options?: any) => string; compact?: boolean }) {
  const flow = (
    <div className="dlj-flow" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
      <Node delay={80} icon={<Database size={24} />} title={t('intro.data', { defaultValue: 'Veri' })} sub={t('intro.dataSub', { defaultValue: 'CSV / Excel / Parquet' })} />
      <Connector delay={0} />
      <Node delay={260} accent icon={<MiniDashboard />} title={t('intro.dashboard', { defaultValue: 'Pano' })} sub={t('intro.dashboardSub', { defaultValue: 'AI ile widget & çapraz filtre' })} />
      <Connector delay={1200} />
      <Node delay={440} icon={<FileText size={24} />} title={t('intro.report', { defaultValue: 'Rapor' })} sub={t('intro.reportSub', { defaultValue: 'Anlatı + kart, temiz PDF' })} />
    </div>
  )

  if (compact) {
    return (
      <div className="dlj-hero" style={{ width: '100%', maxWidth: '520px', margin: '0 auto 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}>
          <Sparkles size={14} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontSize: '10.5px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-primary)', textAlign: 'center' }}>
            {t('intro.eyebrow', { defaultValue: 'Veriden içgörüye — tarayıcıda, saniyeler içinde' })}
          </span>
        </div>
        {flow}
      </div>
    )
  }

  return (
    <div className="dlj-hero card" style={{
      padding: '22px 20px', borderRadius: '16px', border: '1px solid var(--border-color)',
      background: 'linear-gradient(135deg, var(--bg-card), var(--bg-secondary))', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Sparkles size={16} style={{ color: 'var(--color-primary)' }} />
        <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
          {t('intro.eyebrow', { defaultValue: 'Veriden içgörüye — tarayıcıda, saniyeler içinde' })}
        </span>
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 4px', color: 'var(--text-primary)' }}>
        {t('intro.title', { defaultValue: 'Dosyanı bırak. Sor. Panoya ve rapora dönüşsün.' })}
      </h2>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 18px', lineHeight: 1.5, maxWidth: '640px' }}>
        {t('intro.subtitle', { defaultValue: 'Verini yükle; yapay zekâ onu filtrelenebilir bir panoya çevirsin, oradan da paylaşılabilir bir rapora. Hepsi yerelde — verin tarayıcından çıkmaz.' })}
      </p>
      {flow}
    </div>
  )
}

export default IntroJourney
