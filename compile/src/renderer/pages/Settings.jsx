import { useEffect, useRef, useState } from 'react'

const plural = (n, one, few, many) => { const m = Math.abs(Number(n)) % 100; const d = m % 10; if (m > 10 && m < 20) return many; if (d > 1 && d < 5) return few; if (d === 1) return one; return many }

const SlidersIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
const GlobeIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
const UserIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.2 3-5 7-5s6.3 1.8 7 5" /></svg>
const CHANGELOG = [
  { version: '0.3.0', date: '03.09.2026', items: ['Релиз на гитхаб'] },
  { version: '0.2.15 - 0.2.42', date: '03.09.2026', items: ['Профили: опция «переключать все вкладки»', 'Ник только для авторизованной сессии', 'Склонения профилей', 'Переключение профиля не выкидывает из настроек', 'Новый профиль не активируется сам', 'Вкладки помнят текущую страницу', 'Смена домена перезагружает вкладки', 'Сессия переносится на новый домен', 'Кнопки вкладки поверх названия', 'Индикатор звука на вкладке', 'Меню профиля сайта со скроллом', 'Индикатор доступности сайта', 'Запуск всегда на вкладке сайта', 'Кнопка «Установить новую версию ?» открывает релизы', 'Тост взаимной подписки в стиле приложения', 'Обновлён раздел секреток, добавлены новые', 'Меню changelog: старый вид + спойлеры по датам', 'Средняя кнопка открывает ссылку в новой вкладке', 'Тост о лимите вкладок', 'Живой журнал действий', 'Доработан детектор аномалий', 'Тройной звуковой сигнал с паузой', 'Новый тост обнаружения', 'Адреса сайта сокращены до v1–v4', 'Понятные формулировки в детекторе и профилях', 'Читаемый тост детектора', 'Быстрый запуск приложения'] },
  { version: '0.2.0 – 0.2.14', date: '02.09.2026', items: ['Google OAuth, закрепление вкладок, автопоиск с первой вкладки', 'Профили аккаунтов: добавление через +, переключение, удаление, синхронизация ника', 'Редизайн поиска аномалий и секретов, проверка версии через GitHub Releases', 'Геометрия вкладок, тёмная тема и навигация'] },
]

export default function Settings({ baseUrl, onBaseUrl }) {
  const [url, setUrl] = useState(baseUrl)
  const [acc, setAcc] = useState(1)
  const [checking, setChecking] = useState(false)
  const [updateUrl, setUpdateUrl] = useState('')
  const [msg, setMsg] = useState('')
  const [accounts, setAccounts] = useState([{ id: '1', nickname: '' }])
  const [showChangelog, setShowChangelog] = useState(false)
  const [expandedLog, setExpandedLog] = useState('')
  const [switchAll, setSwitchAll] = useState(false)
  const [tabsCount, setTabsCount] = useState(0)
  const [siteOk, setSiteOk] = useState(true)
  const accListenerAdded = useRef(false)
  const tabsListenerAdded = useRef(false)

  useEffect(() => setUrl(baseUrl), [baseUrl])
  // Availability dot: green = reachable, red = unreachable.
  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    const timer = setTimeout(() => { try { ctrl.abort() } catch {} }, 8000)
    fetch(String(baseUrl || '').replace(/\/$/, '') + '/', { method: 'HEAD', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
      .then(() => { if (alive) setSiteOk(true) })
      .catch(() => { if (alive) setSiteOk(false) })
      .finally(() => clearTimeout(timer))
    return () => { alive = false; try { ctrl.abort() } catch {} }
  }, [baseUrl])
  useEffect(() => {
    window.api?.storeGetAll?.().then(s => {
      const saved = Number(s?.activeAccountId)
      if (saved >= 1 && saved <= 5) setAcc(saved)
      if (Array.isArray(s?.accounts) && s.accounts.length) setAccounts(s.accounts)
      if (s?.baseUrl) setUrl(s.baseUrl)
      setSwitchAll(!!s?.switchAllTabsOnProfileChange)
      if (Array.isArray(s?.tabs)) { setTabsCount(s.tabs.length) }
    })
  }, [])
  const refreshAccounts = async () => {
    const [next, activeId, tabs] = await Promise.all([
      window.api?.accountsList?.(),
      window.api?.storeGet?.('activeAccountId'),
      window.api?.storeGet?.('tabs')
    ])
    if (Array.isArray(next) && next.length) setAccounts(next)
    const selected = Number(activeId)
    if (selected >= 1 && selected <= 5) setAcc(selected)
    if (Array.isArray(tabs)) { setTabsCount(tabs.length) }
  }
  // Slow safety poll: nickname sync now happens on page load in main, this is
  // only a fallback (e.g. in-page login without reload).
  useEffect(() => { refreshAccounts(); const timer = setInterval(refreshAccounts, 30000); return () => clearInterval(timer) }, [])
  useEffect(() => { if (tabsListenerAdded.current) return; tabsListenerAdded.current = true; window.api?.onTabsUpdated?.((t) => { if (Array.isArray(t)) { setTabsCount(t.length) } }) }, [])
  // Guard: remounting Settings (sidebar clicks) must not stack duplicate listeners.
  useEffect(() => { if (accListenerAdded.current) return; accListenerAdded.current = true; window.api?.onAccountsUpdated?.((next, activeId) => { if (Array.isArray(next) && next.length) setAccounts(next); const selected = Number(activeId); if (selected >= 1 && selected <= 5) setAcc(selected) }) }, [])

  const saveAccount = async (id) => { setAcc(Number(id)); await window.api?.accountsSelect?.(String(id)); refreshAccounts() }
  const removeAccount = async (id) => { await window.api?.accountsRemove?.(String(id)); await refreshAccounts() }
  const toggleSwitchAll = async () => { const next = !switchAll; setSwitchAll(next); await window.api?.storeSet?.('switchAllTabsOnProfileChange', next) }
  const addAccount = async () => {
    try {
      let profile = await window.api?.accountsAdd?.()
      if (!profile) {
        const used = new Set(accounts.map(p => String(p.id)))
        let next = 1; while (used.has(String(next)) && next <= 5) next++
        if (next > 5) return
        profile = { id: String(next), nickname: '' }
        const merged = [...accounts, profile]
        await window.api?.storeSet?.('accounts', merged)
      }
      setAccounts(prev => [...prev.filter(p => String(p.id) !== String(profile.id)), profile])
      refreshAccounts()
    } catch {}
  }
  const siteVersions = Array.from({ length: 4 }, (_, i) => i + 1)

  return <div className="h-full overflow-auto px-6 py-6 text-white"><div className="mx-auto max-w-[860px] space-y-6">
    <header><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-violet-300/80"><SlidersIcon /> Рабочая среда</div><h1 className="mt-2 text-[28px] font-semibold tracking-tight">Настройки</h1></header>

    <section className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/10 text-cyan-300"><GlobeIcon /></div><div><h2 className="text-sm font-medium">Адрес сайта</h2><p className="mt-1 text-xs text-zinc-500">Выберите окружение AnimeOn для новых вкладок.</p></div></div><div className="mt-5 flex gap-2"><select value={url} onChange={e => setUrl(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[#0a0b10] px-3 text-sm outline-none focus:border-violet-400/60">{siteVersions.map(v => { const value = `https://v${v}.animeon.co`; return <option key={v} value={value} disabled={v >= 3}>v{v}.animeon.co{v >= 3 ? ' · скоро' : ''}</option> })}</select><button onClick={() => { onBaseUrl(url); window.api?.siteSetBaseUrl?.(url) }} className="rounded-xl bg-violet-500 px-4 text-sm font-medium text-white transition hover:bg-violet-400">Сохранить</button></div><div className="mt-4 flex items-center gap-2 text-[11px] text-zinc-500"><span title={siteOk ? 'Сайт доступен' : 'Сайт недоступен'} className={`h-1.5 w-1.5 rounded-full ${siteOk ? 'bg-emerald-300' : 'bg-red-400'}`} /> Сейчас используется {baseUrl.replace('https://', '')}</div></div>

      <div className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><div className="flex items-start gap-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-violet-400/10 text-violet-300"><UserIcon /></div><div><h2 className="text-sm font-medium">Активная сессия</h2><p className="mt-1 text-xs text-zinc-500">Отдельный вход для выбранного профиля.</p></div></div><div className="mt-5 flex items-center gap-2"><div className={`h-2 w-2 rounded-full ${accounts.find(a => Number(a.id) === acc)?.nickname ? 'bg-emerald-300' : 'bg-red-400'}`} /><span className="text-sm text-zinc-300">{accounts.find(a => Number(a.id) === acc)?.nickname ? 'Вход выполнен' : 'Не авторизован'}</span></div><div className="mt-2 text-[11px] text-zinc-500">Профиль {acc} · вкладок: {tabsCount}</div></div>
    </section>

    <section className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><div className="flex items-end justify-between gap-4"><div><h2 className="text-sm font-medium">Профили аккаунтов</h2><p className="mt-1 text-xs text-zinc-500">Добавляйте профили по мере необходимости. Ник появится после входа.</p></div><span className="text-xs text-zinc-600">{accounts.length} {plural(accounts.length, 'профиль', 'профиля', 'профилей')}</span></div><div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"><div><div className="text-xs font-medium text-zinc-200">Переводить все вкладки на выбранный профиль</div><p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">При смене профиля все вкладки перезагрузятся в его сессии. Выключено — переводится только активная вкладка.</p></div><button aria-label="Переводить все вкладки на выбранный профиль" onClick={toggleSwitchAll} className={`relative h-6 w-11 shrink-0 rounded-full transition ${switchAll ? 'bg-violet-500' : 'bg-white/10'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${switchAll ? 'left-5' : 'left-0.5'}`} /></button></div><div className="mt-5 flex flex-wrap gap-3">{accounts.map(profile => { const id = Number(profile.id); const active = acc === id; return <div key={profile.id} className={`group relative flex min-h-[94px] w-[148px] flex-col justify-between rounded-xl border p-3 text-left transition ${active ? 'border-violet-400/70 bg-violet-500/15 shadow-[0_8px_24px_rgba(139,92,246,.16)]' : 'border-white/10 bg-[#0d0e15] hover:border-white/25 hover:bg-white/[0.04]'}`}><button onClick={() => saveAccount(profile.id)} aria-pressed={active} className="min-h-[70px] w-full text-left"><div className={`grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold ${active ? 'bg-violet-400 text-white' : 'bg-white/[0.07] text-zinc-400'}`}>{id}</div><div className={`mt-3 truncate text-xs font-medium ${active ? 'text-white' : 'text-zinc-400'}`}>{profile.nickname || 'Не авторизован'}</div></button>{id !== 1 && <button onClick={() => removeAccount(profile.id)} aria-label="Удалить профиль" title="Удалить профиль" className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded text-zinc-500 hover:bg-red-500/20 hover:text-red-300">×</button>}{active && <div className="absolute right-3 bottom-3 h-1.5 w-1.5 rounded-full bg-emerald-300" />}</div>})}{accounts.length < 5 && <button onClick={addAccount} aria-label="Добавить профиль" title="Добавить профиль" className="grid min-h-[94px] w-[148px] place-items-center rounded-xl border border-dashed border-white/15 bg-white/[0.02] text-zinc-500 transition hover:border-violet-400/50 hover:bg-violet-500/[0.06] hover:text-violet-200"><span className="text-3xl font-light leading-none">+</span><span className="text-xs">Добавить профиль</span></button>}</div></section>

    <section className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#11121b] p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-medium">Версия приложения</h2>{msg && <div className="mt-2 text-xs text-zinc-300">{msg}</div>}</div><button disabled={checking} onClick={async () => { if (updateUrl) { window.api?.appOpenUrl?.(updateUrl); return } setChecking(true); setMsg('Проверяем...'); setUpdateUrl(''); try { const result = await window.api?.appCheckUpdate?.(); if (!result?.ok) setMsg(result?.error || 'Не удалось проверить обновления'); else if (result.newer) { setMsg(`Доступна новая версия v${result.latest}`); setUpdateUrl(result.url || 'https://github.com/Kotecy/Animeon-Desktop/releases') } else { setMsg(`Установлена актуальная v${result.current}`); window.api?.appNotify?.('Установлена последняя версия') } } catch { setMsg('Не удалось проверить обновления') } setChecking(false) }} className="h-10 rounded-xl border border-white/15 bg-white px-4 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-50">{checking ? 'Проверяем...' : updateUrl ? 'Установить новую версию ?' : 'Проверить обновления'}</button></section>

    <section className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><div className="flex items-center justify-between gap-4"><div><span className="block text-sm font-medium">Изменения по версиям</span><span className="mt-1 block text-xs text-zinc-500">История обновлений приложения.</span></div><button onClick={() => setShowChangelog(v => !v)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 transition hover:bg-white/[0.04]">{showChangelog ? 'Скрыть' : 'Посмотреть изменения'}</button></div>{showChangelog && <div className="mt-5 space-y-4">{CHANGELOG.map(release => { const open = expandedLog === release.version; return <div key={release.version}><button onClick={() => setExpandedLog(open ? '' : release.version)} className="flex items-center gap-2 text-left"><span className="text-sm font-semibold text-violet-200">v{release.version}</span><span className="text-[11px] text-zinc-600">{release.date}</span><span className={`text-xs text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span></button>{open && <div className="mt-2 border-l-2 border-violet-400/40 pl-4"><ul className="space-y-1 text-xs text-zinc-400">{release.items.map(item => <li key={item}>• {item}</li>)}</ul></div>}</div> })}</div>}</section>
  </div></div>
}
