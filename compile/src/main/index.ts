import { app, BrowserWindow, BrowserView, ipcMain, session, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import Store from 'electron-store'

process.on('uncaughtException', (err: any) => {
  if (String(err?.message || err).includes('SQLITE_CANTOPEN')) return
  try { debugLog('FATAL uncaughtException:', String(err?.stack || err)) } catch {}
  console.error(err)
})
process.on('unhandledRejection', (reason: any) => {
  if (String(reason?.message || reason).includes('SQLITE_CANTOPEN')) return
  try { debugLog('FATAL unhandledRejection:', String(reason)) } catch {}
})

let localBase = ''
try {
  const appData = app.getPath('appData')
  localBase = path.join(appData.replace(/Roaming$/, 'Local'), 'AnimeonDesktop')
  app.setPath('userData', localBase)
  fs.mkdirSync(localBase, { recursive: true })
} catch {}

const LOG_FILE = path.join(localBase || process.cwd(), 'oauth-debug.log')
// Лог-гигиена: URL и тела OAuth-запросов могут нести code/token/credential.
// В файл пишем только origin+path, плюс длины/флаги — самих секретов нет.
function safeUrl(u: unknown): string {
  try { return String(u || '').split(/[?#]/)[0] } catch { return '' }
}
function debugLog(...args: any[]) {
  try {
    const line = `[${new Date().toISOString()}] ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
    console.log(line)
    fs.appendFileSync(LOG_FILE, line + '\n')
  } catch {}
}

const store = new Store({
  cwd: localBase || undefined,
  defaults: {
    baseUrl: 'https://v2.animeon.co',
    accounts: [] as any[],
    activeAccountId: null,
    tabs: [] as any[],
    tabOrder: [] as string[],
    activeTabId: null,
    activeView: 'site',
    detector: { watching: false, sound: true, toast: true, count: 0, lastAt: 0 },
    followBackEnabled: false
  }
})

// Keep account metadata independent from tab state. Older builds stored an
// empty array (or only activeAccountId), so migrate that shape to a single
// default profile without disturbing existing sessions.
function normalizeAccounts() {
  const raw: any[] = Array.isArray(store.get('accounts')) ? (store.get('accounts') as any[]) : []
  const byId = new Map<string, any>()
  for (const item of raw) {
    const id = String(item?.id ?? item?.accountId ?? item?.number ?? '')
    if (!id || byId.has(id)) continue
    byId.set(id, { id, nickname: item?.nickname || item?.name || '', createdAt: item?.createdAt || Date.now() })
  }
  const active = String(store.get('activeAccountId') || '')
  if (!byId.size) byId.set('1', { id: '1', nickname: '', createdAt: Date.now() })
  if (active && !byId.has(active) && /^\d+$/.test(active) && Number(active) <= 5) {
    byId.set(active, { id: active, nickname: '', createdAt: Date.now() })
  }
  const accounts = [...byId.values()].sort((a, b) => Number(a.id) - Number(b.id)).slice(0, 5)
  store.set('accounts', accounts)
  if (!store.get('activeAccountId')) store.set('activeAccountId', accounts[0].id)
  return accounts
}
normalizeAccounts()

// One-time purge of nicknames stored by the old scraper, which could save
// nav text ("Онгоинги") or other users' nicks. They re-sync on next page load.
if (!store.get('nickCleanedV1')) {
  try {
    const accs = normalizeAccounts()
    for (const a of accs) a.nickname = ''
    store.set('accounts', accs)
    store.set('nickCleanedV1', true)
  } catch {}
}

function notifyAccounts() {
  const accounts = normalizeAccounts()
  mainWindow?.webContents.send('accounts:updated', accounts, String(store.get('activeAccountId') || accounts[0]?.id || '1'))
  return accounts
}

function setTabAudible(tabId: string, audible: boolean) {
  try {
    const tabs: any[] = (store.get('tabs') as any[]) || []
    const t = tabs.find(x => x.id === tabId)
    if (!t || !!t.audible === audible) return
    t.audible = audible
    store.set('tabs', tabs)
    mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
  } catch {}
}

let lastLimitInject = 0
function getActiveViewForToast(): any | null {
  try {
    const v = activeTabId ? views.get(activeTabId) : null
    if (!v || (v.webContents as any)?.isDestroyed?.()) return null
    if (!String(v.webContents.getURL() || '').includes('animeon')) return null
    return v
  } catch { return null }
}
function notifyTabLimit() {
  debugLog('DIAG tabs limit reached, notifying renderer')
  try { store.set('lastTabLimitWarn', Date.now()) } catch {}
  mainWindow?.webContents.send('tabs:limit')
  // Пилюля рисуется ВНУТРИ активной вкладки (поверх сайта) — синглтон:
  // пока висит (2.5с), спам-вызовы игнорируются и там, и в рендерере.
  const now = Date.now()
  if (now - lastLimitInject < 2500) return
  lastLimitInject = now
  try { getActiveViewForToast()?.webContents.executeJavaScript('window.__animeonToast&&window.__animeonToast.limit()').catch(() => {}) } catch {}
}

// Middle-click / window.open links from tabs: a background tab (limit 5).
function createTabFromUrl(url: string) {
  const tabs: any[] = (store.get('tabs') as any[]) || []
  debugLog('DIAG createTabFromUrl count=', tabs.length)
  if (tabs.length >= 5) { notifyTabLimit(); return null }
  const id = Date.now().toString()
  const activeAcc = store.get('activeAccountId') as string | null
  const partition = activeAcc ? `persist:animeon-acc-${activeAcc}` : 'persist:animeon-acc-1'
  const tab = { id, url, title: 'Новая вкладка', partition, pinned: false, muted: false, audible: false }
  tabs.push(tab); store.set('tabs', tabs)
  const order: string[] = (store.get('tabOrder') as string[]) || []; order.push(id); store.set('tabOrder', order)
  ensureView(tab); layoutViews()
  mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
  return tab
}

function destroyView(tabId: string) {
  const old = views.get(tabId)
  if (old && mainWindow) {
    try { mainWindow.removeBrowserView(old); (old.webContents as any).destroy() } catch {}
    views.delete(tabId)
  }
}

// Applies the profile's isolated session (cookies live per partition) to tabs.
// Single-tab mode (default): only the active tab is moved, like before.
// All-tabs mode (Settings toggle "switchAllTabsOnProfileChange"): every tab is
// moved to the new partition and its view is recreated, so all tabs reload
// with the selected profile's session right away.
function applyAccountToTabs(accountId: string) {
  const partition = `persist:animeon-acc-${accountId}`
  const tabs: any[] = (store.get('tabs') as any[]) || []
  if (store.get('switchAllTabsOnProfileChange')) {
    for (const tab of tabs) tab.partition = partition
    store.set('tabs', tabs)
    for (const tab of tabs) { destroyView(tab.id); ensureView(tab) }
    if (!tabs.some(t => t.id === activeTabId)) {
      activeTabId = tabs[0]?.id || null
      store.set('activeTabId', activeTabId)
    }
  } else if (activeTabId) {
    const tab = tabs.find(t => t.id === activeTabId)
    if (tab) {
      tab.partition = partition
      store.set('tabs', tabs)
      destroyView(activeTabId)
      ensureView(tab)
    }
  }
  // The caller stays where it was (e.g. Settings): tabs reload in the
  // background, cards and nicknames update via the events below.
  layoutViews()
  mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
}

function switchTabAccount(accountId: string) {
  if (!activeTabId) return
  applyAccountToTabs(accountId)
}

async function syncAccountNickname(view: BrowserView, accountId: string) {
  try {
    // Nickname is trusted only from a logged-in session (profile API answers).
    // Logged-out pages clear stale nicknames instead of scraping nav text.
    const res: any = await view.webContents.executeJavaScript(`(async()=>{
      let loggedIn=false; let found=null;
      const paths=['/api/auth/me','/api/user/profile','/api/profile'];
      for(const p of paths){try{const r=await fetch(p,{credentials:'include'});if(r.ok){const j=await r.json().catch(()=>null);if(j&&typeof j==='object'&&Object.keys(j).length){loggedIn=true;found=(j&&j.user)||(j&&j.profile)||j;break;}}}catch{}}
      const pick=(o)=>{if(!o||typeof o!=='object')return '';const d=(o.data&&typeof o.data==='object')?o.data:o;const u=(d.user&&typeof d.user==='object')?d.user:d;return String(u.nickname||u.username||u.name||u.login||d.nickname||d.username||d.name||d.login||o.nickname||o.username||o.name||o.login||'').trim();};
      let nickname=pick(found);
      if(loggedIn&&!nickname){
        try{
          const links=[...document.querySelectorAll('a[href]')];
          const self=links.find(a=>{const t=(a.textContent||'').trim().toLowerCase();return t.indexOf('как видят другие')!==-1||t.indexOf('мой профиль')!==-1;});
          const h=self?(self.getAttribute('href')||''):'';
          const iu=h.toLowerCase().indexOf('/user/');
          if(iu!==-1)nickname=decodeURIComponent(h.slice(iu+6).split(/[?#]/)[0]);
        }catch{}
      }
      return {loggedIn,nickname};
    })()`, true)
    const accounts = normalizeAccounts()
    const account = accounts.find(a => a.id === String(accountId))
    if (!account) return false
    if (res && res.loggedIn) {
      const nickname = String(res.nickname || '').trim()
      if (!nickname || nickname === account.nickname) return false
      account.nickname = nickname
      store.set('accounts', accounts)
      notifyAccounts()
      debugLog('account nickname synced:', accountId, nickname)
      return true
    }
    if (account.nickname) {
      account.nickname = ''
      store.set('accounts', accounts)
      notifyAccounts()
      debugLog('account nickname cleared (logged out):', accountId)
      return true
    }
    return false
  } catch { return false }
}

let mainWindow: BrowserWindow | null = null
const views = new Map<string, BrowserView>()
let activeTabId: string | null = (store.get('activeTabId') as any) || null
let activeViewMode: string = (store.get('activeView') as any) || 'site'
let lastOAuthWindowTime = 0
let isHtmlFullscreen = false
const popupContents = new Set<number>()

function getPreloadPath(name: string) {
  return path.join(__dirname, '..', 'preload', name)
}

function getContentBounds() {
  if (isHtmlFullscreen) {
    const [w, h] = mainWindow!.getSize()
    return { x: 0, y: 0, width: w, height: h }
  }
  const sidebarW = (store.get('sidebarCollapsed') as boolean) ? 64 : 216
  if (!mainWindow) return { x: sidebarW, y: 88, width: 1060, height: 712 }
  const [winW, winH] = mainWindow.getSize()
    return { x: sidebarW + 2, y: 88, width: Math.max(400, winW - sidebarW - 6), height: Math.max(200, winH - 94) }
}

// The site logs in via POST /api/auth/google with { id_token } (see its
// JS: authApi.googleAuth). GIS delivers the id_token into the site page via
// window.opener.postMessage, but Electron tabs have no window.opener, so the
// token is lost. We capture it from the /gsi/transform POST and replay it
// through the site's own backend in the tab, then reload to apply the session.
let googleAuthInFlight = false
const oauthWindows = new Set<BrowserWindow>()
function getGoogleIdToken(payload: unknown) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload || {})
  const match = body.match(/(?:id_token|credential)["'=:%3A]+([^&"'\s,}]+)/i)
  if (!match) return ''
  try { return decodeURIComponent(match[1].replace(/\+/g, '%20')) } catch { return match[1] }
}
async function completeGoogleAuthViaTab(idToken: string) {
  if (googleAuthInFlight) return
  googleAuthInFlight = true
  try {
    const id = activeTabId || (store.get('tabOrder') as string[])?.[0]
    const view = id ? views.get(id) : null
    if (!view) return
    const url = view.webContents.getURL()
    if (!url.includes('animeon')) { await view.webContents.loadURL(url.startsWith('http') ? url : 'https://v2.animeon.co/') }
    const ok = await view.webContents.executeJavaScript(
      `(async()=>{try{const r=await fetch('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({id_token:${JSON.stringify(idToken)}})});if(!r.ok)return 'HTTP '+r.status;const j=await r.json().catch(()=>({}));return 'OK '+(j&&j.access_token?'token':'no-token')}catch(e){return 'ERR '+e.message}})()`,
      true
    )
    debugLog('googleAuth deliver:', ok)
    if (String(ok).startsWith('OK')) {
      for (const win of oauthWindows) {
        try { if (!win.isDestroyed()) win.close() } catch {}
      }
      oauthWindows.clear()
    }
    setTimeout(() => { try { view.webContents.reload() } catch {} }, 1200)
  } catch (e: any) { debugLog('googleAuth deliver failed:', e && e.message) }
  finally { googleAuthInFlight = false }
}

let lastAppliedZoom = 1
// When the window is short, zoom the embedded site out a bit so tall
// dropdowns (e.g. the profile menu with "Выйти") fit without resizing.
// Startup size is untouched: full zoom down to 600px content height.
function applyFitZoom(contentHeight: number) {
  const zoom = Math.min(1, Math.max(0.65, contentHeight / 600))
  if (Math.abs(zoom - lastAppliedZoom) < 0.01) return
  lastAppliedZoom = zoom
  for (const [, view] of views.entries()) {
    try { view.webContents.setZoomFactor(zoom) } catch {}
  }
}
function layoutViews() {
  if (!mainWindow) return
  const bounds = getContentBounds()
  const showSite = activeViewMode === 'site' && activeTabId && views.has(activeTabId)
  for (const [id, view] of views.entries()) {
    if (id === activeTabId && showSite) {
      view.setBounds(bounds as any)
    } else {
      view.setBounds({ x: -2000, y: -2000, width: 10, height: 10 } as any)
    }
  }
  applyFitZoom(bounds.height)
}

function ensureView(tab: any) {
  if (!mainWindow) return null
  let view = views.get(tab.id)
  if (!view) {
    const ses = session.fromPartition(tab.partition)
    try {
      ses.webRequest.onBeforeRequest((details, cb) => {
        try {
          if (details.url.includes('gsi/transform') && details.method === 'POST') {
            const rb: any = (details as any).requestBody || {}
            debugLog('transform FULL-POST url=', safeUrl(details.url), 'formKeys=', Object.keys((rb as any)?.formData || rb || {}).join(','))
            let idToken = ''
            try { if (rb && rb.formData && (rb.formData.id_token || rb.formData.credential)) idToken = String(rb.formData.id_token || rb.formData.credential) } catch {}
            try {
              if (!idToken && rb && Array.isArray(rb.raw)) {
                const str = Buffer.concat(rb.raw.map((r: any) => Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes || ''))).toString('utf8')
                const mt = str.match(/(?:id_token|credential)=([^&\s]+)/)
                if (mt) idToken = decodeURIComponent(mt[1])
              }
            } catch {}
            debugLog('transform POST url=', safeUrl(details.url), 'hasRaw=', !!(rb && Array.isArray(rb.raw)), 'idTokenLen=', idToken.length)
            if (idToken.length > 20) completeGoogleAuthViaTab(idToken)
          }
        } catch {}
        cb({})
      })
    } catch {}
    view = new BrowserView({
      webPreferences: {
        session: ses,
        preload: getPreloadPath('hidden.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    views.set(tab.id, view)
    view.webContents.on('media-started-playing', () => setTabAudible(tab.id, true))
    ;(view.webContents as any).on('media-paused-playing', () => setTabAudible(tab.id, false))
    view.webContents.on('render-process-gone', (_e, details) => {
      debugLog('DIAG view render-process-gone tab=', tab.id, JSON.stringify(details))
    })
    ;(view as any).__accountId = String((tab.partition || '').match(/animeon-acc-(\d+)/)?.[1] || '1')
    mainWindow.addBrowserView(view)
    view.webContents.loadURL(tab.url)

    view.webContents.on('page-title-updated', (_e, title) => {
      const tabs: any[] = (store.get('tabs') as any[]) || []
      const t = tabs.find((x) => x.id === tab.id)
      if (t) { t.title = title; store.set('tabs', tabs); mainWindow?.webContents.send('tabs:updated', tabs, activeTabId) }
    })
    view.webContents.on('did-navigate', (_e, url) => {
      if (url.includes('gsi/transform')) {
        debugLog('tab:did-navigate gsi/transform FULL=', url)
        // Some GIS variants deliver id_token in the URL (query/fragment)
        // for response_mode=fragment / implicit grant.
        const m = url.match(/[?#&](id_token|credential)=([^&]+)/)
        if (m) { debugLog('transform url id_token len=', m[2].length); completeGoogleAuthViaTab(decodeURIComponent(m[2])) }
      } else if (/accounts\.google\.com/.test(url)) debugLog('tab:did-navigate', url.split('?')[0])
      const tabs: any[] = (store.get('tabs') as any[]) || []
      const t = tabs.find((x) => x.id === tab.id)
      if (t) { t.url = url; store.set('tabs', tabs) }
    })
    // SPA-навигация не стреляет did-navigate — обновляем адрес вкладки здесь,
    // чтобы хранилась актуальная ссылка.
    view.webContents.on('did-navigate-in-page', (_e, url) => {
      try {
        if (!url || !url.startsWith('http')) return
        const tabs: any[] = (store.get('tabs') as any[]) || []
        const t = tabs.find((x) => x.id === tab.id)
        if (t && t.url !== url) { t.url = url; store.set('tabs', tabs) }
      } catch {}
    })
    view.webContents.on('did-finish-load', () => {
      injectPlugin(view!)
      injectNoScrollbarCSS(view!)
      // Pick up the nickname on our own after every page load (login, OAuth
      // reload, SPA navigation) instead of relying only on the Settings poll.
      // Delayed slightly so the site can hydrate client-side state first.
      const accountId = (view! as any).__accountId
      setTimeout(() => {
        try {
          if ((view! as any).__accountId !== accountId) return
          if (view!.webContents.isDestroyed()) return
          if (!view!.webContents.getURL().includes('animeon')) return
          syncAccountNickname(view!, String(accountId || '1'))
        } catch {}
      }, 2500)
    })
    view.webContents.on('did-fail-load', () => {})
    view.webContents.on('enter-html-full-screen', () => {
      isHtmlFullscreen = true
      setTimeout(layoutViews, 50)
    })
    view.webContents.on('leave-html-full-screen', () => {
      isHtmlFullscreen = false
      setTimeout(layoutViews, 50)
    })
  }
  try { view.webContents.setAudioMuted(!!tab.muted) } catch {}
  try { if (lastAppliedZoom !== 1) view.webContents.setZoomFactor(lastAppliedZoom) } catch {}
  return view
}

let pluginCache: string | null = null
function injectPlugin(view: BrowserView) {
  try {
    if (pluginCache == null) {
      const pluginPath = path.join(__dirname, '..', 'preload', 'content.js')
      pluginCache = fs.existsSync(pluginPath) ? fs.readFileSync(pluginPath, 'utf8') : ''
    }
    if (pluginCache) view.webContents.executeJavaScript(pluginCache).catch(() => {})
  } catch {}
}

function injectNoScrollbarCSS(view: BrowserView) {
  view.webContents.insertCSS(`
    ::-webkit-scrollbar { display: none !important; width: 0 !important; }
    html, body { scrollbar-width: none !important; }
  `).catch(() => {})
}

// Ленивый старт: тяжёлый BrowserView создаём только для активной вкладки,
// остальные — по первому переключению (tabs:switch делает ensureView сам).
// Раньше все закреплённые грузились параллельно и тормозили запуск.
function attachActiveTab() {
  try {
    const tabs: any[] = (store.get('tabs') as any[]) || []
    const t = tabs.find(x => x.id === activeTabId) || tabs[0]
    if (t) ensureView(t)
  } catch {}
  layoutViews()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'bridge.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const devUrl = 'http://localhost:5173'
  const prodPath = path.join(__dirname, '..', 'renderer', 'index.html')

  if (process.env.NODE_ENV === 'development' && !app.isPackaged) {
    mainWindow.loadURL(devUrl).catch(() => mainWindow?.loadFile(prodPath))
  } else {
    mainWindow.loadFile(prodPath)
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    attachActiveTab()
    layoutViews()
  })

  // Diagnostics for "window disappears" reports: transparent window turns
  // invisible when its renderer dies, while the taskbar entry stays.
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    debugLog('DIAG main render-process-gone:', JSON.stringify(details))
  })
  mainWindow.on('unresponsive', () => debugLog('DIAG main window unresponsive'))
  mainWindow.on('responsive', () => debugLog('DIAG main window responsive again'))
  mainWindow.on('hide', () => debugLog('DIAG main window hide'))
  mainWindow.on('minimize', () => debugLog('DIAG main window minimize'))
  mainWindow.on('close', () => debugLog('DIAG main window close'))

  mainWindow.on('resize', layoutViews)
  mainWindow.on('maximize', layoutViews)
  mainWindow.on('unmaximize', layoutViews)
  mainWindow.on('enter-full-screen', () => { isHtmlFullscreen = false; layoutViews() })
  mainWindow.on('leave-full-screen', () => { isHtmlFullscreen = false; layoutViews() })

  mainWindow.on('closed', () => {
    mainWindow = null
    for (const [, view] of views.entries()) {
      try { (view.webContents as any).destroy() } catch {}
    }
    views.clear()
  })

  ipcMain.handle('store:get', (_e, key) => (store as any).get(key))
  ipcMain.handle('store:set', (_e, key, val) => { (store as any).set(key, val); return true })
  ipcMain.handle('store:getAll', () => (store as any).store)
  ipcMain.handle('accounts:list', async () => {
    const accounts = normalizeAccounts()
    // Best effort: when a profile tab is already loaded, ask AnimeOn for the
    // current user and persist the nickname alongside the account id.
    for (const account of accounts) {
      const view = [...views.values()].find(v => {
        try { return v.webContents.getURL().includes('animeon') && (v as any).__accountId === account.id } catch { return false }
      })
      if (!view) continue
      try {
        const res: any = await view.webContents.executeJavaScript(`(async()=>{\n          let loggedIn=false;\n          const paths=['/api/auth/me','/api/user/profile','/api/profile'];\n          for(const p of paths){try{const r=await fetch(p,{credentials:'include'});if(r.ok){const j=await r.json().catch(()=>null);if(j&&typeof j==='object'&&Object.keys(j).length){loggedIn=true;return {loggedIn,data:(j&&j.user)||(j&&j.profile)||j};}}}catch{}}\n          return {loggedIn,data:null};\n        })()`, true)
        const profile = res && res.data
        let nickname = String(profile?.nickname || profile?.username || profile?.name || profile?.login || profile?.user?.nickname || profile?.user?.username || profile?.user?.name || profile?.data?.nickname || profile?.data?.username || profile?.data?.name || profile?.data?.user?.nickname || profile?.data?.user?.username || profile?.data?.user?.name || '').trim()
        if (!nickname && res && res.loggedIn) {
          try {
            nickname = String(await view.webContents.executeJavaScript(`(()=>{
              const links=[...document.querySelectorAll('a[href]')];
              const self=links.find(a=>{const t=(a.textContent||'').trim().toLowerCase();return t.indexOf('как видят другие')!==-1||t.indexOf('мой профиль')!==-1;});
              const h=self?(self.getAttribute('href')||''):'';
              const iu=h.toLowerCase().indexOf('/user/');
              if(iu===-1)return '';
              return decodeURIComponent(h.slice(iu+6).split(/[?#]/)[0]);
            })()`, true) || '').trim()
          } catch {}
        }
        if (res && res.loggedIn) {
          if (nickname && nickname !== account.nickname) account.nickname = nickname
        } else if (account.nickname) {
          account.nickname = ''
        }
      } catch {}
    }
    store.set('accounts', accounts)
    notifyAccounts()
    return accounts
  })
  ipcMain.handle('accounts:add', () => {
    const accounts = normalizeAccounts()
    if (accounts.length >= 5) return null
    const used = new Set(accounts.map(a => String(a.id)))
    let n = 1; while (used.has(String(n)) && n <= 5) n++
    if (n > 5) return null
    const profile = { id: String(n), nickname: '', createdAt: Date.now() }
    accounts.push(profile)
    accounts.sort((a, b) => Number(a.id) - Number(b.id))
    store.set('accounts', accounts)
    notifyAccounts()
    return profile
  })
  ipcMain.handle('accounts:select', (_e, id: string | number) => {
    const key = String(id)
    const accounts = normalizeAccounts()
    if (!accounts.some(a => a.id === key)) return false
    store.set('activeAccountId', key)
    if (activeTabId) applyAccountToTabs(key)
    notifyAccounts()
    return true
  })
  ipcMain.handle('accounts:setNickname', (_e, id: string | number, nickname: string) => {
    const key = String(id)
    const accounts = normalizeAccounts()
    const account = accounts.find(a => a.id === key)
    if (!account) return false
    account.nickname = String(nickname || '').trim().slice(0, 80)
    store.set('accounts', accounts)
    notifyAccounts()
    return account
  })
  ipcMain.handle('accounts:remove', (_e, id: string | number) => {
    const key = String(id)
    const accounts = normalizeAccounts()
    if (!accounts.some(a => a.id === key)) return false
    const next = accounts.filter(a => a.id !== key)
    if (!next.length) next.push({ id: '1', nickname: '', createdAt: Date.now() })
    next.sort((a, b) => Number(a.id) - Number(b.id))
    store.set('accounts', next)
    if (String(store.get('activeAccountId')) === key) {
      const fallback = String(next[0].id)
      store.set('activeAccountId', fallback)
      switchTabAccount(fallback)
    }
    notifyAccounts()
    return true
  })
  ipcMain.handle('tabs:create', (_e, url) => {
    const id = Date.now().toString()
    const tabs: any[] = (store.get('tabs') as any[]) || []
    if (tabs.length >= 5) { debugLog('DIAG tabs:create at limit'); notifyTabLimit(); return null }
    const activeAcc = store.get('activeAccountId') as string | null
    const partition = activeAcc ? `persist:animeon-acc-${activeAcc}` : 'persist:animeon-acc-1'
    const tab = { id, url: url || (store.get('baseUrl') as string), title: 'Новая вкладка', partition, pinned: false, muted: false, audible: false }
    tabs.push(tab); store.set('tabs', tabs)
    const order: string[] = (store.get('tabOrder') as string[]) || []; order.push(id); store.set('tabOrder', order)
    activeTabId = id; store.set('activeTabId', id)
    ensureView(tab); layoutViews()
    mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
    return tab
  })
  ipcMain.handle('tabs:close', (_e, id) => {
    const existing = ((store.get('tabs') as any[]) || []).find(t => t.id === id)
    if (existing?.pinned) return false
    const view = views.get(id)
    if (view && mainWindow) { mainWindow.removeBrowserView(view); (view.webContents as any).destroy(); views.delete(id) }
    let tabs: any[] = (store.get('tabs') as any[]) || []; tabs = tabs.filter((t) => t.id !== id); store.set('tabs', tabs)
    let order: string[] = (store.get('tabOrder') as string[]) || []; order = order.filter((o) => o !== id); store.set('tabOrder', order)
    if (activeTabId === id) { activeTabId = order[0] || tabs[0]?.id || null; store.set('activeTabId', activeTabId); layoutViews() }
    mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
    return true
  })
  ipcMain.handle('tabs:reorder', (_e, order: string[]) => { store.set('tabOrder', order); return true })
  ipcMain.handle('tabs:togglePinned', (_e, id: string) => {
    const tabs: any[] = (store.get('tabs') as any[]) || []
    const tab = tabs.find(t => t.id === id)
    if (!tab) return false
    tab.pinned = !tab.pinned
    store.set('tabs', tabs)
    mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
    return tab.pinned
  })
  ipcMain.handle('tabs:toggleMuted', (_e, id: string) => {
    const tabs: any[] = (store.get('tabs') as any[]) || []
    const tab = tabs.find(t => t.id === id)
    if (!tab) return false
    tab.muted = !tab.muted
    store.set('tabs', tabs)
    try { views.get(id)?.webContents.setAudioMuted(!!tab.muted) } catch {}
    mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
    return tab.muted
  })
  ipcMain.handle('tabs:switch', (_e, id: string) => {
    activeTabId = id; store.set('activeTabId', id); activeViewMode = 'site'; store.set('activeView', 'site')
    try {
      const tabs: any[] = (store.get('tabs') as any[]) || []
      const tab = tabs.find(t => t.id === id)
      if (tab) ensureView(tab)
    } catch {}
    layoutViews(); return true
  })
  ipcMain.handle('tabs:navigate', (_e, id: string, url: string) => {
    try {
      const tabs: any[] = (store.get('tabs') as any[]) || []
      const tab = tabs.find(t => t.id === id)
      if (tab) { ensureView(tab); tab.url = url; store.set('tabs', tabs) }
    } catch {}
    const v = views.get(id); if (v) v.webContents.loadURL(url); return true
  })
  // Domain switch from Settings: rewrite tab URLs to the new host and reload
  // all views there, same as profile switching recreates sessions.
  // Copy host-only session cookies to the new domain so the user stays
  // logged in after a domain switch (mirrors don't share sessions).
  async function migrateSessionCookies(partition: string, fromHost: string, toHost: string) {
    try {
      const ses = session.fromPartition(partition)
      const all = await ses.cookies.get({})
      const own = all.filter(c => c.domain === fromHost || c.domain === `.${fromHost}`)
      for (const c of own) {
        if (c.name.startsWith('__Host-')) continue
        try {
          await ses.cookies.set({
            url: `https://${toHost}${c.path && c.path.startsWith('/') ? c.path : '/'}`,
            name: c.name,
            value: c.value,
            path: c.path || '/',
            secure: c.secure,
            httpOnly: c.httpOnly,
            expirationDate: c.expirationDate,
            sameSite: c.sameSite as any,
          })
        } catch {}
      }
    } catch {}
  }
  ipcMain.handle('site:setBaseUrl', async (_e, url: string) => {
    const base = String(url || '')
    let host = ''
    try { host = new URL(base).host } catch { return false }
    if (!host.includes('animeon')) return false
    const prev = String(store.get('baseUrl') || '')
    let prevHost = ''
    try { prevHost = new URL(prev).host } catch {}
    store.set('baseUrl', base)
    if (prevHost === host) return true
    const tabs: any[] = (store.get('tabs') as any[]) || []
    for (const tab of tabs) {
      try {
        if (typeof tab.url === 'string' && (tab.url as string).includes('animeon')) {
          const u = new URL(tab.url as string)
          u.host = host
          tab.url = u.toString()
        } else {
          tab.url = base
        }
      } catch { tab.url = base }
    }
    store.set('tabs', tabs)
    if (prevHost) {
      const partitions = new Set<string>()
      for (const tab of tabs) {
        if (typeof tab.partition === 'string' && (tab.partition as string).startsWith('persist:')) partitions.add(tab.partition)
      }
      for (let i = 1; i <= 5; i++) partitions.add(`persist:animeon-acc-${i}`)
      for (const p of partitions) {
        try { await migrateSessionCookies(p, prevHost, host) } catch {}
      }
    }
    for (const tab of tabs) { destroyView(tab.id); ensureView(tab) }
    layoutViews()
    mainWindow?.webContents.send('tabs:updated', tabs, activeTabId)
    return true
  })
  ipcMain.handle('view:set', (_e, mode: string) => {
    activeViewMode = mode; store.set('activeView', mode); layoutViews(); return true
  })
  ipcMain.handle('sidebar:setCollapsed', (_e, v: boolean) => { store.set('sidebarCollapsed', v); layoutViews(); return true })
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:checkUpdate', async () => {
    const current = app.getVersion()
    try {
      const response = await fetch('https://api.github.com/repos/Kotecy/Animeon-Desktop/releases/latest', { headers: { 'User-Agent': 'AnimeonDesktop' } })
      if (!response.ok) return { ok: false, current, error: `GitHub HTTP ${response.status}` }
      const release: any = await response.json()
      const latest = String(release.tag_name || release.name || '').replace(/^v/i, '')
      const parts = (v: string) => v.split('.').map(n => Number.parseInt(n, 10) || 0)
      const a = parts(current); const b = parts(latest)
      let newer = false
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((b[i] || 0) !== (a[i] || 0)) { newer = (b[i] || 0) > (a[i] || 0); break }
      }
      return { ok: true, current, latest, newer, url: release.html_url || 'https://github.com/Kotecy/Animeon-Desktop/releases' }
    } catch (error: any) { return { ok: false, current, error: String(error?.message || error) } }
  })
  // Open release notes in the system browser. URL is whitelisted to our repo.
  ipcMain.handle('app:openUrl', (_e, url: string) => {
    const u = String(url || '')
    if (!/^https:\/\/github\.com\/Kotecy\/Animeon-Desktop\/releases/.test(u)) return false
    try { shell.openExternal(u); return true } catch { return false }
  })
  // Короткое уведомление-пилюля уровня приложения (напр. «последняя версия»).
  ipcMain.handle('app:notify', (_e, text: unknown) => {
    mainWindow?.webContents.send('app:notice', String(text ?? '').slice(0, 120))
    return true
  })
  // Open the site's own login page in the active embedded tab.  The renderer
  // exposes this API for a native login button, so keep the navigation in the
  // same persistent partition as the selected account.
  ipcMain.handle('google:login', async () => {
    const id = activeTabId || (store.get('tabOrder') as string[])?.[0]
    const view = id ? views.get(id) : null
    if (!view) return { ok: false, error: 'Нет вкладки Animeon' }
    const current = view.webContents.getURL()
    const target = current.includes('animeon') ? current : (store.get('baseUrl') as string)
    try {
      await view.webContents.executeJavaScript(`(()=>{const b=[...document.querySelectorAll('button,a')].find(x=>/google|войти|вход|login/i.test((x.innerText||'')+' '+(x.getAttribute('aria-label')||'')));if(b){b.click();return true}return false})()`, true)
      return { ok: true }
    } catch {
      try { await view.webContents.loadURL(target); return { ok: true } } catch (e) { return { ok: false, error: String(e) } }
    }
  })
  ipcMain.handle('achievements:fetch', async () => {
    const id = activeTabId || (store.get('tabOrder') as string[])?.[0]
    const view = id ? views.get(id) : null
    const target = view || [...views.values()].find(v => {
      try { return v.webContents.getURL().includes('animeon') } catch { return false }
    })
    if (!target) return { ok: false, error: 'Нет вкладки Animeon' }
    try {
      const data = await target.webContents.executeJavaScript(`
        fetch('/api/achievements', { credentials: 'include' }).then(r => r.ok ? r.json() : Promise.reject(r.status)).catch(e => ({ __error: String(e) }))
      `)
      if ((data as any)?.__error) return { ok: false, error: (data as any).__error }
      return { ok: true, data }
    } catch (e) { return { ok: false, error: String(e) } }
  })
  ipcMain.handle('detector:toggle', () => {
    const d: any = (store as any).get('detector') || { watching: false, sound: true, count: 0, lastAt: 0 }
    d.watching = !d.watching
    ;(store as any).set('detector', d)
    mainWindow?.webContents.send('detector:updated', d)
    return d
  })
  ipcMain.handle('detector:sound', () => {
    const d: any = (store as any).get('detector') || { watching: false, sound: true, count: 0, lastAt: 0 }
    d.sound = d.sound === undefined ? false : !d.sound
    ;(store as any).set('detector', d)
    mainWindow?.webContents.send('detector:updated', d)
    return d
  })
  ipcMain.handle('detector:toast', () => {
    const d: any = (store as any).get('detector') || { watching: false, sound: true, count: 0, lastAt: 0 }
    d.toast = d.toast === undefined ? false : !d.toast
    ;(store as any).set('detector', d)
    mainWindow?.webContents.send('detector:updated', d)
    return d
  })
  ipcMain.handle('followback:toggle', () => {
    const v = !store.get('followBackEnabled'); store.set('followBackEnabled', v); return v
  })
  // Детектор сообщает о замеченной аномалии: только уведомляем (звук + тост
  // + журнал в рендерере). Кулдаун против дублей с разных вкладок.
  let lastAnomalyNotify = 0
  ipcMain.handle('anomaly:detected', (_e, info: unknown) => {
    const now = Date.now()
    if (now - lastAnomalyNotify < 30000) return false
    lastAnomalyNotify = now
    try {
      const d: any = (store as any).get('detector') || { watching: false, sound: true, count: 0, lastAt: 0 }
      d.count = (d.count || 0) + 1; d.lastAt = now
      ;(store as any).set('detector', d)
      mainWindow?.webContents.send('detector:updated', d)
    } catch {}
    debugLog('anomaly:detected', JSON.stringify(info || {}).slice(0, 200))
    let wantToast = true
    try {
      const dd: any = (store as any).get('detector') || {}
      wantToast = dd.toast !== false
    } catch {}
    mainWindow?.webContents.send('anomaly:detected', { ...((info as any) || {}), toast: wantToast })
    // Тост дублируем внутрь активной вкладки: App-тост висит в зоне
    // таб-стрипа и на виде сайта почти не виден, а внутристраничный —
    // поверх сайта. Журнал и счётчик идут всегда, звук — своим тумблером.
    if (wantToast) {
      try { getActiveViewForToast()?.webContents.executeJavaScript('window.__animeonToast&&window.__animeonToast.anomaly()').catch(() => {}) } catch {}
    }
    return true
  })
  // Вкладка-лидер сообщает о взаимных подписках: показываем тост уровня
  // приложения (виден поверх любой вкладки) и пишем в журнал мгновенно,
  // не дожидаясь 30-секундного опроса Dashboard.
  ipcMain.handle('followback:diag', (_e, msg: unknown) => {
    try { debugLog(String(msg ?? '')) } catch {}
    return true
  })
  ipcMain.handle('followback:heartbeat', () => {
    try {
      const ts = Number(store.get('followbackLastCheck')) || Date.now()
      const summary = store.get('followbackLastSummary') || null
      mainWindow?.webContents.send('followback:tick', ts, summary)
    } catch {}
    return true
  })
  ipcMain.handle('followback:reset', () => {
    try { store.set('followbackDoneByOwner', {}); store.set('followbackFailuresByOwner', {}) } catch {}
    debugLog('followback:reset history cleared')
    return true
  })
  ipcMain.handle('followback:notify', (_e, names: unknown) => {
    const list = Array.isArray(names) ? names.map(String).filter(Boolean).slice(0, 5) : []
    debugLog('followback:notify', list.join(','))
    mainWindow?.webContents.send('followback:done', list)
    // Тост рисуем в АКТИВНОЙ вкладке (а не в лидере): имена уходят в
    // очередь внутристраничных тостов активного view — по одному, 6с каждый.
    try {
      const v = getActiveViewForToast()
      if (v && list.length) v.webContents.executeJavaScript(`window.__animeonToast&&window.__animeonToast.follow(${JSON.stringify(list)})`).catch(() => {})
    } catch {}
    return true
  })
  ipcMain.on('win:minimize', () => mainWindow?.minimize())
  ipcMain.on('win:maximize', () => { if (mainWindow?.isMaximized()) mainWindow?.unmaximize(); else mainWindow?.maximize() })
  ipcMain.on('win:close', () => mainWindow?.close())
}

// Session-scoped marks are reset on start/quit: follow-back starts a fresh
// 3-minute grid (first run ~15s in) instead of counting down the leftovers of
// the previous session. Stale leadership is cleared too, otherwise the new
// instance would lose the claim to its own dead predecessor (TTL shadow).
function resetRunFlags() {
  try { (store as any).delete('followbackLastCheck'); (store as any).delete('followbackOwner') } catch {}
  // Счётчик детектора обнуляется на старте, тумблеры (наблюдение/звук/окно) живут дальше.
  try {
    const d: any = (store as any).get('detector') || {}
    d.count = 0; d.lastAt = 0
    ;(store as any).set('detector', d)
  } catch {}
}

const singleInstanceLock = app.requestSingleInstanceLock()
if (!singleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    // Pinned tabs survive relaunches; a fresh home tab only when nothing pinned.
    const savedTabs: any[] = (store.get('tabs') as any[]) || []
    const pinnedTabs = savedTabs.filter(t => t.pinned).slice(0, 5).map(t => ({ ...t, audible: false }))
    const startupAccount = String(store.get('activeAccountId') || '1')
    const tabsAtLaunch = pinnedTabs.length ? pinnedTabs : [
      { id: `startup-${Date.now()}`, url: store.get('baseUrl') as string, title: 'AnimeOn — старт', partition: `persist:animeon-acc-${startupAccount}`, pinned: false, muted: false },
    ]
    const launchId = tabsAtLaunch[0]?.id
    store.set('tabs', tabsAtLaunch)
    store.set('tabOrder', tabsAtLaunch.map(t => t.id))
    store.set('activeTabId', launchId)
    activeTabId = launchId
    resetRunFlags()
    // Always start on the site tab, never remember Dashboard/Settings/Secrets.
    activeViewMode = 'site'
    store.set('activeView', 'site')
    const isOAuth = (url: string) =>
      url.includes('accounts.google.com') ||
      url.includes('consent.google.com') ||
      url.includes('myaccount.google.com') ||
      url.includes('oauth.telegram.org') ||
      url.includes('t.me/')
    const isGoogleOrTelegram = (url: string) =>
      url.includes('google.com') || url.includes('google.') ||
      url.includes('telegram.org') || url.includes('t.me')

    const importChromeGoogleCookies = async (partition: string) => {
      try {
        const chromeCookiesPath = path.join(app.getPath('appData').replace(/Roaming$/, 'Local'), 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies')
        try { fs.accessSync(chromeCookiesPath, fs.constants.R_OK) } catch { return }
        const { getCookies } = require('chrome-cookies-secure') as any
        const ses = session.fromPartition(partition)
        for (const host of ['https://accounts.google.com', 'https://google.com', 'https://.google.com']) {
          try {
            const cookies: any[] = await new Promise((res, rej) => {
              getCookies(host, 'Chrome', (err: any, cookies: any) => err ? rej(err) : res(cookies || []))
            })
            for (const c of cookies.slice(0, 20)) {
              try {
                await ses.cookies.set({
                  url: host,
                  name: c.name,
                  value: c.value,
                  domain: c.domain,
                  path: c.path || '/',
                  secure: !!c.secure,
                  httpOnly: !!c.httpOnly,
                  expirationDate: c.expires ? Math.floor(c.expires) : undefined
                })
              } catch {}
            }
            if (cookies.length) break
          } catch (e: any) {
            if (String(e?.message).includes('SQLITE_CANTOPEN')) return
          }
        }
      } catch {}
    }

    const routeSet = new Set<number>()
    const loadCallbackIntoTab = (contents: Electron.WebContents, ev?: Electron.Event) => {
      const url = contents.getURL()
      debugLog('route:nav-check', safeUrl(url))
      if (!url || url.startsWith('about:') || url.startsWith('blob:')) return
      if (isGoogleOrTelegram(url)) return
      if (url.includes('animeon') || url.includes('token') || url.includes('code=') || url.includes('oauth')) {
        debugLog('route:MATCH -> tab', safeUrl(url), 'hasCode=', url.includes('code='))
        if (ev) ev.preventDefault()
        const id = activeTabId || (store.get('tabOrder') as string[])?.[0]
        const v = id ? views.get(id) : null
        if (v) v.webContents.loadURL(url)
        const win = BrowserWindow.fromWebContents(contents)
        if (win && !win.isDestroyed()) setTimeout(() => { if (!win.isDestroyed()) win.close() }, 200)
      }
    }
    const routeOAuthCallback = (contents: Electron.WebContents) => {
      const key = contents.id
      if (routeSet.has(key)) return
      routeSet.add(key)
      contents.on('will-navigate', (ev, nextUrl) => {
        debugLog('oauth:will-navigate', safeUrl(nextUrl))
        if (!nextUrl || nextUrl.startsWith('about:') || nextUrl.startsWith('blob:')) return
        if (isGoogleOrTelegram(nextUrl)) return
        if (nextUrl.includes('animeon') || nextUrl.includes('code=') || nextUrl.includes('oauth') || nextUrl.includes('token')) {
          debugLog('oauth:will-navigate MATCH -> tab', safeUrl(nextUrl))
          ev.preventDefault()
          const id = activeTabId || (store.get('tabOrder') as string[])?.[0]
          const v = id ? views.get(id) : null
          if (v) v.webContents.loadURL(nextUrl)
          const win = BrowserWindow.fromWebContents(contents)
          if (win && !win.isDestroyed()) setTimeout(() => { if (!win.isDestroyed()) win.close() }, 200)
        }
      })
        contents.on('did-navigate', (...a: any[]) => { debugLog('oauth:did-navigate', safeUrl(a[1])); loadCallbackIntoTab(contents) })
        contents.on('did-navigate-in-page', (...a: any[]) => { debugLog('oauth:did-navigate-in-page', safeUrl(a[1])); loadCallbackIntoTab(contents) })
        contents.on('did-redirect-navigation', (...a: any[]) => { debugLog('oauth:did-redirect', safeUrl(a[1])); loadCallbackIntoTab(contents) })
        contents.on('did-fail-load', (...a: any[]) => { debugLog('oauth:did-fail-load', safeUrl(a[1]), a[2]) })
        contents.on('did-stop-loading', () => { debugLog('oauth:did-stop-loading url=', safeUrl(contents.getURL())); loadCallbackIntoTab(contents) })
    }

    const openOAuthWindow = async (url: string) => {
      const now = Date.now()
      debugLog('openOAuthWindow called with', safeUrl(url))
      if (now - lastOAuthWindowTime < 2000) { debugLog('cooldown skip'); return }
      lastOAuthWindowTime = now
      try {
        const activeAcc = store.get('activeAccountId') as string | null
        const partition = activeAcc ? `persist:animeon-acc-${activeAcc}` : 'persist:animeon-acc-1'
        if (url.includes('google')) {
          try { await importChromeGoogleCookies(partition) } catch {}
        }
        const ses = session.fromPartition(partition)
        // The OAuth popup uses the account partition too. Capture GIS's
        // credential response there, since it must never navigate the tab.
        try {
          ses.webRequest.onBeforeRequest((details, cb) => {
            if (details.url.includes('gsi/transform') && details.method === 'POST') {
              const rb: any = (details as any).requestBody || {}
              let token = ''
              try {
                if (rb.formData) token = String(rb.formData.id_token || rb.formData.credential || '')
                if (!token && Array.isArray(rb.raw)) {
                  const raw = Buffer.concat(rb.raw.map((r: any) => Buffer.isBuffer(r.bytes) ? r.bytes : Buffer.from(r.bytes || ''))).toString('utf8')
                  const m = raw.match(/(?:id_token|credential)=([^&\s]+)/)
                  if (m) token = decodeURIComponent(m[1])
                }
              } catch {}
              debugLog('oauth popup transform tokenLen=', token.length)
              if (token.length > 20) completeGoogleAuthViaTab(token)
            }
            cb({})
          })
        } catch {}
        const oauthWin = new BrowserWindow({
          width: 500,
          height: 620,
          parent: mainWindow!,
          autoHideMenuBar: true,
          title: url.includes('google') ? 'Google — вход' : 'Telegram — вход',
          webPreferences: {
            session: ses,
            // oauth.js, а не hidden.js: глушит WebAuthn/passkey до скриптов
            // страницы, чтобы Windows не показывал системный диалог ключей.
            // contextIsolation ВЫКЛЮЧЕН осознанно: с изоляцией preload правит
            // копию navigator в своём мире, а страница видит нативный объект —
            // заглушка не работала (видно в логе: stub null, get native).
            // nodeIntegration остаётся выключен: секретов в preload нет,
            // странице доступен только сам стаб.
            preload: getPreloadPath('oauth.js'),
            contextIsolation: false,
            nodeIntegration: false,
            sandbox: false
          }
        })
        oauthWindows.add(oauthWin)
        oauthWin.on('closed', () => oauthWindows.delete(oauthWin))
        // CDP attach обязателен: webRequest НЕ отдаёт тело навигационного POST
        // gsi/transform (в логе: webRequest tokenLen=0 против CDP tokenLen=1196).
        // Без него токен не захватывается, вход виснет на белом окне transform.
        try {
          oauthWin.webContents.debugger.attach('1.3')
          oauthWin.webContents.debugger.on('message', (_event, method, params) => {
            if (method !== 'Network.requestWillBeSent') return
            const request = params?.request
            if (!request?.url?.includes('gsi/transform')) return
            const token = getGoogleIdToken(request.postData || '')
            debugLog('cdp transform tokenLen=', token.length)
            if (token.length > 20) completeGoogleAuthViaTab(token)
          })
          oauthWin.webContents.debugger.sendCommand('Network.enable').catch(() => {})
          oauthWin.on('closed', () => {
            try { if (oauthWin.webContents.debugger.isAttached()) oauthWin.webContents.debugger.detach() } catch {}
          })
        } catch (e: any) { debugLog('cdp attach failed=', e?.message) }
        routeOAuthCallback(oauthWin.webContents)
        oauthWin.loadURL(url)
        // Диагностика заглушки passkey: что реально видит страница.
        try {
          oauthWin.webContents.once('dom-ready', () => {
            oauthWin.webContents.executeJavaScript(`(()=>{try{const c=navigator.credentials;return {stub:window.__oauthStub||null,pkc:typeof PublicKeyCredential,getSrc:String(c&&c.get).slice(0,90),wd:String(navigator.webdriver),ua:navigator.userAgent.slice(-30)}}catch(e){return {err:String(e).slice(0,80)}}})()`).then((r: any) => debugLog('oauth stub check:', JSON.stringify(r))).catch(() => {})
          })
        } catch {}
        oauthWin.webContents.on('did-finish-load', () => {
          oauthWin.webContents.insertCSS('::-webkit-scrollbar { display: none !important; }').catch(() => {})
        })
        oauthWin.on('closed', () => {
          const tabs: any[] = (store.get('tabs') as any[]) || []
          for (const t of tabs) {
            const v = views.get(t.id)
            if (v) v.webContents.reload()
          }
        })
      } catch {}
    }

    app.on('web-contents-created', (_e, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        debugLog('main:window-open', url.split('?')[0], 'current=', contents.getURL().split('?')[0], 'isOAuth=', isOAuth(url))
        if (url.startsWith('about:') || url.startsWith('tg://')) return { action: 'allow' }
        const currentUrl = contents.getURL()

        // Google Identity Services uses a POPUP that returns the token via
        // window.opener.postMessage from /gsi/transform. We MUST let it open
        // as a real popup so window.opener points back to the animeon tab.
        // GIS opens /o/oauth2/v2/auth and then /gsi/select as two popups of
        // the SAME flow — allow both (no global cooldown that drops the 2nd).
        if (isOAuth(url) && currentUrl.includes('animeon')) {
          openOAuthWindow(url).catch(() => {})
          return { action: 'deny' }
        }
        // Google/Telegram windows already inside the flow — let them be.
        if (isGoogleOrTelegram(currentUrl)) return { action: 'allow' }
        if (isOAuth(url)) {
          openOAuthWindow(url).catch(() => {})
          return { action: 'deny' }
        }
        if (url.startsWith('http') && url.includes('animeon')) {
          const isTabView = [...views.values()].some(v => v.webContents === contents)
          debugLog('DIAG window-open animeon isTabView=', isTabView, String(url).split('?')[0])
          if (isTabView) {
            createTabFromUrl(url)
            return { action: 'deny' }
          }
        }
        if (url.startsWith('http') && !url.includes('animeon')) {
          shell.openExternal(url)
          return { action: 'deny' }
        }
        return { action: 'allow' }
      })

      contents.on('will-navigate', (ev, url) => {
        const currentUrl = contents.getURL()
        debugLog('main:will-navigate', url.split('?')[0], 'current=', currentUrl.split('?')[0], 'isOAuth=', isOAuth(url), 'isPopup=', popupContents.has(contents.id))
        // Leave popups / OAuth windows alone — they need window.opener and
        // natural navigation to complete the flow.
        const isMainContext = mainWindow && contents === mainWindow.webContents
        const isTabView = [...views.values()].some(v => v.webContents === contents)
        if (!isMainContext && !isTabView) return
        // **Block Google navigation in tabs** — keep the tab on animeon so that
        // any Google OAuth popup we allow has a valid window.opener pointing here.
        // Without this, GIS (or the standard Google OAuth) redirects the tab and
        // we lose the opener needed for postMessage / id_token return.
        if (url.includes('google.com') || url.includes('google.') || url.includes('telegram.org') || url.includes('t.me/')) {
          ev.preventDefault()
          return
        }
        if (!url.includes('animeon') && !url.startsWith('about:') && url.startsWith('http')) {
          ev.preventDefault()
          shell.openExternal(url)
        }
      })

      contents.on('did-create-window', (win) => {
        const url = win.webContents.getURL()
        debugLog('main:did-create-window url=', url.split('?')[0])
        popupContents.add(win.webContents.id)
        // A just-created popup often reports about:blank until it loads.
        // Let Google/Telegram popups flow naturally; they self-close on success.
        if (isGoogleOrTelegram(win.webContents.getURL())) return
        // Route an animeon callback opened in a stray window into the tab.
        win.webContents.on('did-start-navigation', (_ev, navUrl) => {
          if (navUrl.includes('animeon')) {
            const id = activeTabId || (store.get('tabOrder') as string[])?.[0]
            const v = id ? views.get(id) : null
            if (v) v.webContents.loadURL(navUrl)
            if (!win.isDestroyed()) win.close()
          }
        })
      })
    })

    for (let i = 1; i <= 5; i++) { session.fromPartition(`persist:animeon-acc-${i}`) }

    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    const fixUA = (ses: Electron.Session) => {
      try { ses.setUserAgent(CHROME_UA) } catch {}
      ses.webRequest.onBeforeSendHeaders((details, cb) => {
        const h = details.requestHeaders
        h['User-Agent'] = CHROME_UA
        h['Sec-CH-UA'] = '"Chromium";v="130", "Not_A Brand";v="24"'
        h['Sec-CH-UA-Platform'] = '"Windows"'
        h['Sec-CH-UA-Mobile'] = '?0'
        cb({ requestHeaders: h })
      })
    }
    session.defaultSession.setUserAgent(CHROME_UA)
    for (const part of ['persist:animeon-acc-1','persist:animeon-acc-2','persist:animeon-acc-3','persist:animeon-acc-4','persist:animeon-acc-5']) {
      fixUA(session.fromPartition(part))
    }

    createMainWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow() })
  })
}

app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  resetRunFlags()
  const tabs: any[] = (store.get('tabs') as any[]) || []
  const pinned = tabs.filter(t => t.pinned)
  store.set('tabs', pinned)
  store.set('tabOrder', pinned.map(t => t.id))
  store.set('activeTabId', pinned[0]?.id || null)
  for (const [, view] of views.entries()) {
    try { (view.webContents as any).destroy() } catch {}
  }
  views.clear()
})

// Проверка обновлений отложена: дёргать сеть на уровне модуля тормозило запуск.
setTimeout(() => {
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  } catch {}
}, 20000)
