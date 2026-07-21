import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Eye, EyeOff, LoaderCircle, Play, AlertCircle } from 'lucide-react'
import { getAiSettings, saveAiSettings, fetchAvailableModels, providerDefaults, type AiProvider } from '../ai-client'
import { getAiRuntimeSettings, saveAiRuntimeSettings } from '../ai/settings'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { t } = useTranslation()
  const current = getAiSettings()

  const [tempProvider, setTempProvider] = useState<AiProvider>(current.provider)
  const [tempApiKey, setTempApiKey] = useState(current.apiKey)
  const [tempBaseUrl, setTempBaseUrl] = useState(current.baseUrl)
  const [tempModel, setTempModel] = useState(current.model)
  const [tempProject, setTempProject] = useState(current.project || '')
  const [tempLocation, setTempLocation] = useState(current.location || 'us-central1')
  const [showApiKey, setShowApiKey] = useState(false)

  // AI agent çalışma-zamanı ayarları (goal loop sınırları)
  const runtime = getAiRuntimeSettings()
  const [maxRounds, setMaxRounds] = useState(runtime.maxRounds)
  const [maxCodeCalls, setMaxCodeCalls] = useState(runtime.maxCodeCalls)
  const [timeoutMs, setTimeoutMs] = useState(runtime.timeoutMs)

  // Dynamic AI Model Fetching States
  const [fetchedModels, setFetchedModels] = useState<string[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [modelsFetchStatus, setModelsFetchStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  // Sağlayıcı bir anahtar/token gerektiriyor mu (model çekme + kayıt için).
  const needsKey = tempProvider === 'openai' || tempProvider === 'gemini' || tempProvider === 'vertex'

  // Sağlayıcı değişince taban URL'i o sağlayıcının varsayılanına ayarla (kullanıcı görebilsin/
  // değiştirebilsin). Vertex proje/bölgeden türediği için boş kalır.
  const onProviderChange = (p: AiProvider) => {
    setTempProvider(p)
    setTempModel('')
    setFetchedModels([])
    setModelsFetchStatus(null)
    setTempBaseUrl(providerDefaults(p).baseUrl)
  }

  if (!isOpen) return null

  const handleFetchModels = async () => {
    setIsFetchingModels(true)
    setModelsFetchStatus(null)
    const fetchFailMsg = tempProvider === 'ollama'
      ? t('ollamaCorsFetchHint', { defaultValue: "Ollama'ya erişilemedi. Bu barındırılan (https) sitede yerel Ollama için Ollama tarafında OLLAMA_ORIGINS'i bu adrese (veya *) ayarlayıp yeniden başlatın; ya da bir bulut sağlayıcı seçin." })
      : t('modelsFetchFailed')
    try {
      const models = await fetchAvailableModels(tempProvider, tempBaseUrl, tempApiKey)
      setFetchedModels(models)
      if (models.length > 0) {
        if (!tempModel || !models.includes(tempModel)) {
          setTempModel(models[0])
        }
        setModelsFetchStatus({ type: 'success', message: t('modelsFetchedSuccess') })
      } else {
        setModelsFetchStatus({ type: 'error', message: fetchFailMsg })
      }
    } catch (err) {
      console.error(err)
      setModelsFetchStatus({ type: 'error', message: fetchFailMsg })
    } finally {
      setIsFetchingModels(false)
    }
  }

  const handleSaveSettings = () => {
    saveAiSettings({
      provider: tempProvider,
      apiKey: tempApiKey,
      baseUrl: tempBaseUrl,
      model: tempModel,
      project: tempProject,
      location: tempLocation,
    })
    saveAiRuntimeSettings({ maxRounds, maxCodeCalls, timeoutMs })
    onClose()
  }

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      padding: '24px'
    }}>
      <div className="card settings-modal" style={{
        maxWidth: '480px',
        width: '100%',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="card-title" style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Settings size={20} /> {t('settingsTitle')}
          </div>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{t('settingsSubtitle')}</p>
        
        {/* Provider Selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('provider')}</label>
          <select 
            value={tempProvider} 
            onChange={(e) => onProviderChange(e.target.value as AiProvider)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }}
          >
            <option value="openai">{t('providerOpenAi', { defaultValue: 'OpenAI' })}</option>
            <option value="gemini">{t('providerGemini', { defaultValue: 'Google AI Studio (Gemini)' })}</option>
            <option value="vertex">{t('providerVertex', { defaultValue: 'Google Vertex AI' })}</option>
            <option value="ollama">{t('providerOllama', { defaultValue: 'Ollama (yerel)' })}</option>
          </select>
        </div>

        {/* Ollama: barındırılan (https) sitede yerel erişim uyarısı */}
        {tempProvider === 'ollama' && (
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: '5px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '8px 10px' }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px', color: '#f59e0b' }} />
            <span>{t('ollamaLocalNote', { defaultValue: 'Yerel Ollama yalnızca uygulamayı da yerelde çalıştırdığınızda sorunsuz çalışır. Barındırılan (https) bir siteden erişmek için Ollama\'da OLLAMA_ORIGINS değerini bu siteye (veya *) ayarlayıp Ollama\'yı yeniden başlatın — aksi halde tarayıcı CORS nedeniyle engeller. Kolay yol: OpenAI/Gemini gibi bir bulut sağlayıcı seçin.' })}</span>
          </p>
        )}

        {/* Vertex: proje + bölge */}
        {tempProvider === 'vertex' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('vertexProject', { defaultValue: 'GCP Proje Kimliği' })}</label>
              <input type="text" value={tempProject} onChange={(e) => setTempProject(e.target.value)} placeholder="my-gcp-project"
                style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('vertexLocation', { defaultValue: 'Bölge' })}</label>
              <input type="text" value={tempLocation} onChange={(e) => setTempLocation(e.target.value)} placeholder="us-central1"
                style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }} />
            </div>
          </div>
        )}

        {/* API Key / Access Token (OpenAI, Gemini, Vertex) */}
        {needsKey && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {tempProvider === 'vertex'
                ? t('accessTokenLabel', { defaultValue: 'OAuth Access Token' })
                : t('apiKeyLabel', { defaultValue: 'API Anahtarı' })}
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input 
                type={showApiKey ? 'text' : 'password'}
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                placeholder={tempProvider === 'vertex'
                  ? t('accessTokenPlaceholder', { defaultValue: 'gcloud auth print-access-token çıktısı' })
                  : t('apiKeyPlaceholder', { defaultValue: 'sk-... / AIza...' })}
                style={{ width: '100%', padding: '10px 40px 10px 12px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0, fontFamily: 'monospace' }}
              />
              <button 
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                style={{ position: 'absolute', right: '12px', background: 'transparent', border: 0, padding: 0, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.45, display: 'flex', alignItems: 'flex-start', gap: '5px' }}>
              <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
              {tempProvider === 'vertex'
                ? t('vertexTokenWarning', { defaultValue: 'Vertex access token kısa ömürlüdür (~1 saat). Süresi dolunca yenileyin. Yerel tarayıcıda saklanır.' })
                : t('apiKeyLocalWarning', { defaultValue: 'Anahtarınız yalnızca bu tarayıcıda (localStorage) saklanır; hiçbir sunucuya gönderilmez. Ortak/paylaşılan cihazlarda dikkatli olun.' })}
            </p>
          </div>
        )}

        {/* Base URL Override */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('baseUrlLabel')}</label>
          <input 
            type="text"
            value={tempBaseUrl}
            onChange={(e) => setTempBaseUrl(e.target.value)}
            placeholder={t('baseUrlPlaceholder')}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }}
          />
        </div>

        {/* Model Selector & Dynamic Fetching */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('modelLabel')}</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {fetchedModels.length > 0 ? (
              <select 
                value={tempModel} 
                onChange={(e) => setTempModel(e.target.value)}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }}
              >
                {fetchedModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input 
                type="text"
                value={tempModel}
                onChange={(e) => setTempModel(e.target.value)}
                placeholder={t('modelPlaceholder')}
                style={{ flex: 1, padding: '10px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }}
              />
            )}
            <button
              type="button"
              onClick={handleFetchModels}
              disabled={isFetchingModels || (needsKey && !tempApiKey)}
              style={{
                padding: '10px 14px',
                background: 'var(--border-strong)',
                color: 'var(--color-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                margin: 0,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'opacity 0.2s',
                opacity: (needsKey && !tempApiKey) ? 0.5 : 1
              }}
            >
              {isFetchingModels ? <LoaderCircle className="spin" size={12} /> : <Play size={12} />}
              {t('fetchModels')}
            </button>
          </div>
          
          {fetchedModels.length > 0 && (
            <button 
              type="button" 
              onClick={() => { setFetchedModels([]); setTempModel(''); }}
              style={{ background: 'transparent', border: 0, padding: 0, color: 'var(--text-muted)', fontSize: '10px', textAlign: 'left', cursor: 'pointer', textDecoration: 'underline', marginTop: '2px' }}
            >
              {t('manualModelEntry')}
            </button>
          )}

          {modelsFetchStatus && (
            <p style={{
              fontSize: '11px',
              margin: '4px 0 0',
              color: modelsFetchStatus.type === 'success' ? 'var(--color-primary)' : '#ff7b82',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <AlertCircle size={12} />
              {modelsFetchStatus.message}
            </p>
          )}
        </div>

        {/* AI Agent çalışma sınırları */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 700 }}>{t('ai.runtimeTitle', { defaultValue: 'AI Asistan Sınırları' })}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('ai.maxRounds', { defaultValue: 'Maks. Tur' })}</label>
              <input type="number" min={1} max={30} value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}
                style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('ai.maxCodeCalls', { defaultValue: 'Maks. Kod' })}</label>
              <input type="number" min={0} max={20} value={maxCodeCalls} onChange={(e) => setMaxCodeCalls(Number(e.target.value))}
                style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>{t('ai.timeout', { defaultValue: 'Zaman aşımı (ms)' })}</label>
              <input type="number" min={1000} max={30000} step={500} value={timeoutMs} onChange={(e) => setTimeoutMs(Number(e.target.value))}
                style={{ padding: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '8px', fontSize: '13px', outline: 0 }} />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
          <button 
            className="secondary" 
            onClick={onClose}
            style={{ padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'transparent', color: 'var(--text-secondary)', margin: 0, cursor: 'pointer' }}
          >
            {t('close')}
          </button>
          <button 
            onClick={handleSaveSettings}
            style={{ padding: '10px 16px', borderRadius: '8px', border: 0, background: 'var(--color-primary)', color: 'var(--color-primary-dark)', fontWeight: 'bold', margin: 0, cursor: 'pointer' }}
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
