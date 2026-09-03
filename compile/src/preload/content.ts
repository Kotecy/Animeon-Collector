// Детектор аномалий + автоподписка — встроенная функция приложения
// Кастомные тосты ачивок вырезаны: сайт сам показывает получение
//
// Важно: этот файл инжектится в контекст СТРАНИЦЫ через executeJavaScript,
// где require('electron') недоступен. Всё общение с main идёт через
// window.__animeon, который expose'ит настоящий preload (hidden.js).
(function () {
  if ((window as any).__acInjected) return
  ;(window as any).__acInjected = true
  // Embedded AnimeOn must not be able to close the host tab.
  if (location.hostname.includes('animeon')) {
    try { window.close = (() => {}) as any } catch {}
  }

  function host(): any {
    return (window as any).__animeon || null
  }
  async function storeGet(key: string): Promise<any> {
    try { return await host()?.storeGet(key) } catch { return undefined }
  }
  async function storeSet(key: string, val: any): Promise<void> {
    try { await host()?.storeSet(key, val) } catch {}
  }

  const isAnimeon = location.hostname.includes('animeon')

  /* ═══════════════ Детектор аномалий (только наблюдает) ═══════════════ */
  // Легальный помощник: НИКОГДА не кликает по странице. Видит кнопку
  // аномалии в DOM или eligible-состояние сервера — зовёт приложение
  // (звук + тост + журнал). Собирает пользователь вручную.
  const ANOMALY_SELECTOR = 'button.anomaly-orb-root,button[aria-label="Аномалия — собрать награду"]'
  const ANOMALY_STATE_URL = '/api/event/boar/anomaly/state'
  const DETECT_SCAN_MS = 500
  const DETECT_GONE_MS = 4000
  const DETECT_STATE_READY_MS = 4000
  const DETECT_STATE_WAIT_MS = 12000
  const DETECT_STATE_IDLE_MS = 60000
  const DETECT_STATE_ERROR_MS = 15000
  const DETECT_WATCH_CACHE_MS = 5000
  let detPresent = false
  let detMissingSince = 0
  let detAlerted = false
  let detServerEligible = false
  let detWatchCache = { value: false, at: 0 }
  async function isWatching(): Promise<boolean> {
    const now = Date.now()
    if (now - detWatchCache.at < DETECT_WATCH_CACHE_MS) return detWatchCache.value
    try {
      const d = await storeGet('detector')
      detWatchCache = { value: !!(d && d.watching), at: now }
    } catch {}
    return detWatchCache.value
  }
  function highlightAnomaly(btn: Element | null) {
    try {
      document.querySelectorAll('[data-anomaly-hl]').forEach((n) => { if (n !== btn) (n as HTMLElement).removeAttribute('data-anomaly-hl') })
      if (btn) (btn as HTMLElement).setAttribute('data-anomaly-hl', '1')
    } catch {}
  }
  try {
    const st = document.createElement('style')
    st.setAttribute('data-anomaly-style', '1')
    st.textContent = '[data-anomaly-hl]{outline:2px solid #34d399 !important;outline-offset:3px;border-radius:12px;}'
    document.documentElement.appendChild(st)
  } catch {}
  async function notifyAnomaly(source: string) {
    try {
      const h = host() as any
      if (h && typeof h.anomalyDetected === 'function') {
        await h.anomalyDetected({ source, at: Date.now(), url: location.href })
      }
    } catch {}
  }
  async function handleAnomalySeen(btn: Element | null, source: string) {
    detMissingSince = 0
    highlightAnomaly(btn)
    if (!detPresent) {
      detPresent = true
      if (!detAlerted && (await isWatching())) {
        detAlerted = true
        await notifyAnomaly(source)
      }
    }
  }
  function handleAnomalyGone() {
    if (!detPresent) return
    const now = Date.now()
    if (!detMissingSince) { detMissingSince = now; return }
    if (now - detMissingSince < DETECT_GONE_MS) return
    detPresent = false
    detAlerted = false
    detMissingSince = 0
    highlightAnomaly(null)
  }
  async function scanAnomalyDom() {
    try {
      if (!(await isWatching())) {
        if (detPresent) { detPresent = false; detAlerted = false; detMissingSince = 0; highlightAnomaly(null) }
        return
      }
      const btn = document.querySelector(ANOMALY_SELECTOR)
      if (btn) { await handleAnomalySeen(btn, 'dom'); return }
      handleAnomalyGone()
    } catch {}
  }
  function scheduleStatePoll(ms: number) {
    setTimeout(() => { void pollAnomalyState() }, ms)
  }
  async function pollAnomalyState(): Promise<void> {
    try {
      if (!(await isWatching())) { scheduleStatePoll(DETECT_STATE_IDLE_MS); return }
      let delay = DETECT_STATE_WAIT_MS
      try {
        const r = await fetchWithTimeout(ANOMALY_STATE_URL, { credentials: 'include' }, DETECT_STATE_ERROR_MS)
        if (r.ok) {
          const j: any = await r.json().catch(() => null)
          const eligible = !!(j && j.eligible === true)
          if (eligible && !detServerEligible) {
            await handleAnomalySeen(document.querySelector(ANOMALY_SELECTOR), 'server')
          }
          detServerEligible = eligible
          delay = eligible ? DETECT_STATE_READY_MS : DETECT_STATE_WAIT_MS
        }
      } catch { delay = DETECT_STATE_ERROR_MS }
      scheduleStatePoll(delay)
    } catch { scheduleStatePoll(DETECT_STATE_ERROR_MS) }
  }
  const detObserver = new MutationObserver(() => { void scanAnomalyDom() })
  detObserver.observe(document.documentElement, { childList: true, subtree: true })
  setInterval(() => { void scanAnomalyDom() }, DETECT_SCAN_MS)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void scanAnomalyDom() })
  else void scanAnomalyDom()
  scheduleStatePoll(2000)
  if (!isAnimeon) return

  /* ═══════════════ Меню профиля: скролл в низком окне ═══════════════ */
  // Панель меню ищем по текстам («Мой профиль» + «Выйти»), без привязки к
  // классам сайта. Ограничиваем высоту и даём внутренний скролл, иначе пункты
  // внизу (включая «Выйти») недостижимы в невысоком окне.
  const MENU_FIX_MS = 2000
  let lastMenuFix = 0
  function fixProfileMenu() {
    const now = Date.now()
    if (now - lastMenuFix < MENU_FIX_MS) return
    lastMenuFix = now
    try {
      const divs = document.getElementsByTagName('div')
      let best: HTMLElement | null = null
      let bestLen = Infinity
      for (let i = 0; i < divs.length; i++) {
        const t = (divs[i] as HTMLElement).textContent || ''
        if (t.length < 20 || t.length > 3000) continue
        if (t.indexOf('Мой профиль') === -1 || t.indexOf('Выйти') === -1) continue
        if (t.length < bestLen) { best = divs[i] as HTMLElement; bestLen = t.length }
      }
      if (best && !(best as any).__menuFixed) {
        (best as any).__menuFixed = true
        best.style.setProperty('max-height', 'calc(100vh - 110px)', 'important')
        best.style.setProperty('overflow-y', 'auto', 'important')
      }
    } catch {}
  }
  setInterval(fixProfileMenu, MENU_FIX_MS)

  /* ═══════════════ Автоподписка (взаимная подписка) ═══════════════ */
  // Порт логики расширения. Отличия от расширения:
  // - хранилище — electron-store через window.__animeon (main), а не chrome.storage;
  // - нет привязки к "вкладке 2": лидер выбирается через блокировку в store,
  //   чтобы цикл не гонялся параллельно во всех вкладках;
  // - ownSlug кэшируется только в памяти: store общий для всех профилей,
  //   а done/failure-бакеты ключуются по slug владельца (своему нику).
  const FOLLOWBACK_CHECK_MS = 180000
  const FOLLOWBACK_PAGE_SIZE = 50
  const FOLLOWBACK_MAX_PAGES = 5
  const FOLLOWBACK_RETRY_COOLDOWN_MS = 10 * 60 * 1000
  const FOLLOWBACK_MAX_PER_RUN = 5
  // Короткий TTL: каждая перезагрузка/навигация рождает новый INSTANCE_ID,
  // а метка в общем store остаётся за мёртвым инстансом. С длинным TTL новый
  // контекст до 6 минут получал отказ в лидерстве — проверки вставали.
  // 45с достаточно против параллельных прогонов (интервал 3 мин).
  const FOLLOWBACK_CLAIM_TTL_MS = 45000
  const FETCH_TIMEOUT_MS = 20000
  async function fetchWithTimeout(url: string, init?: RequestInit, ms = FETCH_TIMEOUT_MS): Promise<Response> {
    const ctrl = new AbortController()
    const t = setTimeout(() => { try { ctrl.abort() } catch {} }, ms)
    try {
      return await fetch(url, { ...(init || {}), signal: ctrl.signal })
    } finally { clearTimeout(t) }
  }
  const FOLLOWBACK_FIRST_DELAY_MS = 15000
  const FOLLOWING_CACHE_MS = 300000
  const FB_LOG = '[AnimeonDesktop follow-back]'
  const INSTANCE_ID = Math.random().toString(36).slice(2) + Date.now().toString(36)

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  function detectOwnUsernameFromDom(): string | null {
    const candidates = Array.from(document.querySelectorAll('a'))
    for (const el of candidates) {
      const href = el.getAttribute('href') || ''
      const match = href.match(/^\/user\/([^/?#]+)$/i)
      if (!match) continue
      const text = (el.textContent || '').trim().toLowerCase()
      if (text.includes('как видят другие') || text.includes('мой профиль')) {
        return decodeURIComponent(match[1])
      }
    }
    return null
  }

  let ownSlugWatcherStarted = false
  let ownSlugMemory: string | null = null
  let lastSlugScan = 0
  function startOwnSlugWatcher() {
    if (ownSlugWatcherStarted) return
    ownSlugWatcherStarted = true
    const obs = new MutationObserver(() => {
      // Страница может мутировать постоянно (анимации, плеер, чат) —
      // сканируем ссылки не чаще раза в 2 секунды.
      const now = Date.now()
      if (now - lastSlugScan < 2000) return
      lastSlugScan = now
      const slug = detectOwnUsernameFromDom()
      if (!slug) return
      obs.disconnect()
      ownSlugMemory = slug
      console.log(FB_LOG, 'detected own slug via DOM watcher:', slug)
      checkFollowBacks(true)
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
  }

  async function resolveOwnApiSegment(): Promise<string | null> {
    if (ownSlugMemory) return ownSlugMemory
    try {
      const me = await fetchWithTimeout('/api/users/me', { credentials: 'include' })
      if (me.ok) {
        const j = await me.json().catch(() => null)
        const slug = j && (j.username_slug || j.slug || j.username)
        if (slug && slug !== 'me') {
          ownSlugMemory = String(slug)
          console.log(FB_LOG, 'resolved own slug via /api/users/me:', ownSlugMemory)
          return ownSlugMemory
        }
      }
    } catch {}
    try {
      const keyRe = /user|auth|session|account|profile|persist|pinia/i
      const slugRe = /"username_slug"\s*:\s*"([^"]+)"/
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k || !keyRe.test(k)) continue
        const raw = localStorage.getItem(k)
        if (!raw) continue
        const m = raw.match(slugRe)
        if (m && m[1] && m[1] !== 'me') {
          ownSlugMemory = m[1]
          console.log(FB_LOG, 'resolved own slug from localStorage key "' + k + '":', m[1])
          return ownSlugMemory
        }
      }
    } catch {}
    try {
      const slugRe = /"username_slug"\s*:\s*"([^"]+)"/
      for (const s of Array.from(document.querySelectorAll('script'))) {
        const text = s.textContent || ''
        if (text.indexOf('username_slug') === -1) continue
        const m = text.match(slugRe)
        if (m && m[1] && m[1] !== 'me') {
          ownSlugMemory = m[1]
          console.log(FB_LOG, 'resolved own slug from page hydration state:', m[1])
          return ownSlugMemory
        }
      }
    } catch {}
    try {
      const test = await fetchWithTimeout('/api/users/me/followers?page=1&per_page=1', { credentials: 'include' })
      if (test.ok) {
        ownSlugMemory = 'me'
        console.log(FB_LOG, 'using /me shortcut')
        return 'me'
      }
    } catch {}
    try {
      const profileResp = await fetchWithTimeout('/profile', { credentials: 'include' })
      if (profileResp.ok) {
        const html = await profileResp.text()
        const match = html.match(/href="\/user\/([^"?#]+)"/i)
        if (match) {
          ownSlugMemory = decodeURIComponent(match[1])
          console.log(FB_LOG, 'resolved own slug from /profile page HTML:', ownSlugMemory)
          return ownSlugMemory
        }
      } else {
        console.log(FB_LOG, '/profile fetch returned', profileResp.status)
      }
    } catch (e) {
      console.log(FB_LOG, '/profile fetch failed', e)
    }
    const detected = detectOwnUsernameFromDom()
    if (detected) {
      ownSlugMemory = detected
      console.log(FB_LOG, 'detected own slug from link on current page:', detected)
      return detected
    }
    startOwnSlugWatcher()
    console.log(FB_LOG, 'could not resolve own account yet — watching DOM in background for the self-profile link')
    return null
  }

  let followingCache: { slugs: string[] | null, caseMap: Record<string, string>, total: number, at: number } = { slugs: null, caseMap: {}, total: Infinity, at: 0 }
  async function fetchFollowingData(ownSegment: string): Promise<{ slugs: string[], caseMap: Map<string, string>, total: number, complete: boolean } | null> {
    if (followingCache.slugs && Date.now() - followingCache.at < FOLLOWING_CACHE_MS) {
      return { slugs: followingCache.slugs, caseMap: new Map(Object.entries(followingCache.caseMap)), total: followingCache.total, complete: followingCache.total <= FOLLOWBACK_MAX_PAGES * FOLLOWBACK_PAGE_SIZE }
    }
    const slugs: string[] = []
    const caseMap = new Map<string, string>()
    let total = Infinity
    for (let page = 1; page <= FOLLOWBACK_MAX_PAGES && (page - 1) * FOLLOWBACK_PAGE_SIZE < total; page++) {
      let resp: Response
      try {
          resp = await fetchWithTimeout(
            `/api/users/${encodeURIComponent(ownSegment)}/following?page=${page}&per_page=${FOLLOWBACK_PAGE_SIZE}`,
            { credentials: 'include' }
          )
      } catch { return null }
      if (!resp.ok) return null
      const data = await resp.json().catch(() => null)
      if (!data) return null
      total = typeof data.total === 'number' ? data.total : 0
      const users = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : [])
      for (const u of users) {
        const orig = u.username_slug || u.slug || u.username
        if (orig) {
          const s = String(orig).toLowerCase()
          slugs.push(s)
          if (!caseMap.has(s)) caseMap.set(s, String(orig))
        }
      }
      if (users.length < FOLLOWBACK_PAGE_SIZE) break
    }
    followingCache = { slugs, caseMap: Object.fromEntries(caseMap), total, at: Date.now() }
    return { slugs, caseMap, total, complete: total <= FOLLOWBACK_MAX_PAGES * FOLLOWBACK_PAGE_SIZE }
  }

  function escapeHtml(str: string) {
    const d = document.createElement('div')
    d.textContent = str
    return d.innerHTML
  }

  // Очередь тостов подписки: показываем строго по одному (6с каждый),
  // а не стеком. Клик/свайп — пропуск к следующему.
  const followQueue: string[] = []
  let followPumping = false
  function showSingleFollowToast(name: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const el = document.createElement('div')
        el.setAttribute('data-animeon-toast', '1')
        el.setAttribute('style', 'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:320px;background:#141521;border:1px solid rgba(139,92,246,.45);border-left:3px solid #8b5cf6;border-radius:12px;padding:12px 14px;color:#fff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);display:flex;gap:10px;align-items:center;cursor:pointer')
        el.innerHTML = '<span style="flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.35)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="8" r="3.5"/><path d="M4 20c.7-3.2 3-5 6-5s5.3 1.8 6 5"/><path d="M18.5 8v6M15.5 11h6"/></svg></span><span style="min-width:0;flex:1"><span style="display:block;font-weight:600">' + escapeHtml(name) + '</span><span style="display:block;margin-top:2px;color:#d4d4d8">Подписался в ответ</span><span style="display:block;margin-top:4px;font-size:10px;color:#71717a">Animeon Desktop</span></span>'
        let done = false
        const finish = () => { if (done) return; done = true; try { el.remove() } catch {} ; resolve() }
        el.addEventListener('click', finish)
        let startY = 0
        el.addEventListener('touchstart', (e) => { try { startY = e.touches[0].clientY } catch {} })
        el.addEventListener('touchend', (e) => { try { if (e.changedTouches[0].clientY - startY > 40) finish() } catch {} })
        document.documentElement.appendChild(el)
        setTimeout(finish, 6000)
      } catch { resolve() }
    })
  }
  async function pumpFollowQueue() {
    if (followPumping) return
    followPumping = true
    try {
      while (followQueue.length) {
        const name = followQueue.shift() as string
        await showSingleFollowToast(name)
      }
    } finally { followPumping = false }
  }
  function enqueueFollow(names: string[]) {
    for (const n of names) { if (n) followQueue.push(String(n)) }
    if (followQueue.length > 10) followQueue.splice(0, followQueue.length - 10)
    void pumpFollowQueue()
  }
  // Пилюля лимита — прямоугольная со скруглением (rounded-xl стиль, НЕ овал),
  // рисуется ВНУТРИ страницы поверх сайта: углы ничего не режет.
  let limitPillTimer: any = null
  function showLimitPill(ms = 2500) {
    try {
      // Синглтон: пока пилюля висит — новые вызовы (спам 6-й вкладки)
      // игнорируются, очередь не копится.
      if (document.querySelector('[data-animeon-limit]')) return
      if (limitPillTimer) { clearTimeout(limitPillTimer); limitPillTimer = null }
      const el = document.createElement('div')
      el.setAttribute('data-animeon-limit', '1')
      el.setAttribute('style', 'position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:8px;background:rgba(15,16,26,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(139,92,246,.35);border-radius:10px;padding:8px 14px;color:#e4e4e7;font:500 12.5px/1.4 system-ui,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.45);white-space:nowrap;cursor:default')
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M7 20h7M17 8h4a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-4"/></svg><span>Достигнут лимит вкладок</span>'
      el.addEventListener('click', () => { try { el.remove() } catch {} ; if (limitPillTimer) { clearTimeout(limitPillTimer); limitPillTimer = null } })
      document.documentElement.appendChild(el)
      limitPillTimer = setTimeout(() => { try { el.remove() } catch {} ; limitPillTimer = null }, ms)
    } catch {}
  }
  // Тост детектора: emerald-карточка слева внизу (свой визуал, не копия
  // подписки). Синглтон: новый вызов заменяет висящий.
  // Если тост уже висит, а страница уходит в фулскрин — пересаживаем его
  // внутрь fullscreen-элемента, иначе он пропадёт вместе с остальной страницей.
  let anomalyFsHooked = false
  function hookAnomalyFullscreen() {
    if (anomalyFsHooked) return
    anomalyFsHooked = true
    try {
      document.addEventListener('fullscreenchange', () => {
        try {
          const mount = (document as any).fullscreenElement || document.documentElement
          document.querySelectorAll('[data-animeon-anomaly]').forEach((n) => { try { mount.appendChild(n) } catch {} })
        } catch {}
      })
    } catch {}
  }
  let anomalyToastTimer: any = null
  function showAnomalyToast() {
    try {
      document.querySelectorAll('[data-animeon-anomaly]').forEach((n) => { try { (n as HTMLElement).remove() } catch {} })
      if (anomalyToastTimer) { clearTimeout(anomalyToastTimer); anomalyToastTimer = null }
      const el = document.createElement('div')
      el.setAttribute('data-animeon-anomaly', '1')
      el.setAttribute('style', 'position:fixed;left:16px;bottom:16px;z-index:2147483647;width:320px;background:#101814;border:1px solid rgba(52,211,153,.55);border-radius:12px;padding:12px 14px;color:#fff;font:13px/1.45 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);display:flex;gap:10px;align-items:center;cursor:pointer;text-shadow:0 1px 2px rgba(0,0,0,.8)')
      el.innerHTML = '<span style="flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:10px;background:rgba(52,211,153,.16);border:1px solid rgba(52,211,153,.45)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a7f3d0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 12 18.3 5.7"/><circle cx="12" cy="12" r="1.4" fill="#a7f3d0" stroke="none"/></svg></span><span style="min-width:0;flex:1"><span style="display:block;font-weight:700;color:#fff">Нашли аномалию!</span><span style="display:block;margin-top:2px;color:#e4e4e7">Загляни на вкладку и забери награду</span><span style="display:block;margin-top:4px;font-size:10px;color:#a1a1aa">Animeon Desktop</span></span>'
      const finish = () => { try { el.remove() } catch {} ; if (anomalyToastTimer) { clearTimeout(anomalyToastTimer); anomalyToastTimer = null } }
      el.addEventListener('click', finish)
      let startY = 0
      el.addEventListener('touchstart', (e) => { try { startY = e.touches[0].clientY } catch {} })
      el.addEventListener('touchend', (e) => { try { if (e.changedTouches[0].clientY - startY > 40) finish() } catch {} })
      // В полноэкранном видео (плеер) элементы вне fullscreen-элемента
      // скрыты — вешаем тост внутрь него, тогда видно и поверх фильма.
      hookAnomalyFullscreen()
      const mount = (document as any).fullscreenElement || document.documentElement
      mount.appendChild(el)
      anomalyToastTimer = setTimeout(finish, 6000)
    } catch {}
  }
  // API для main-процесса: тосты рисуются в АКТИВНОЙ вкладке, а не в лидере.
  try { (window as any).__animeonToast = { limit: showLimitPill, follow: enqueueFollow, anomaly: showAnomalyToast } } catch {}

  // Основной канал уведомления — тост уровня приложения (виден всегда,
  // независимо от активной вкладки). Внутристраничный тост — только
  // fallback, если bridge недоступен.
  async function notifyFollowed(followedNames: string[]) {
    let delivered = false
    try {
      const h = host() as any
      if (h && typeof h.followbackNotify === 'function') {
        await h.followbackNotify(followedNames.slice(0, 5))
        delivered = true
      }
    } catch {}
    if (!delivered) {
      // Bridge недоступен — показываем локально по одному из очереди.
      enqueueFollow(followedNames)
    }
  }

  // Диагностика в файл (консоль вкладки пользователю не видна).
  function diag(msg: string) {
    try { console.log(FB_LOG, msg) } catch {}
    try { (host() as any)?.followbackDiag?.(FB_LOG + ' ' + msg) } catch {}
  }
  async function heartbeat() {
    try {
      const ts = Number(await storeGet('followbackLastCheck')) || Date.now()
      await (host() as any)?.followbackHeartbeat?.(ts)
    } catch {}
  }

  async function claimLeadership(): Promise<boolean> {
    const now = Date.now()
    try {
      const owner = await storeGet('followbackOwner')
      if (owner && owner.id && owner.id !== INSTANCE_ID && now - (owner.ts || 0) < FOLLOWBACK_CLAIM_TTL_MS) {
        return false
      }
      await storeSet('followbackOwner', { id: INSTANCE_ID, ts: now })
      await sleep(500)
      const check = await storeGet('followbackOwner')
      return !!(check && check.id === INSTANCE_ID)
    } catch { return true }
  }

  let fbRunning = false
  // force=true — редкое событие (DOM-наблюдатель только что нашёл ник после
  // логина): пропускаем guard кадэнса, но лидерство всё равно нужно.
  async function checkFollowBacks(force?: boolean) {
    // Защита от параллельных прогонов в этом контексте (медленный прогон
    // со sleep'ами не должен накладываться на следующий тик интервала).
    if (fbRunning) return
    fbRunning = true
    try {
      const enabled = await storeGet('followBackEnabled')
      if (!enabled) return
      if (!(await claimLeadership())) return

      // Межвкладочный guard кадэнса (расписание теперь само-сдвигающееся,
      // см. scheduleFollowback внизу — тики одной вкладки всегда >= CHECK_MS).
      // Метка ставится В КОНЦЕ удачного прогона: неуспешный прогон метку не
      // трогает, и следующая вкладка ретраит скоро, а не через 3 минуты.
      const cadenceNow = Date.now()
      const lastRun = Number(await storeGet('followbackLastCheck')) || 0
      if (!force && lastRun && cadenceNow - lastRun < FOLLOWBACK_CHECK_MS - 5000) return

      const ownSegment = await resolveOwnApiSegment()
      if (!ownSegment) return

      const doneByOwner = (await storeGet('followbackDoneByOwner')) || {}
      const failByOwner = (await storeGet('followbackFailuresByOwner')) || {}
      const doneSet = new Set<string>((doneByOwner[ownSegment] as string[]) || [])
      const failures = (failByOwner[ownSegment] as Record<string, number>) || {}
      // Карта «слаг → красивое имя»: following API отдаёт только строчные
      // слаги, а display-имя (username) есть в followers API и истории.
      const nameMap: Record<string, string> = (await storeGet('followbackNameMap')) || {}
      try {
        if (!Object.keys(nameMap).length) {
          const lastFollowed: string[] = (await storeGet('followbackLastFollowed')) || []
          for (const n of lastFollowed) { if (n) nameMap[String(n).toLowerCase()] = String(n) }
        }
      } catch {}
      const now = Date.now()

      const allFollowers: any[] = []
      let total = Infinity
      for (let page = 1; page <= FOLLOWBACK_MAX_PAGES && (page - 1) * FOLLOWBACK_PAGE_SIZE < total; page++) {
        let resp: Response
        try {
          resp = await fetchWithTimeout(
            `/api/users/${encodeURIComponent(ownSegment)}/followers?page=${page}&per_page=${FOLLOWBACK_PAGE_SIZE}`,
            { credentials: 'include' }
          )
        } catch (e) {
          console.log(FB_LOG, 'followers request failed', e)
          break
        }
        if (!resp.ok) {
          console.log(FB_LOG, 'followers request failed', resp.status)
          if (ownSegment === 'me' || page === 1) {
            // segment stopped working (e.g. session changed) — resolve fresh next time
            ownSlugMemory = null
          }
          break
        }
        const data = await resp.json().catch(() => null)
        if (!data) break
        total = typeof data.total === 'number' ? data.total : 0
        const users = Array.isArray(data.users) ? data.users : []
        allFollowers.push(...users)
        if (users.length < FOLLOWBACK_PAGE_SIZE) break
      }

      const following = await fetchFollowingData(ownSegment)
      if (!following) {
        console.log(FB_LOG, 'following endpoint unavailable — skipping this cycle')
        return
      }
      const followingSet = new Set(following.slugs)
      // Полнота выборок: зеркало и анфоллоу — только по полной картине,
      // иначе обрезанные страницы дадут ложные срабатывания.
      const listsComplete = following.complete && total <= FOLLOWBACK_MAX_PAGES * FOLLOWBACK_PAGE_SIZE
      // Запоминаем display-имена из свежих followers (username с регистром).
      let mapDirty = false
      for (const u of allFollowers) {
        const s = u.username_slug ? String(u.username_slug).toLowerCase() : null
        if (s && u.username && nameMap[s] !== String(u.username)) { nameMap[s] = String(u.username); mapDirty = true }
      }
      if (mapDirty) {
        const keys = Object.keys(nameMap)
        if (keys.length > 500) { for (const k of keys.slice(0, keys.length - 500)) delete nameMap[k] }
        await storeSet('followbackNameMap', nameMap)
      }

      // Зеркало «только свои»: память приложения = пересечение с живым
      // following. Ты отписался вручную → забываем → можно подписаться заново.
      let pruned = 0
      if (following.complete) {
        for (const slug of [...doneSet]) {
          if (!followingSet.has(slug)) { doneSet.delete(slug); delete failures[slug]; pruned++ }
        }
      }

      // Анфоллоу: приложение подписывало, тебя уже не читают, ты ещё подписан.
      // Ручные подписки не трогаем.
      const unfollowedNames: string[] = []
      if (listsComplete) {
        const followerSlugs = new Set<string>()
        const slugCase = new Map<string, string>()
        for (const u of allFollowers) {
          const orig = u.username_slug ? String(u.username_slug) : null
          const s = orig ? orig.toLowerCase() : null
          if (s) { followerSlugs.add(s); if (orig && !slugCase.has(s)) slugCase.set(s, orig) }
        }
        // Оригинальный регистр для анфоллоу чаще лежит в following-списке
        // (цель анфоллоу по определению не во followers).
        for (const [k, v] of following.caseMap) { if (!slugCase.has(k)) slugCase.set(k, v) }
        const toUnfollow = [...doneSet].filter((s) => followingSet.has(s) && !followerSlugs.has(s)).slice(0, FOLLOWBACK_MAX_PER_RUN)
        for (const slug of toUnfollow) {
          try {
            // Точный контракт сайта (его же JS-клиент): отписка — DELETE
            // того же пути, что и подписка. Та же кнопка — разные методы.
            // Слаг — в оригинальном регистре из API (как кликает сам сайт),
            // без лишних заголовков.
            const raw = slugCase.get(slug) || slug
            const r = await fetchWithTimeout(`/api/users/${encodeURIComponent(raw)}/follow`, {
              method: 'DELETE',
              credentials: 'include',
            })
            if (r.ok) { unfollowedNames.push(nameMap[slug] || raw); doneSet.delete(slug); delete failures[slug] }
            else { failures[slug] = now; diag('unfollow failed for ' + slug + ': ' + r.status) }
          } catch { failures[slug] = now }
          await sleep(400)
        }
      }

      const toFollow: any[] = []
      const skipCounts = { api: 0, already: 0, ext: 0, cooldown: 0 }
      for (const u of allFollowers) {
        const slug = u.username_slug ? String(u.username_slug).toLowerCase() : null
        if (!slug) continue
        if (u.is_following) { skipCounts.api++; continue }
        if (followingSet.has(slug)) { skipCounts.already++; continue }
        if (doneSet.has(slug)) { skipCounts.ext++; continue }
        const lastFail = failures[slug]
        if (lastFail && now - lastFail < FOLLOWBACK_RETRY_COOLDOWN_MS) { skipCounts.cooldown++; continue }
        toFollow.push(u)
      }

      const parts: string[] = []
      if (skipCounts.api) parts.push(skipCounts.api + ' (api flag)')
      if (skipCounts.already) parts.push(skipCounts.already + ' (already in following)')
      if (skipCounts.ext) parts.push(skipCounts.ext + ' (followed earlier)')
      if (skipCounts.cooldown) parts.push(skipCounts.cooldown + ' (cooldown)')
      // Метка + сводка + heartbeat — в конце УДАЧНОГО прогона (списки получены).
      const runTs = Date.now()
      await storeSet('followbackLastCheck', runTs)
      const summary: any = { ts: runTs, segment: ownSegment, followers: allFollowers.length, skipped: skipCounts, candidates: toFollow.length, followed: 0, unfollowed: unfollowedNames.length, unfollowedNames: unfollowedNames.slice(0, 5), pruned }
      doneByOwner[ownSegment] = [...doneSet]
      failByOwner[ownSegment] = failures
      await storeSet('followbackDoneByOwner', doneByOwner)
      await storeSet('followbackFailuresByOwner', failByOwner)
      await storeSet('followbackLastSummary', summary)
      diag(`run seg=${ownSegment} followers=${allFollowers.length} candidates=${toFollow.length} unfollowed=${unfollowedNames.length} pruned=${pruned}` + (parts.length ? ' skipped: ' + parts.join(', ') : ''))
      await heartbeat()
      if (!toFollow.length) return

      const batch = toFollow.slice(0, FOLLOWBACK_MAX_PER_RUN)
      if (toFollow.length > batch.length) {
        console.log(FB_LOG, `capping this run to ${batch.length} (of ${toFollow.length}) to avoid rate limits — rest will follow on later checks`)
      }

      const followedNames: string[] = []
      for (const u of batch) {
        const slug = String(u.username_slug).toLowerCase()
        try {
          const r = await fetchWithTimeout(`/api/users/${encodeURIComponent(u.username_slug)}/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
          })
          if (r.ok) {
            followedNames.push(nameMap[slug] || u.username || u.username_slug)
            delete failures[slug]
            doneSet.add(slug)
          } else {
            failures[slug] = now
            diag('follow failed for ' + slug + ': ' + r.status)
          }
        } catch {
          failures[slug] = now
        }
        await sleep(400)
      }

      doneByOwner[ownSegment] = [...doneSet]
      failByOwner[ownSegment] = failures
      await storeSet('followbackDoneByOwner', doneByOwner)
      await storeSet('followbackFailuresByOwner', failByOwner)
      if (followedNames.length) {
        const totalCount = Number((await storeGet('followbackFollowedTotal')) || 0)
        await storeSet('followbackFollowedTotal', totalCount + followedNames.length)
        await storeSet('followbackLastFollowed', followedNames.slice(0, 5))
        summary.followed = followedNames.length
        await storeSet('followbackLastSummary', summary)
        await notifyFollowed(followedNames)
      }
    } catch (e) {
      console.log(FB_LOG, 'unexpected error', e)
    } finally {
      fbRunning = false
    }
  }

  // Самосдвигающееся расписание: следующий тик — через CHECK_MS от старта
  // предыдущего. Сетка не дрейфует, guard свой же тик не режет.
  function scheduleFollowback(ms: number) {
    setTimeout(() => { void checkFollowBacks().finally(() => scheduleFollowback(FOLLOWBACK_CHECK_MS)) }, ms)
  }
  scheduleFollowback(FOLLOWBACK_FIRST_DELAY_MS)
})()
