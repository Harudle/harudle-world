import { EASEL_PALETTE, EASEL_REGION_COUNT } from '../../data/easel'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'

/** 이젤 그림 캔버스 한 변의 픽셀 수. 칸 모양은 이 좌표로 그린다. */
export const EASEL_ART_SIZE = 512

const MARGIN = 14
const GAP = 12
const PANEL = (EASEL_ART_SIZE - MARGIN * 2 - GAP) / 2
const CAPTIONS = ['일어났다!', '커피 한 잔', '친구 만남', '잘 자']
const LINE = 4

type Panel = { x: number; y: number }

const PANELS: Panel[] = [0, 1, 2, 3].map((index) => ({
  x: MARGIN + (index % 2) * (PANEL + GAP),
  y: MARGIN + Math.floor(index / 2) * (PANEL + GAP),
}))

const at = (panel: Panel, u: number, v: number): [number, number] => [panel.x + PANEL * u, panel.y + PANEL * v]

function circle(panel: Panel, u: number, v: number, r: number) {
  const path = new Path2D()
  const [x, y] = at(panel, u, v)
  path.arc(x, y, PANEL * r, 0, Math.PI * 2)
  return path
}

function background(panel: Panel) {
  const path = new Path2D()
  path.rect(panel.x, panel.y, PANEL, PANEL)
  return path
}

function head(panel: Panel) {
  return circle(panel, 0.36, 0.4, 0.15)
}

function sun(panel: Panel) {
  return circle(panel, 0.78, 0.22, 0.1)
}

function cup(panel: Panel) {
  const path = new Path2D()
  path.moveTo(...at(panel, 0.62, 0.5))
  path.lineTo(...at(panel, 0.86, 0.5))
  path.lineTo(...at(panel, 0.83, 0.72))
  path.lineTo(...at(panel, 0.65, 0.72))
  path.closePath()
  return path
}

function heart(panel: Panel) {
  const path = new Path2D()
  const [x, y] = at(panel, 0.76, 0.3)
  const s = PANEL * 0.11
  path.moveTo(x, y + s * 0.9)
  path.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.1, x, y - s * 0.4)
  path.bezierCurveTo(x + s * 0.7, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9)
  path.closePath()
  return path
}

function star(panel: Panel) {
  const path = new Path2D()
  const [cx, cy] = at(panel, 0.76, 0.24)
  const outer = PANEL * 0.11
  const inner = outer * 0.45
  for (let index = 0; index < 10; index++) {
    const radius = index % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (index * Math.PI) / 5
    const point: [number, number] = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]
    if (index === 0) path.moveTo(...point)
    else path.lineTo(...point)
  }
  path.closePath()
  return path
}

const OBJECTS = [sun, cup, heart, star]

/**
 * 칠할 수 있는 칸. 위에 그려지는 칸이 뒤에 온다. 순서가 서버에 저장되는 칸 번호이므로 바꾸지 않는다.
 * 0~3 배경, 4~7 얼굴, 8~11 소품.
 */
export const EASEL_REGIONS: Path2D[] = [...PANELS.map(background), ...PANELS.map(head), ...PANELS.map((panel, index) => OBJECTS[index](panel))]

if (EASEL_REGIONS.length !== EASEL_REGION_COUNT) throw new Error('이젤 칸 수가 서버 규칙과 다릅니다.')

const hitContext = document.createElement('canvas').getContext('2d')!

/** 그림 위의 한 점(0~1)에 있는 칸 번호. 맨 위 칸부터 찾는다. */
export function easelRegionAt(u: number, v: number) {
  const x = u * EASEL_ART_SIZE
  const y = (1 - v) * EASEL_ART_SIZE
  for (let index = EASEL_REGIONS.length - 1; index >= 0; index--) {
    if (hitContext.isPointInPath(EASEL_REGIONS[index], x, y)) return index
  }
  return null
}

/** 칠한 색 위에 선을 얹는다. 선은 칠해지지 않는다. */
function drawLines(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = COLORS.charcoal
  ctx.lineWidth = LINE
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const region of EASEL_REGIONS) ctx.stroke(region)

  PANELS.forEach((panel, index) => {
    const line = (points: [number, number][]) => {
      ctx.beginPath()
      points.forEach(([u, v], pointIndex) => (pointIndex === 0 ? ctx.moveTo(...at(panel, u, v)) : ctx.lineTo(...at(panel, u, v))))
      ctx.stroke()
    }
    // 졸라맨 몸
    line([[0.36, 0.55], [0.36, 0.76]])
    line([[0.36, 0.76], [0.28, 0.88]])
    line([[0.36, 0.76], [0.44, 0.88]])
    const reaching = index === 1 || index === 2
    line([[0.22, 0.62], [0.36, 0.6], reaching ? [0.58, 0.56] : [0.5, 0.66]])

    // 얼굴: 마지막 칸은 감은 눈
    ctx.lineWidth = LINE * 0.8
    if (index === 3) {
      line([[0.3, 0.38], [0.34, 0.38]])
      line([[0.38, 0.38], [0.42, 0.38]])
    } else {
      ctx.fillStyle = COLORS.charcoal
      for (const u of [0.31, 0.41]) {
        ctx.beginPath()
        ctx.arc(...at(panel, u, 0.38), LINE * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.beginPath()
    ctx.arc(...at(panel, 0.36, 0.44), PANEL * 0.045, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()

    // 소품 장식
    if (index === 0) {
      const [cx, cy] = at(panel, 0.78, 0.22)
      for (let ray = 0; ray < 8; ray++) {
        const angle = (ray * Math.PI) / 4
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(angle) * PANEL * 0.13, cy + Math.sin(angle) * PANEL * 0.13)
        ctx.lineTo(cx + Math.cos(angle) * PANEL * 0.17, cy + Math.sin(angle) * PANEL * 0.17)
        ctx.stroke()
      }
    } else if (index === 1) {
      ctx.beginPath()
      ctx.arc(...at(panel, 0.87, 0.6), PANEL * 0.05, -0.5 * Math.PI, 0.5 * Math.PI)
      ctx.stroke()
      line([[0.7, 0.44], [0.72, 0.38]])
      line([[0.78, 0.44], [0.8, 0.38]])
    }
    ctx.lineWidth = LINE

    ctx.fillStyle = COLORS.charcoal
    ctx.font = `${PANEL * 0.09}px ${FONT_DISPLAY}`
    ctx.textAlign = 'right'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(CAPTIONS[index], ...at(panel, 0.94, 0.95))
  })
}

/** 칸마다 칠한 색으로 네컷만화를 그린다. */
export function drawEaselArt(ctx: CanvasRenderingContext2D, fills: readonly number[]) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, EASEL_ART_SIZE, EASEL_ART_SIZE)
  EASEL_REGIONS.forEach((region, index) => {
    ctx.fillStyle = EASEL_PALETTE[fills[index] ?? 0] ?? '#ffffff'
    ctx.fill(region)
  })
  drawLines(ctx)
}
