import { useEffect, useRef, useState } from 'react'

const SoundOnIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" stroke="none" /><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" /><path d="M18 7a7 7 0 0 1 0 10" /></svg>
)
const SoundOffIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z" fill="currentColor" stroke="none" /><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" /></svg>
)
const PinIcon = ({ filled = false }) => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4h6l-.8 5 3.3 3.3v1.2H6.5v-1.2L9.8 9 9 4Z" /><path d="M12 13.5V21" /></svg>
)

export default function TabStrip({ tabs=[], order=[], activeId, onReorder, onSwitch, baseUrl }) {
  const [dragId, setDragId] = useState(null)
  const [address, setAddress] = useState('')
  const [addressError, setAddressError] = useState('')
  // State badges smoothly fade out after 5s without mouse activity.
  const lastActive = useRef(Date.now())
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const timer = setInterval(() => { setIdle(Date.now() - lastActive.current > 5000) }, 1000)
    return () => clearInterval(timer)
  }, [])
  const poke = () => { lastActive.current = Date.now(); setIdle(false) }
  const ordered = order.map(id => tabs.find(t => t.id===id)).filter(Boolean)
  const display = ordered.length ? ordered : tabs
  const activeTab = tabs.find(t => t.id === activeId)
  useEffect(() => { setAddress(activeTab?.url || ''); setAddressError('') }, [activeId, activeTab?.url])

  const onDragStart = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed='move' }
  const onDragOver = (e, id) => {
    e.preventDefault()
    if (!dragId || dragId===id) return
    const newOrder = [...(order.length?order:tabs.map(t=>t.id))]
    const from = newOrder.indexOf(dragId), to = newOrder.indexOf(id)
    if (from===-1||to===-1) return
    newOrder.splice(from,1); newOrder.splice(to,0,dragId)
    onReorder(newOrder)
    window.api?.tabsReorder(newOrder)
  }
  const toggleMute = (e, id) => { e.stopPropagation(); window.api?.tabsToggleMuted(id) }
  const togglePin = (e, id) => { e.stopPropagation(); window.api?.tabsTogglePinned(id) }
  const closeTab = (e, id) => { e.stopPropagation(); window.api?.tabsClose(id) }
  const closeTabWithMiddleClick = (e, id) => {
    if (e.button !== 1) return
    e.preventDefault()
    closeTab(e, id)
  }
  const submitAddress = async (e) => {
    e.preventDefault()
    if (!activeId) return
    const result = await window.api?.tabsNavigate?.(activeId, address)
    if (!result?.ok) {
      setAddressError(result?.error || 'Введите корректный адрес Animeon.')
      setAddress(activeTab?.url || baseUrl || 'https://v2.animeon.co')
      return
    }
    setAddress(result.url || address)
    setAddressError('')
  }
  const soundBadge = (t) => (
    <button title={t.muted ? 'Включить звук вкладки' : 'Отключить звук вкладки'} onClick={(e) => toggleMute(e, t.id)} className={`w-5 h-5 grid place-items-center rounded ${t.muted ? 'text-zinc-200' : 'text-violet-300'}`}>
      {t.muted ? <SoundOffIcon /> : <SoundOnIcon />}
    </button>
  )

  return (
    <div onMouseMove={poke} className="flex h-11 shrink-0 items-center overflow-hidden border-b border-white/[0.07] bg-[#0d0e15]">
      <div onWheel={e => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.currentTarget.scrollLeft += e.deltaY
          e.preventDefault()
        }
      }} className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {display.map(t => {
        const active = activeId===t.id
        const sounding = !!(t.muted || t.audible)
        return (
        <div key={t.id} draggable onDragStart={e=>onDragStart(e,t.id)} onDragOver={e=>onDragOver(e,t.id)}
          onClick={() => onSwitch?.(t.id)}
          onAuxClick={e => closeTabWithMiddleClick(e, t.id)}
          className={`group relative flex items-center gap-1.5 h-8 pl-2.5 pr-2 rounded-md border text-[12px] shrink-0 cursor-grab active:cursor-grabbing max-w-[200px] transition-all duration-200 ${active ? 'bg-[#26213a] border-violet-400/30 text-white shadow-[inset_0_1px_0_rgba(255,255,255,.08)]' : 'bg-[#171822] border-white/[0.06] text-zinc-400 hover:text-white hover:bg-[#232434] hover:border-violet-400/20 hover:shadow-[0_0_14px_rgba(139,92,246,.10)]'}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? 'bg-fuchsia-400 shadow-[0_0_8px_#d946ef]' : 'bg-zinc-600'}`} />
          <span className="truncate min-w-0">{t.title || t.url}</span>
          {!active && (t.pinned || sounding) && (
            <div className={`absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md px-0.5 py-0.5 bg-[#171822] shadow-[0_2px_10px_rgba(0,0,0,.5)] transition-opacity duration-300 group-hover:opacity-0 group-hover:pointer-events-none ${idle ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              {sounding && soundBadge(t)}
              {t.pinned && (
                <button title="Открепить вкладку" onClick={(e) => togglePin(e, t.id)} className="w-5 h-5 grid place-items-center rounded text-zinc-200">
                  <PinIcon filled />
                </button>
              )}
            </div>
          )}
          <div className={`${active ? 'opacity-100' : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'} flex absolute right-1 top-1/2 -translate-y-1/2 items-center gap-0.5 rounded-md px-0.5 py-0.5 transition-opacity duration-200 ${active ? 'bg-[#26213a] shadow-[0_2px_10px_rgba(0,0,0,.5)]' : 'bg-[#171822] shadow-[0_2px_10px_rgba(0,0,0,.5)]'}`}>
            {active && (
              <button title={t.pinned ? 'Открепить вкладку' : 'Закрепить вкладку'} onClick={(e) => togglePin(e, t.id)} className={`h-5 grid place-items-center transition-all duration-200 w-0 opacity-0 pointer-events-none overflow-hidden group-hover:w-5 group-hover:opacity-100 group-hover:pointer-events-auto rounded hover:bg-white/10 shrink-0 ${t.pinned ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-200'}`}>
                <PinIcon filled={t.pinned} />
              </button>
            )}
            {active && (
              <button title={t.muted ? 'Включить звук вкладки' : 'Отключить звук вкладки'} onClick={(e) => toggleMute(e, t.id)} className={`h-5 grid place-items-center transition-all duration-200 w-0 opacity-0 pointer-events-none overflow-hidden group-hover:w-5 group-hover:opacity-100 group-hover:pointer-events-auto rounded hover:bg-white/10 shrink-0 ${t.muted ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-200'}`}>
                {t.muted ? <SoundOffIcon /> : <SoundOnIcon />}
              </button>
            )}
            {!active && sounding && soundBadge(t)}
            {!t.pinned && <button title="Закрыть вкладку" onClick={(e) => closeTab(e, t.id)} className="w-5 h-5 grid place-items-center rounded hover:bg-white/10 shrink-0 text-[13px]">×</button>}
          </div>
        </div>
        )
      })}
      {display.length < 5 && (
        <button title="Новая вкладка" onClick={() => window.api?.tabsCreate(baseUrl || 'https://v2.animeon.co')} className="w-8 h-8 grid place-items-center rounded-md bg-[#1c1d29] border border-white/10 text-zinc-400 hover:text-white hover:bg-violet-500/20 shrink-0">+</button>
      )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 border-l border-white/[0.07] px-3">
      <form onSubmit={submitAddress} className="relative hidden w-[220px] items-center lg:flex 2xl:w-[340px]">
        <svg className="pointer-events-none absolute left-2.5 text-zinc-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.2 4.2"/></svg>
        <input value={address} onChange={e => { setAddress(e.target.value); setAddressError('') }} aria-label="Адрес Animeon" title={addressError || 'Введите адрес Animeon и нажмите Enter'} placeholder="animeon.co" className={`h-8 w-full rounded-md border bg-[#11121b] py-1 pl-8 pr-2 text-[11px] text-zinc-300 outline-none transition placeholder:text-zinc-600 ${addressError ? 'border-red-400/70' : 'border-white/10 focus:border-violet-400/60'}`} />
      </form>
      <button title="Перезагрузить страницу (F5)" onClick={() => window.api?.tabsReloadActive?.()} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-white/10 bg-[#171822] text-zinc-400 transition hover:border-violet-400/40 hover:text-white">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 11a8 8 0 1 0 2 5.3"/><path d="M20 4v7h-7"/></svg>
      </button>
      </div>
    </div>
  )
}
