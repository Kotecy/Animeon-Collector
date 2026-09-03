import iconUrl from '../icon.png'

export default function Titlebar({ collapsed, onToggleSidebar, version }) {
  const win = () => window.api
  return (
    <div className="h-11 flex items-center gap-3 px-3 bg-[#0d0e15] select-none shrink-0 border-b border-white/[0.07] rounded-tr-[16px]" style={{ WebkitAppRegion: 'drag' }}>
      <button onClick={onToggleSidebar} className="w-7 h-7 grid place-items-center rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white shrink-0" style={{ WebkitAppRegion: 'no-drag' }}>
        <span className="text-base leading-none">{collapsed ? '›' : '‹'}</span>
      </button>
      <div className="flex items-center gap-2.5 min-w-0">
        <img src={iconUrl} alt="logo" className="w-7 h-7 rounded-lg object-cover shrink-0" />
        <div className="leading-none hidden sm:block">
          <div className="text-[13px] font-semibold tracking-[0]">Animeon</div>
          <div className="text-[10px] text-zinc-500 -mt-0.5">Desktop · v{version || '...'}</div>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-0">
        <button onClick={() => win()?.winMinimize?.()}
          className="win-btn w-[46px] h-11 grid place-items-center text-zinc-400 rounded-none">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1"/></svg>
        </button>
        <button onClick={() => win()?.winMaximize?.()}
          className="win-btn w-[46px] h-11 grid place-items-center text-zinc-400 rounded-none">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x="0.5" y="0.5" width="9" height="9" rx="1"/></svg>
        </button>
        <button onClick={() => win()?.winClose?.()}
          className="win-btn w-[46px] h-11 grid place-items-center text-zinc-400 rounded-none">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><line x1="0" y1="0" x2="10" y2="10"/><line x1="10" y1="0" x2="0" y2="10"/></svg>
        </button>
      </div>
    </div>
  )
}
