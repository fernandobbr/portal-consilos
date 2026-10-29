// A versão é trocada a cada build pelo plugin `versaoDoServiceWorker` do
// vite.config.js. ISSO É O QUE FAZ O CACHE SER LIMPO: o `activate` abaixo apaga
// todo cache cujo nome não seja o atual, e enquanto este nome era fixo em
// `consilos-portal-v1` ele nunca apagava nada — o cache acumulava desde a
// primeira visita, e uma publicação nova podia ser servida com arquivos velhos.
const CACHE_NAME = 'consilos-portal-__VERSAO_DO_BUILD__'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  // Telas EM TESTE ficam fora do cache (22/10/2026): o MATRIX é servido direto do código e relê os dados do AO VIVO a cada
  // poucos segundos com um ?t= novo; guardar aqui serviria tela velha e encheria o cache com cada leitura.
  // O mesmo vale para o código que o Vite compila em desenvolvimento (/src, /@vite, /node_modules).
  if (/^\/(em-teste|src|@vite|@react-refresh|@id|@fs|node_modules)\//.test(url.pathname)) return

  // A planilha de demanda é REESCRITA fora do ciclo de build, então cache-first
  // a serviria velha até a próxima publicação -- e o `cache: 'no-store'` da
  // página não ajuda, porque ele controla o cache HTTP, não este handler.
  // Rede primeiro, cache só como reserva offline.
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request)),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()))
      return response
    })),
  )
})
