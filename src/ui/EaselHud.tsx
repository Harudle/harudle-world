import { EASEL_COLOR_NAMES, EASEL_PALETTE } from '../data/easel'

const PILL =
  'pointer-events-auto min-h-11 cursor-pointer rounded-full border-2 border-ink px-4 py-2 font-display text-ink shadow-[3px_3px_0_var(--color-ink)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600'

type EaselHudProps = {
  /** 내가 붓을 들고 있는지 */
  holding: boolean
  /** 바닥의 붓을 주울 수 있는 거리인지 */
  nearBrush: boolean
  nearEasel: boolean
  color: number
  onColorChange: (color: number) => void
  onPick: () => void
  onDrop: () => void
  onClear: () => void
}

/** 이젤 붓 줍기 버튼과, 붓을 든 동안 쓰는 물감 고르기 막대. 알림 줄(top-20) 아래에 둔다. */
export function EaselHud({ holding, nearBrush, nearEasel, color, onColorChange, onPick, onDrop, onClear }: EaselHudProps) {
  if (!holding) {
    if (!nearBrush) return null
    return (
      <div className="pointer-events-none absolute top-32 right-0 left-0 z-10 flex justify-center px-4">
        <button type="button" onClick={onPick} className={`${PILL} bg-butter`}>
          🖌️ 이젤 붓 줍기
        </button>
      </div>
    )
  }

  // 이젤을 가리지 않도록 화면 왼쪽 가운데에 세로로 둔다.
  return (
    <div
      role="toolbar"
      aria-label="이젤 물감"
      aria-orientation="vertical"
      className="pointer-events-auto absolute top-1/2 left-[calc(1rem+env(safe-area-inset-left))] z-10 flex w-28 -translate-y-1/2 flex-col items-center gap-2 rounded-2xl border-2 border-ink bg-white/95 p-2 shadow-[3px_3px_0_var(--color-ink)]"
    >
      <p className="text-center font-display text-sm leading-tight text-haru-600">{nearEasel ? '칸을 눌러 칠해요' : '이젤로 가요'}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {EASEL_PALETTE.map((value, index) => (
          <button
            key={value}
            type="button"
            aria-label={index === 0 ? `${EASEL_COLOR_NAMES[index]} (지우개)` : EASEL_COLOR_NAMES[index]}
            aria-pressed={color === index}
            onClick={() => onColorChange(index)}
            className={`size-9 cursor-pointer rounded-full border-2 border-ink transition focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-haru-600 ${color === index ? 'scale-110 ring-3 ring-haru-500 ring-offset-2' : ''}`}
            style={{ backgroundColor: value }}
          />
        ))}
      </div>
      {nearEasel && (
        <button type="button" onClick={onClear} className="min-h-9 w-full cursor-pointer rounded-full border-2 border-ink bg-white text-sm hover:bg-haru-100 focus-visible:outline-3 focus-visible:outline-haru-600">
          새 종이
        </button>
      )}
      <button type="button" onClick={onDrop} className="min-h-9 w-full cursor-pointer rounded-full border-2 border-ink bg-haru-100 text-sm hover:bg-haru-200 focus-visible:outline-3 focus-visible:outline-haru-600">
        내려놓기
      </button>
    </div>
  )
}
