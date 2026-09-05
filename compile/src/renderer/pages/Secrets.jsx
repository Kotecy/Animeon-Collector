import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

const CODE_ALIASES = { secret_midnight_start: 'secret_midnight_premiere', secret_exchange: 'secret_equivalent_exchange', secret_midnight_anomaly: 'secret_anomaly_midnight' }
const NAME_ALIASES = { 'ровно в полночь': 'полночная премьера', 'тайминг': 'внахлёст' }
const ACHIEVEMENT_DETAILS = {
  'код на память': {
    description: 'Вверх, вверх, вниз, вниз... дальше ты помнишь.',
    steps: `1. Откройте главную страницу Animeon.
2. Переключите клавиатуру на английскую раскладку.
3. Последовательно нажмите:
↑ ↑ ↓ ↓ ← → ← → B A

Проще всего выполнить с компьютера. На телефоне понадобится экранная клавиатура, способная отправлять стрелки и клавиши B/A.`
  },
  iddqd: {
    description: 'Некоторые коды переживают свои игры.',
    steps: `1. Откройте раздел с аниме.
2. Нажмите на строку поиска тайтлов.
3. Введите IDDQD.
4. Нажмите Enter или кнопку поиска.

Вводить нужно именно в поиск аниме, а не в адресную строку браузера.`
  },
  'не туда свернул': {
    description: 'Иногда самое интересное там, где ничего нет.',
    steps: `1. Откройте любую несуществующую страницу Animeon.
2. Например: https://animeon.cc/2501
3. Дождитесь появления страницы ошибки 404.

Для получения достижения достаточно попасть на страницу 404. Нажимать на призрака не требуется.`
  },
  '13:37': {
    description: 'Одна минута в сутках, которую помнят все.',
    steps: `1. Заранее откройте любую серию.
2. В 13:37 по московскому времени запустите просмотр.
3. Оставьте серию включённой до окончания этой минуты.
4. Убедитесь, что просмотр засчитался сайтом.

Ориентироваться нужно именно на московское время.`
  },
  дежавю: {
    description: 'Один и тот же тайтл целиком. Трижды.',
    steps: `1. Выберите короткий тайтл, желательно состоящий из одной серии.
2. Полностью посмотрите его.
3. Повторите полный просмотр этого же тайтла ещё два раза.
4. Каждый просмотр должен отдельно засчитаться в истории.

В чате использовали тайтл «Чей-то взгляд»: у него одна короткая серия.

Простое обновление страницы не считается. Нужно три раза добиться полного засчитывания просмотра.`
  },
  'три часа ночи': {
    steps: `1. Зайдите на Animeon ночью после 03:00.
2. Побудьте на сайте некоторое время.
3. Повторяйте это в течение семи дней.

Главное условие: семь дней находиться на сайте ночью после 03:00.

Нулевой онлайн не требуется. Ждать, когда на сайте никого не будет, тоже не нужно. Условие про отдельное трёхминутное окно было ошибочным.`
  },
  ровесник: {
    description: 'Кто-то вышел в эфир в один день с тобой.',
    steps: `1. Откройте свой профиль.
2. Посмотрите дату регистрации аккаунта.
3. Найдите аниме с такой датой выхода.
4. Откройте найденный тайтл.
5. Запустите серию и дождитесь, пока просмотр засчитается.

Если достижение не появляется сразу, продолжите просмотр до момента фактического засчитывания серии.

Если в каталоге нет подходящего тайтла, подтверждённого обходного способа пока нет.`
  },
  'первая минута': {
    description: 'Аномалии не спят в полночь.',
    steps: `1. Заранее откройте Animeon.
2. Дождитесь 00:00 по московскому времени.
3. В первую минуту новых суток найдите появившуюся аномальную сущность.
4. Нажмите на неё и заберите.

Не путайте с достижением «Ровно в полночь». Здесь нужно именно поймать аномалию.`
  },
  'полночная премьера': {
    description: 'Новые сутки начинаются с первого кадра.',
    steps: `1. Заранее откройте страницу любой серии.
2. Подготовьте плеер к запуску.
3. Ровно в 00:00 по московскому времени начните просмотр.
4. Убедитесь, что видео действительно запустилось.

Не путайте с «Первой минутой»: здесь нужно начать просмотр, а не ловить аномалию.`
  },
  'все голоса': {
    description: 'У этого тайтла не осталось голоса, которого ты не слышал.',
    steps: `1. Найдите тайтл с несколькими доступными озвучками.
2. Выберите первую озвучку.
3. Посмотрите серию до момента засчитывания просмотра.
4. Переключитесь на следующую озвучку.
5. Повторите это для всех доступных озвучек тайтла.

Простого переключения озвучки недостаточно. Просмотр каждой версии должен отдельно засчитаться в истории.

В чате часто использовали «Чей-то взгляд»: одна серия и несколько озвучек.

У некоторых достижение появлялось с задержкой. После последней озвучки обновите страницу и проверьте профиль.`
  },
  'внахлёст': {
    description: 'Ты закрыл серию ровно в ту минуту, когда вышла следующая.',
    steps: `1. Выберите выходящий онгоинг с известным временем публикации новой серии.
2. Последняя доступная серия не должна быть заранее отмечена просмотренной.
3. Откройте эту серию перед выходом следующей.
4. В минуту публикации новой серии завершите просмотр предыдущей.
5. Дождитесь, пока сайт отметит её просмотренной.

По сообщениям участников, просмотр может засчитываться примерно за минуту до окончания серии.

Если достижение не появилось:
1. Перейдите к эндингу.
2. Завершите просмотр.
3. Обновите страницу.
4. Повторно доведите серию до засчитывания.

Ачивка иногда срабатывает не с первой попытки или появляется с задержкой.`
  },
  'на флажке': {
    description: 'Закрыть последнее задание дня в последнюю минуту суток.',
    steps: `1. Выполните все ежедневные задания, кроме одного.
2. Оставьте на конец самое простое задание.
3. Подготовьте последнее необходимое действие заранее.
4. В 23:59 по московскому времени завершите это задание.
5. Оно должно стать последним закрытым заданием дня.`
  },
  'свидетель патча': {
    description: 'Мир моргнул. Ты это видел.',
    steps: `1. Находиться на Animeon в момент установки обновления сайта.
2. Лучше держать сайт открытым или смотреть серию.
3. После выхода обновления перезагрузить страницу.
4. Проверить список достижений.

Заранее выбрать время выполнения нельзя: достижение зависит от реального выхода обновления.

Нулевой онлайн для этой ачивки не требуется, в чате был случай получения примерно в 23:30 во время обновления сайта.`
  },
  'равноценный обмен': {
    steps: `1. Дождитесь полуночи и начала нового дня.
2. Получите ежедневный бонус.
3. Откройте магазин.
4. Купите том опыта на общую сумму ровно 630 очков.
5. После покупки достижение должно засчитаться.

Секретное достижение выполнять не нужно. Весь способ связан только с ежедневным бонусом и покупкой томов опыта в магазине.

630 — это общая сумма покупки томов опыта, а не количество очков, которое должно появиться после ежедневного бонуса.`
  },
  'ноль в ноль': {
    description: 'Ровно столько. Ни единицей больше.',
    steps: `Точное условие пока не подтверждено.

Основная версия: получить точное круглое значение общего XP без остатка. Например:
1000 XP
2000 XP
10000 XP
100000 XP

Обычная шкала профиля может округлять количество опыта. Для проверки точного значения можно использовать XP Monitor из топика со скриптами.

В чате был случай случайного получения достижения во время просмотра серии, но точное значение XP и последовательность действий тогда не записали.`
  },
  'двадцать четвёртый кадр': {
    description: 'Моргнёшь — пропустишь.',
    steps: `Во время анимации получения другой скрытой ачивки на долю секунды появляется персональный код. Его нужно успеть сохранить и активировать через поиск аниме.

Как выполнить с компьютера:
1. Выберите любую скрытую ачивку, которую ваш аккаунт ещё не получил.
2. До её выполнения запустите NYA Logger.
3. Перезагрузите страницу Animeon.
4. Выполните выбранное скрытое достижение.
5. Дождитесь полной анимации получения.
6. Посмотрите найденный код в панели логгера или выгруженном файле.
7. Введите полученный код в поиск аниме.
8. После правильного ввода кот замурлычет.
9. Проверьте получение «Двадцать четвёртого кадра».

Как выполнить через запись экрана:
1. До получения новой скрытой ачивки включите запись экрана.
2. Выполните достижение.
3. Не закрывайте анимацию сразу.
4. Остановите запись.
5. Просмотрите видео покадрово.
6. Найдите момент появления кода.
7. Перепишите код.
8. Введите его в поиск аниме.

На телефоне проще использовать системную запись экрана. Если вместо сайта записался экран, попробуйте другой браузер или выполните достижение с компьютера через NYA Logger.

Коду у каждого аккаунта свой. Чужой код не подойдёт.

Если анимация уже прошла и код не был сохранён, понадобится другая скрытая ачивка, которую аккаунт ещё не выполнял. Повторное появление кода после уже закрытого достижения работает нестабильно.`
  }
}
const BASE_SECRETS = [
  ['secret_iddqd', 'IDDQD', 'Раздел «Аниме»: ввести IDDQD в поиск, Enter'], ['secret_konami', 'Код на память', 'На главной с компьютера: ↑↑↓↓←→←→BA, английская раскладка'], ['secret_deep_night', 'Три часа ночи', '7 раз зайти около 03:00 МСК, когда на сайте никого нет'], ['secret_rewatch', 'Дежавю', 'Полностью посмотреть один тайтл трижды'], ['secret_leet_minute', '13:37', 'Смотреть аниме в 13:37 по Москве'], ['secret_not_found', 'Не туда свернул', 'Открыть несуществующую страницу (ошибка 404)'], ['secret_round_xp', 'Ноль в ноль', 'Круглый общий опыт (например, 1000 или 2000 XP)'], ['secret_witness', 'Свидетель патча', 'Быть на сайте в момент установки обновления'], ['secret_midnight_start', 'Полночная премьера', 'Начать просмотр аниме ровно в 00:00 МСК'], ['secret_same_day_release', 'Ровесник', 'Начать смотреть аниме, вышедшее в день твоей регистрации'], ['secret_frame_24', 'Двадцать четвёртый кадр', 'Код из анимации другой секретки — в поиск на главной'], ['secret_exchange', 'Равноценный обмен', 'Потратить ровно столько монеток, сколько заработал после 00:00'], ['secret_binge_finish', 'Тайминг', 'Досмотреть к релизу новой серии'], ['secret_midnight_anomaly', 'Первая минута', 'Поймать аномальную сущность ровно в 00:00 МСК'], ['secret_nine_lives', 'Девять жизней', 'Собрать 9 кодов формата NYA-****-****'], ['secret_2501', '2501', 'Пройти 2 этап в терминале'], ['secret_thousand_minus_seven', '1000-7', 'Вписать в консоль 1000-7'], ['secret_last_second', 'На флажке', 'Завершить последнее задание дня в 23:59 МСК'], ['secret_third_september', 'Третье сентября', 'Я календарь переверну — и снова третье сентября.'], [null, 'Все голоса', 'Минимум по серии в каждой озвучке одного тайтла'], [null, 'Внахлёст', 'Закончить последнюю серию в момент выхода новой']
].filter(([, name]) => name !== 'Тайминг').map(([code, name, desc], index) => { const resolved = CODE_ALIASES[code] || code; return { code: resolved, key: resolved || `community_${index}`, name, desc, category: 'standard' } })
const IMPOSSIBLE_SECRETS = [{ key: 'impossible_first_key', code: null, name: 'Первый ключ', desc: 'Ты был первым. Это уже не изменить.', category: 'impossible', serial: '№001', holder: 'kattwod' }]
const OBSOLETE = new Set(['secret_anniversary', 'secret_registration_date', 'secret_registration', 'secret_quest_deadline', 'secret_midnight_start', 'secret_exchange', 'secret_midnight_anomaly'])

const rawCodeOf = item => {
  const direct = item?.code || item?.slug || item?.achievement_code || item?.achievement_key || item?.achievementKey
  const key = String(item?.key || '').trim()
  return String(direct || (isSecretCode(key.toLowerCase()) ? key : '')).trim().toLowerCase()
}
const codeOf = item => CODE_ALIASES[rawCodeOf(item)] || rawCodeOf(item)
const rawNameOf = item => String(item?.name || item?.title || item?.achievement_name || '').trim()
const nameOf = item => { const name = rawNameOf(item).toLowerCase(); return NAME_ALIASES[name] || name }
const detailsFor = item => ACHIEVEMENT_DETAILS[nameOf(item)] || null
const isSecretCode = code => code.startsWith('secret_') || code.startsWith('secret-')
const isCompleted = item => item?.completed === true || item?.is_completed === true || item?.isCompleted === true || item?.unlocked === true || item?.status === 'completed' || Boolean(item?.unlocked_at || item?.completed_at || item?.received_at)
const isImpossible = item => item?.category === 'impossible' || nameOf(item) === 'первый ключ'
const isSecretRemote = item => {
  const kind = String(item?.type || item?.category || item?.group || '').toLowerCase()
  return isSecretCode(codeOf(item)) || item?.is_secret === true || item?.isSecret === true || kind === 'secret' || kind === 'secrets'
}

// Не используем key интерфейса как код API. Если сайт отдаст секретку без
// secret_*, фиксируем её по имени и не теряем при следующих синхронизациях.
const collectRemoteSecrets = (value, found = new Map(), seen = new WeakSet(), parentKey = '') => {
  const inheritedCode = isSecretCode(String(parentKey).toLowerCase()) ? String(parentKey).trim().toLowerCase() : ''
  if (value === null || value === undefined) return found
  if (typeof value !== 'object') {
    if (inheritedCode && value !== false && value !== 0 && value !== '') found.set(inheritedCode, { code: inheritedCode, received: true })
    return found
  }
  if (seen.has(value)) return found
  seen.add(value)
  if (Array.isArray(value)) { value.forEach((item, index) => collectRemoteSecrets(item, found, seen, String(index))); return found }
  const code = codeOf(value) || inheritedCode
  const candidate = code && !codeOf(value) ? { ...value, code } : value
  const name = nameOf(candidate)
  if (isSecretRemote(candidate) && !OBSOLETE.has(code)) found.set(code || `name:${name}`, candidate)
  Object.entries(value).forEach(([key, item]) => collectRemoteSecrets(item, found, seen, key))
  return found
}

const LockIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
const SparkIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Z"/><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z"/></svg>

function CursorHint({ hint }) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState(null)
  const details = detailsFor(hint?.item)

  useLayoutEffect(() => {
    if (!hint || !panelRef.current) { setPosition(null); return }
    const bounds = panelRef.current.getBoundingClientRect()
    const padding = 14
    const gap = 18
    const leftOfCursor = hint.x - gap - bounds.width
    const left = leftOfCursor >= padding
      ? leftOfCursor
      : Math.min(hint.x + gap, Math.max(padding, window.innerWidth - bounds.width - padding))
    const top = Math.min(Math.max(padding, hint.y - 18), Math.max(padding, window.innerHeight - bounds.height - padding))
    setPosition({ left, top })
  }, [hint?.item?.key, hint?.x, hint?.y])

  if (!details || !hint) return null
  return <aside ref={panelRef} aria-live="polite" style={{ left: position?.left ?? hint.x, top: position?.top ?? hint.y, visibility: position ? 'visible' : 'hidden' }} className="pointer-events-none fixed z-[100] w-[min(440px,calc(100vw-28px))] rounded-2xl border border-violet-200/20 bg-[#10111a]/80 px-4 py-3 text-xs leading-relaxed text-zinc-100 shadow-[0_22px_60px_rgba(0,0,0,.48)] backdrop-blur-xl">
    <div className="mb-3 flex items-center gap-2 border-b border-white/[0.08] pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-200"><span className="grid h-5 w-5 place-items-center rounded-full border border-violet-300/45 text-[11px] normal-case">?</span> Инструкция</div>
    {details.description && <p className="mb-3"><span className="font-medium text-zinc-400">Описание:</span> {details.description}</p>}
    <p className="whitespace-pre-line"><span className="font-medium text-zinc-400">Как выполнить:</span>{`\n${details.steps}`}</p>
  </aside>
}

function ImpossibleCard({ item }) {
  const openHolder = () => window.api?.tabsCreate?.(`https://v2.animeon.co/user/${item.holder}`)
  return <article className="relative isolate overflow-hidden rounded-2xl border border-amber-200/30 bg-[#15120d] p-6 shadow-[0_18px_55px_rgba(0,0,0,.28)]"><div aria-hidden className="absolute -right-5 -top-9 font-serif text-[160px] leading-none text-amber-100/[0.045]">001</div><div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/75 to-transparent" /><div className="relative"><div className="flex items-start justify-between gap-4"><div className="grid h-11 w-11 place-items-center rounded-xl border border-amber-200/25 bg-amber-100/[0.07] font-serif text-xl text-amber-100">∞</div><div className="text-right"><div className="font-mono text-[10px] tracking-[0.2em] text-amber-200/60">ЕДИНСТВЕННАЯ В МИРЕ</div><div className="mt-1 text-[11px] text-zinc-500">{item.serial}</div></div></div><h2 className="mt-7 font-serif text-2xl tracking-tight text-[#fff8e8]">{item.name}</h2><p className="mt-2 max-w-md text-sm leading-relaxed text-amber-50/70">{item.desc}</p><div className="mt-7 flex items-center justify-between border-t border-amber-100/[0.12] pt-3 text-[11px]"><span className="text-zinc-500">Владелец: <button onClick={openHolder} title={`Открыть профиль ${item.holder}`} className="text-amber-100/75 transition hover:text-amber-100">{item.holder}</button></span><span className="font-medium text-amber-200">недостижима</span></div></div></article>
}

export default function Secrets() {
  const [achievements, setAchievements] = useState(null)
  const [catalog, setCatalog] = useState([...BASE_SECRETS, ...IMPOSSIBLE_SECRETS])
  const [synced, setSynced] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [cursorHint, setCursorHint] = useState(null)

  const showCursorHint = (event, item) => {
    if (!detailsFor(item)) return
    setCursorHint({ item, x: event.clientX, y: event.clientY })
  }
  const hideCursorHint = () => setCursorHint(null)

  const mergeCatalog = (previous, remote) => {
    const next = [...previous]
    remote.forEach(item => {
      const index = next.findIndex(secret => (item.code && codeOf(secret) === item.code) || (nameOf(secret) && nameOf(secret) === nameOf(item)))
      if (index >= 0) next[index] = { ...next[index], ...item, category: isImpossible(next[index]) ? 'impossible' : item.category }
      else next.push(item)
    })
    return next
  }

  const sync = async () => {
    setLoading(true); setError('')
    try {
      const result = await window.api?.achievementsFetch()
      if (!result?.ok) { setError(result?.error || 'Нет вкладки или не выполнен вход'); return }
      setAchievements(result.data)
      const remote = [...collectRemoteSecrets(result.data)].map(([identity, item]) => {
        const code = codeOf(item), name = rawNameOf(item) || code || 'Неизвестная секретка'
        return { key: code || identity, sourceIdentity: identity, code: code || null, name, desc: String(item?.description || item?.desc || item?.hint || 'Секретка из профиля Animeon'), received: true, completed: isCompleted(item), category: isImpossible(item) ? 'impossible' : 'standard' }
      })
      setCatalog(previous => {
        const next = mergeCatalog(previous, remote)
        window.api?.storeSet?.('secretsCatalog', next)
        return next
      })
      setSynced(true)
    } catch (reason) { setError(String(reason)) } finally { setLoading(false) }
  }

  useEffect(() => {
    const bootstrap = async () => {
      const saved = await window.api?.storeGet?.('secretsCatalog')
      if (Array.isArray(saved) && saved.length) {
        const savedSecrets = saved.filter(item => !OBSOLETE.has(codeOf(item)) && (item?.received || isSecretCode(codeOf(item)) || isImpossible(item) || !codeOf(item)))
        setCatalog(mergeCatalog([...BASE_SECRETS, ...IMPOSSIBLE_SECRETS], savedSecrets))
      }
      await sync()
    }
    bootstrap()
  }, [])

  const remoteEntries = useMemo(() => [...collectRemoteSecrets(achievements)].map(([identity, item]) => ({ identity, code: codeOf(item), name: nameOf(item), item })), [achievements])
  const allSecrets = useMemo(() => catalog.filter(item => item?.key && !OBSOLETE.has(codeOf(item))), [catalog])
  const standardSecrets = useMemo(() => allSecrets.filter(item => !isImpossible(item)), [allSecrets])
  const impossibleSecrets = useMemo(() => allSecrets.filter(isImpossible), [allSecrets])
  const stateFor = item => {
    const code = codeOf(item), name = nameOf(item)
    const remote = remoteEntries.find(entry => (code && entry.code === code) || (name && entry.name === name))
    const done = Boolean(item.received || remote)
    return { ...item, code, done, visibleCode: synced && done && code ? code : '······' }
  }
  const displayed = useMemo(() => standardSecrets.map(stateFor).filter(item => filter === 'all' || (filter === 'done' ? item.done : !item.done)).sort((a, b) => Number(b.done) - Number(a.done)), [standardSecrets, remoteEntries, synced, filter])
  const received = standardSecrets.filter(item => stateFor(item).done).length
  const percent = standardSecrets.length ? Math.round(received / standardSecrets.length * 100) : 0

  return <div className="h-full overflow-auto px-6 py-6 text-white"><div className="mx-auto max-w-[920px] space-y-5">
    <header className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end"><div><div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-violet-300/80"><SparkIcon /> Коллекция открытий</div><h1 className="mt-2 text-[28px] font-semibold tracking-tight">Секреты</h1><p className="mt-1 text-sm text-zinc-400">Скрытые задания Animeon, которые уже удалось найти.</p></div><button onClick={sync} disabled={loading} className="h-10 rounded-xl bg-white px-4 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-50">{loading ? 'Синхронизация...' : 'Синхронизировать'}</button></header>
    {error && <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-300">{error}. Откройте Animeon и войдите в аккаунт.</div>}
    <section className="grid gap-4 rounded-2xl border border-white/10 bg-[#141521] p-5 sm:grid-cols-[1fr_170px] sm:items-center"><div><div className="flex items-center gap-2 text-xs text-zinc-400"><LockIcon /> Прогресс коллекции</div><div className="mt-2 flex items-end gap-3"><span className="text-4xl font-semibold tracking-tight">{received}</span><span className="pb-1 text-sm text-zinc-500">из {standardSecrets.length} секретов</span></div><div role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent} className="mt-4 h-2.5 overflow-hidden rounded-full bg-[#292a38]"><div className="h-full rounded-full bg-violet-400 shadow-[0_0_12px_rgba(167,139,250,.65)] transition-[width] duration-500" style={{ width: `${percent}%` }} /></div></div><div className="text-left sm:text-right"><div className="text-3xl font-semibold text-violet-200">{percent}%</div><div className="mt-1 text-xs text-zinc-500">{synced ? 'синхронизировано' : 'ожидает входа'}</div></div></section>
    <div className="flex flex-wrap items-center gap-2"><span className="mr-2 text-xs text-zinc-500">Показывать:</span>{[['all', 'Все'], ['done', 'Полученные'], ['open', 'Не полученные'], ['impossible', 'Невозможные']].map(([id, label]) => <button key={id} onClick={() => setFilter(id)} className={`rounded-lg border px-3 py-2 text-xs transition ${filter === id ? (id === 'impossible' ? 'border-amber-200/45 bg-amber-100/[0.08] text-amber-100' : 'border-violet-400/50 bg-violet-500/15 text-violet-200') : 'border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white'}`}>{label}</button>)}</div>
    {filter === 'impossible' ? <section className="space-y-3">{impossibleSecrets.map(item => <ImpossibleCard key={item.key} item={item} />)}</section> : <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{displayed.map((item, index) => <article key={item.key || item.code} className={`relative rounded-xl border p-4 transition ${item.done ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-white/10 bg-[#11121b] hover:border-violet-400/30'}`}><div className="flex items-start justify-between gap-3"><div className={`grid h-9 w-9 place-items-center rounded-lg ${item.done ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.06] text-zinc-500'}`}>{item.done ? '✓' : <LockIcon />}</div><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-zinc-600">#{String(index + 1).padStart(2, '0')}</span>{detailsFor(item) && <span title="Наведите на ? для инструкции" onMouseEnter={event => showCursorHint(event, item)} onMouseLeave={hideCursorHint} className="grid h-5 w-5 cursor-help place-items-center rounded-full border border-violet-300/35 text-[11px] font-medium text-violet-200/80 transition hover:border-violet-200 hover:bg-violet-300/10 hover:text-violet-100">?</span>}</div></div><h2 className="mt-4 text-sm font-medium text-white">{item.name}</h2><p className="mt-1 min-h-[34px] text-xs leading-relaxed text-zinc-400">{item.desc}</p><div className="mt-4 flex items-center justify-between border-t border-white/[0.07] pt-3"><code className="text-[10px] text-zinc-500">{item.visibleCode}</code><span className={`text-[10px] font-medium ${item.done ? 'text-emerald-300' : 'text-zinc-500'}`}>{item.done ? 'получено' : 'не открыто'}</span></div></article>)}</section>}
    <CursorHint hint={cursorHint} />
    {synced && <p className="text-xs text-zinc-500">Данные получены из текущей сессии Animeon.</p>}
  </div></div>
}
