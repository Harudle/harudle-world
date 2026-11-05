import { EASEL_PALETTE, EASEL_REGION_COUNT, EASEL_ROOM, type EaselState } from '../src/data/easel.ts'
import { EASEL_BRUSH_HOME, EASEL_PAINT_REACH, EASEL_PICK_REACH, EASEL_POSITION } from '../src/scene/gallery/layout.ts'

// 화면의 위치는 서버보다 조금 늦으므로 닿는 거리에 여유를 둔다.
const REACH_SLACK = 1.5
const FILL_INTERVAL_MS = 120
const CLEAR_INTERVAL_MS = 5_000
// 한 사람이 붓을 들고 자리를 비워도 다른 사람이 쓸 수 있게, 이만큼 칠하지 않으면 그 자리에 내려놓는다.
const HOLD_IDLE_MS = 2 * 60_000
// 아무도 칠하지 않은 채 이만큼 지나면 다음 사람을 위해 새 종이로 바꾸고 붓을 제자리에 둔다.
const RESET_IDLE_MS = 30 * 60_000

export type EaselPlayer = { id: number; room: string; x: number; z: number; placed: boolean }

/**
 * 메인 전시실에 하나뿐인 이젤 붓과 함께 칠하는 네컷만화의 상태. 저장하지 않으므로 서버가 다시 켜지면 처음으로 돌아간다.
 * 붓은 한 사람만 들 수 있고, 든 사람만 이젤 가까이에서 칠할 수 있다. 바뀔 때마다 broadcast로 방 전체에 상태를 보낸다.
 */
export function createEasel(broadcast: (room: string, payload: string) => void) {
  const state: EaselState = { holder: null, x: EASEL_BRUSH_HOME.x, z: EASEL_BRUSH_HOME.z, fills: Array(EASEL_REGION_COUNT).fill(0) }
  let holderX = 0
  let holderZ = 0
  let lastUsedAt = Date.now()
  let lastFillAt = 0
  let lastClearAt = 0

  const payload = () => JSON.stringify({ t: 'easel', ...state })
  const publish = () => broadcast(EASEL_ROOM, payload())
  const near = (player: EaselPlayer, x: number, z: number, reach: number) =>
    player.room === EASEL_ROOM && player.placed && Math.hypot(player.x - x, player.z - z) <= reach + REACH_SLACK

  const drop = (x: number, z: number) => {
    state.holder = null
    state.x = Math.round(x * 100) / 100
    state.z = Math.round(z * 100) / 100
    publish()
  }

  const pick = (player: EaselPlayer, now: number) => {
    if (state.holder !== null || !near(player, state.x, state.z, EASEL_PICK_REACH)) return
    state.holder = player.id
    holderX = player.x
    holderZ = player.z
    lastUsedAt = now
    publish()
  }

  /** 받아들이지 않으면 false. 화면은 먼저 칠해 두므로 그 사람에게 지금 상태를 다시 보내야 한다. */
  const fill = (player: EaselPlayer, region: unknown, color: unknown, now: number) => {
    if (state.holder !== player.id || now - lastFillAt < FILL_INTERVAL_MS) return false
    if (!Number.isInteger(region) || !Number.isInteger(color)) return false
    const index = region as number
    const value = color as number
    if (index < 0 || index >= EASEL_REGION_COUNT || value < 0 || value >= EASEL_PALETTE.length) return false
    if (!near(player, EASEL_POSITION[0], EASEL_POSITION[2], EASEL_PAINT_REACH)) return false
    lastFillAt = now
    lastUsedAt = now
    if (state.fills[index] === value) return true
    state.fills[index] = value
    publish()
    return true
  }

  const clear = (player: EaselPlayer, now: number) => {
    if (state.holder !== player.id || now - lastClearAt < CLEAR_INTERVAL_MS) return
    if (!near(player, EASEL_POSITION[0], EASEL_POSITION[2], EASEL_PAINT_REACH)) return
    lastClearAt = now
    lastUsedAt = now
    state.fills.fill(0)
    publish()
  }

  return {
    /** 이젤 방에 들어온 사람에게 지금 상태를 보낸다. */
    snapshotFor: (room: string) => (room === EASEL_ROOM ? payload() : null),

    /** 칠하기를 받아들이지 않았으면 false를 돌려준다. */
    handle(player: EaselPlayer, message: Record<string, unknown>, now: number) {
      if (message.t === 'easel-pick') pick(player, now)
      else if (message.t === 'easel-drop' && state.holder === player.id) drop(player.x, player.z)
      else if (message.t === 'easel-fill') return fill(player, message.region, message.color, now)
      else if (message.t === 'easel-clear') clear(player, now)
      return true
    },

    /** 든 사람의 위치를 따라가 두었다가, 그 사람이 나가면 마지막 자리에 떨어뜨린다. */
    moved(player: EaselPlayer) {
      if (state.holder !== player.id) return
      holderX = player.x
      holderZ = player.z
    },

    /** 든 사람이 다른 방으로 가거나 접속이 끊기면 붓을 내려놓는다. */
    left(player: EaselPlayer) {
      if (state.holder === player.id) drop(holderX, holderZ)
    },

    tick(now: number) {
      if (state.holder !== null && now - lastUsedAt >= HOLD_IDLE_MS) {
        lastUsedAt = now
        drop(holderX, holderZ)
        return
      }
      if (state.holder === null && now - lastUsedAt >= RESET_IDLE_MS) {
        lastUsedAt = now
        const moved = state.x !== EASEL_BRUSH_HOME.x || state.z !== EASEL_BRUSH_HOME.z
        if (!moved && state.fills.every((value) => value === 0)) return
        state.fills.fill(0)
        state.x = EASEL_BRUSH_HOME.x
        state.z = EASEL_BRUSH_HOME.z
        publish()
      }
    },
  }
}
