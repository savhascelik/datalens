// ai/attachmentBus.ts
// Widget/pano ekran görüntülerini AI sohbetine iletmek için küçük yayıncı-abone kanalı.
// Widget kabuğundaki "AI'ya sor" butonu yakaladığı görseli buraya yayınlar; App bunu
// dinleyip sohbeti açar ve görseli AiChat'e bekleyen ek (pending attachment) olarak verir.
// appBridge ile aynı singleton desen; React ağacından bağımsız gevşek bağ kurar.

export interface ChatAttachment {
  dataUrl: string      // base64 PNG (data:image/png;base64,...)
  label?: string       // kaynak etiketi (widget başlığı / "Tüm pano")
}

type Listener = (a: ChatAttachment) => void
const listeners = new Set<Listener>()

// Bir dinleyici kaydet; abonelikten çıkmak için dönen fonksiyonu çağır.
export function onChatAttachment(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

// Bir ekran görüntüsünü sohbete iletir.
export function publishChatAttachment(dataUrl: string, label?: string): void {
  listeners.forEach(l => l({ dataUrl, label }))
}
