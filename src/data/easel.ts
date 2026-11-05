/** 함께 색칠하는 이젤의 규칙. 서버도 이 파일로 값을 확인하므로 다른 파일을 가져오지 않는다. */

/** 이젤이 있는 방 */
export const EASEL_ROOM = 'main'

/** 칠할 수 있는 칸 수. 그림의 칸 목록(src/scene/gallery/easelArt.ts)과 길이가 같아야 한다. */
export const EASEL_REGION_COUNT = 12

/** 붓 색. 0번은 하양이라 지우개처럼 쓴다. */
export const EASEL_PALETTE = ['#FFFFFF', '#FFD97A', '#FFA9BD', '#C3B3F8', '#8B6FE8', '#9ED8B5', '#8EC5F2', '#FFB37A'] as const

export const EASEL_COLOR_NAMES = ['하양', '버터', '분홍', '연보라', '보라', '민트', '하늘', '주황'] as const

/** 서버가 알려 주는 이젤 상태. holder가 null이면 붓은 바닥의 x, z에 있다. fills는 칸마다 색 번호이고 칠하지 않은 칸은 0이다. */
export type EaselState = {
  holder: number | null
  x: number
  z: number
  fills: number[]
}

export function isEaselState(value: unknown): value is EaselState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return (
    (state.holder === null || typeof state.holder === 'number') &&
    typeof state.x === 'number' &&
    typeof state.z === 'number' &&
    Array.isArray(state.fills) &&
    state.fills.length === EASEL_REGION_COUNT &&
    state.fills.every((fill) => Number.isInteger(fill) && fill >= 0 && fill < EASEL_PALETTE.length)
  )
}
