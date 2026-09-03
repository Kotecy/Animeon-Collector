import { useEffect, useState } from 'react'
import anomalySoundUrl from '../assets/AnomalyDetected.mp3?inline'

const RadarIcon = ({ size = 20 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 12 18.3 5.7" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><path d="M12 3.5v1M3.5 12h1M19.5 12h1M12 19.5v1" /></svg>
const BellIcon = ({ size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
export default function Dashboard({ events = [], pushEvent = () => {}, fbCheck = 0, fbSummary = null }) {
  const [watching, setWatching] = useState(false)
  const [sound, setSound] = useState(true)
  const [toastOn, setToastOn] = useState(true)
  const [detCount, setDetCount] = useState(0)
  const [detLastAt, setDetLastAt] = useState(0)
  const [follow, setFollow] = useState(false)
  const [fbCheckState, setFbCheckState] = useState(0)
  const [tabsCount, setTabsCount] = useState(0)
  const [nowTs, setNowTs] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNowTs(Date.now()), 1000); return () => clearInterval(t) }, [])
  const lastCheckTs = fbCheck || fbCheckState
  const remainMs = lastCheckTs ? lastCheckTs + 180000 - nowTs : null
  const remainText = remainMs == null ? '----' : remainMs > 0 ? `${String(Math.floor(remainMs / 60000)).padStart(2, '0')}:${String(Math.floor(remainMs % 60000 / 1000)).padStart(2, '0')}` : 'проверка идёт…'

  // Только статус (тумблер + время последней проверки). Событие «Взаимная
  // подписка» пушит App мгновенно по followback:done — дубли здесь не нужны.
  const refreshFollowStatus = async () => {
    try {
      const s = await window.api?.storeGetAll()
      if (!s) return
      setFollow(!!s.followBackEnabled)
      setFbCheckState(Number(s.followbackLastCheck) || 0)
    } catch {}
  }
  useEffect(() => { refreshFollowStatus(); const t = setInterval(refreshFollowStatus, 30000); return () => clearInterval(t) }, [])

  const refreshDetector = async () => {
    try {
      const s = await window.api?.storeGetAll()
      const d = s?.detector || {}
      setWatching(!!d.watching); setSound(d.sound !== false); setToastOn(d.toast !== false)
      setDetCount(Number(d.count) || 0); setDetLastAt(Number(d.lastAt) || 0)
      setFollow(!!s.followBackEnabled); setTabsCount((s.tabs || []).length)
    } catch {}
  }
  useEffect(() => {
    refreshDetector()
    window.api?.onDetectorUpdated?.(d => {
      if (!d) return
      setWatching(!!d.watching); setSound(d.sound !== false); setToastOn(d.toast !== false)
      setDetCount(Number(d.count) || 0); setDetLastAt(Number(d.lastAt) || 0)
    })
    window.api?.onTabsUpdated?.(t => setTabsCount(t.length))
  }, [])

  const toggleWatch = async () => {
    const d = await window.api?.detectorToggle()
    if (d) { setWatching(!!d.watching); setDetCount(Number(d.count) || 0); setDetLastAt(Number(d.lastAt) || 0); pushEvent(d.watching ? 'Наблюдение включено' : 'Наблюдение выключено') }
  }
  const toggleSound = async () => {
    const d = await window.api?.detectorSound()
    if (d) setSound(d.sound !== false)
  }
  const toggleToast = async () => {
    const d = await window.api?.detectorToast()
    if (d) setToastOn(d.toast !== false)
  }
  const testSound = async () => {
    try { const a = new Audio(anomalySoundUrl); a.volume = 1; await a.play() } catch { pushEvent('Звук заблокирован — кликни по окну один раз') }
  }

  return <div className="h-full overflow-auto px-6 py-6 text-white"><div className="max-w-[920px] mx-auto space-y-5">
    <header className="grid gap-4 md:grid-cols-[1fr_220px] md:items-end"><div><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-violet-300/80"><RadarIcon size={14} /> Наблюдение</div><h1 className="mt-2 text-[28px] font-semibold tracking-tight">Детектор аномалий</h1><p className="mt-1 text-sm text-zinc-400">Замечает аномалии и зовёт тебя.</p></div><div className="relative h-24 overflow-hidden rounded-xl border border-white/10 bg-[#10111a] p-2"><svg viewBox="0 0 220 88" preserveAspectRatio="xMidYMid meet" className="h-full w-full text-violet-300/80" fill="none" aria-hidden="true"><circle cx="166" cy="44" r="29" stroke="currentColor" strokeOpacity=".22"/><circle cx="166" cy="44" r="18" stroke="currentColor" strokeOpacity=".45"/><circle cx="166" cy="44" r="5" fill="currentColor" fillOpacity=".85" stroke="none"/><path d="M166 44 202 18" stroke="currentColor" strokeOpacity=".7"/><path d="M28 68h78" stroke="#34d399" strokeOpacity=".45"/><path d="M28 58h48" stroke="currentColor" strokeOpacity=".35"/><circle cx="202" cy="18" r="3" fill="#34d399" stroke="none"/></svg><div className="absolute bottom-2 left-3 text-[10px] text-zinc-500">Следит во всех вкладках</div></div></header>
    <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#141521] p-5 shadow-[0_18px_50px_rgba(0,0,0,.25)]"><div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" /><div className="relative grid gap-6 lg:grid-cols-[1fr_260px] lg:items-center"><div><div className="flex items-center gap-3"><div className={`grid h-12 w-12 place-items-center rounded-xl border ${watching ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-white/10 bg-white/[0.04] text-zinc-400'}`}><RadarIcon size={22} /></div><div><div className={`text-sm font-medium ${watching ? 'text-emerald-300' : 'text-zinc-300'}`}>{watching ? 'Наблюдаю' : 'Выключен'}</div><div className="text-xs text-zinc-500">{watching ? 'Позову звуком и тостом, собирать будешь сам' : 'Включи, когда откроешь AnimeOn'}</div></div></div><div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4"><div><div className="text-4xl font-semibold tracking-tight">{detCount}</div><div className="mt-1 text-xs text-zinc-500">замечено всего</div></div><div><div className="text-2xl font-semibold text-emerald-300">{detLastAt ? new Date(detLastAt).toLocaleTimeString() : '—'}</div><div className="mt-1 text-xs text-zinc-500">последняя находка</div></div></div></div><div className="flex flex-col gap-2"><button onClick={toggleWatch} className={`flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition ${watching ? 'border border-white/15 bg-white text-black hover:bg-zinc-200' : 'bg-emerald-500 text-white shadow-[0_10px_30px_rgba(52,211,153,.28)] hover:bg-emerald-400'}`}><BellIcon size={17} /> {watching ? 'Выключить' : 'Включить наблюдение'}</button><div className="flex gap-2"><button onClick={toggleSound} className={`flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-xs transition ${sound ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'}`}>Звук: {sound ? 'вкл' : 'выкл'}</button><button onClick={testSound} className="flex h-10 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-400 transition hover:text-white">Проверить звук</button></div><button onClick={toggleToast} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-left transition hover:border-white/20"><span><span className="block text-xs font-medium text-zinc-200">Всплывающее уведомление</span><span className="mt-0.5 block text-[11px] text-zinc-500">Показывать окно поверх сайта при находке</span></span><span className={`relative h-6 w-11 shrink-0 rounded-full transition ${toastOn ? 'bg-emerald-500' : 'bg-white/10'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${toastOn ? 'left-5' : 'left-0.5'}`} /></span></button></div></div></section>
    <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]"><section className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-medium">Вкладки</h2><p className="mt-1 text-xs text-zinc-500">Детектор следит за аномалиями во всех открытых вкладках сайта.</p></div><div className="rounded-lg bg-violet-500/15 px-2.5 py-1.5 text-sm font-semibold text-violet-200">{tabsCount}</div></div></section><section className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-medium">Автоподписка</h2><p className="mt-1 text-xs leading-relaxed text-zinc-500">Подписываться в ответ на новых фолловеров.</p></div><button aria-label="Переключить автоподписку" onClick={async () => { setFollow(!!(await window.api?.followbackToggle())); refreshFollowStatus() }} className={`relative mt-1 h-6 w-11 rounded-full transition ${follow ? 'bg-violet-500' : 'bg-white/10'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${follow ? 'left-5' : 'left-0.5'}`} /></button></div>{follow && <div className="mt-3 text-[11px] text-zinc-500">Последняя проверка: {lastCheckTs ? new Date(lastCheckTs).toLocaleTimeString() : 'ещё не было'}</div>}{follow && <div className="mt-1.5 text-[11px] text-zinc-500">Следующая проверка через: {remainText}</div>}</section></div>
    <section className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]"><div className="rounded-2xl border border-white/10 bg-[#11121b] p-5"><h2 className="text-sm font-medium">Последние действия</h2><div className="mt-4 h-[152px] space-y-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{events.length ? events.map(event => <div key={event.id} className="flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs"><span className="text-zinc-300">{event.text}</span><span className="text-zinc-600">{event.time}</span></div>) : <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-xs text-zinc-500">Здесь появится журнал работы после запуска.</div>}</div></div><div className="flex flex-col rounded-2xl border border-emerald-400/15 bg-emerald-500/[0.07] p-5"><div className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-200/80">Как это работает</div><p className="mt-3 break-words text-sm leading-relaxed text-zinc-300">Нашли аномалию — позовём звуком и окном. Награду забираешь сам, страницу не трогаем.</p><div className="mt-auto flex items-center gap-2 pt-4 text-xs text-emerald-200"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" /> Все вкладки под наблюдением</div></div></section>
  </div></div>
}
