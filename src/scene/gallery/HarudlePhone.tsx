import { useMemo, useRef, useState } from 'react'
import { Billboard, RoundedBox, useCursor } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { COLORS, FONT_BODY, FONT_DISPLAY, SLOGAN } from '../../lib/brand'
import { PaperCut } from '../Room'
import { speechBubble } from '../shapes'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { PHONE_POSITION, PHONE_ROTATION_Y } from './layout'

const BODY_WIDTH = 1.9
const BODY_HEIGHT = 3.7
const BODY_DEPTH = 0.2
const SCREEN_WIDTH = 1.72
const SCREEN_HEIGHT = 3.44
const STAND_HEIGHT = 0.36
const BODY_Y = STAND_HEIGHT + BODY_HEIGHT / 2

/** 사람 한 명이 네 칸에 나눠 그려진 작은 네컷만화 */
function drawMiniComic(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const gap = size * 0.04
  const cell = (size - gap * 3) / 2
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = COLORS.charcoal
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, 10)
  ctx.fill()
  ctx.stroke()
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < 2; column++) {
      const cx = x + gap + column * (cell + gap)
      const cy = y + gap + row * (cell + gap)
      ctx.lineWidth = 2
      ctx.strokeRect(cx, cy, cell, cell)
      // 칸마다 조금씩 다른 자리에 선 졸라맨
      const headX = cx + cell * (0.35 + 0.3 * ((row + column) % 2))
      const headY = cy + cell * 0.36
      const head = cell * 0.13
      ctx.beginPath()
      ctx.arc(headX, headY, head, 0, Math.PI * 2)
      ctx.moveTo(headX, headY + head)
      ctx.lineTo(headX, headY + head + cell * 0.25)
      ctx.moveTo(headX - cell * 0.12, headY + head + cell * 0.1)
      ctx.lineTo(headX + cell * 0.12, headY + head + cell * 0.1)
      ctx.stroke()
      ctx.fillStyle = COLORS.charcoal
      ctx.beginPath()
      ctx.arc(headX - head * 0.35, headY - head * 0.1, 2, 0, Math.PI * 2)
      ctx.arc(headX + head * 0.35, headY - head * 0.1, 2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

/** 실제 하루들 화면 대신 보여 주는 대기 화면. 누르면 진짜 하루들이 열린다. */
const drawScreen: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = COLORS.charcoal
  ctx.font = `${h * 0.022}px ${FONT_BODY}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillText('9:41', w * 0.08, h * 0.035)

  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.05}px ${FONT_DISPLAY}`
  ctx.fillText('하루들', w * 0.08, h * 0.1)
  ctx.fillStyle = COLORS.lavender200
  ctx.beginPath()
  ctx.arc(w * 0.88, h * 0.1, h * 0.022, 0, Math.PI * 2)
  ctx.fill()

  const comic = w * 0.84
  drawMiniComic(ctx, (w - comic) / 2, h * 0.15, comic)

  ctx.fillStyle = COLORS.ink
  ctx.textAlign = 'center'
  ctx.font = `${h * 0.032}px ${FONT_DISPLAY}`
  ctx.fillText(SLOGAN, w / 2, h * 0.64)
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.024}px ${FONT_BODY}`
  ctx.fillText('일상을 네컷만화로 만들어 보세요', w / 2, h * 0.69)

  ctx.fillStyle = COLORS.primaryDeep
  ctx.beginPath()
  ctx.roundRect(w * 0.12, h * 0.77, w * 0.76, h * 0.085, h * 0.04)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `${h * 0.036}px ${FONT_DISPLAY}`
  ctx.fillText('눌러서 하루들 열기', w / 2, h * 0.815)

  ctx.fillStyle = COLORS.charcoal
  ctx.beginPath()
  ctx.roundRect(w * 0.35, h * 0.965, w * 0.3, 6, 3)
  ctx.fill()
}

const drawBubble: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.5}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('하루들 직접 써 보기', w / 2, h / 2 + h * 0.03)
}

/** 전시관 안에 세워 둔 큰 휴대폰. 누르면 하루들 서비스를 휴대폰 화면 그대로 연다. 화면이 +z를 본다. */
export function HarudlePhone({ paused, onOpen }: { paused: boolean; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false)
  const lifted = useRef<THREE.Group>(null)
  const screen = useCanvasTexture(drawScreen, 360, 720)
  const bubbleText = useCanvasTexture(drawBubble, 640, 128)
  const bubble = useMemo(() => speechBubble(2.9, 0.78, 0.26), [])
  const active = hovered && !paused

  useCursor(active)

  useFrame((_, delta) => {
    if (!lifted.current) return
    const scale = THREE.MathUtils.damp(lifted.current.scale.x, active ? 1.04 : 1, 12, delta)
    lifted.current.scale.setScalar(scale)
  })

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > 6 || paused) return
    onOpen()
  }

  return (
    <group position={PHONE_POSITION} rotation-y={PHONE_ROTATION_Y}>
      <RoundedBox args={[1.6, STAND_HEIGHT, 1.1]} radius={0.08} position-y={STAND_HEIGHT / 2} castShadow receiveShadow>
        <Toon color={COLORS.primaryDeep} />
      </RoundedBox>

      <group ref={lifted} position-y={BODY_Y} rotation-x={-0.06}>
        <RoundedBox args={[BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH]} radius={0.16} castShadow receiveShadow>
          <Toon color={COLORS.ink} />
        </RoundedBox>
        <mesh position-z={BODY_DEPTH / 2 + 0.005}>
          <planeGeometry args={[SCREEN_WIDTH, SCREEN_HEIGHT]} />
          <meshBasicMaterial map={screen} toneMapped={false} />
        </mesh>
        {/* 화면 위 카메라 구멍 */}
        <mesh position={[0, SCREEN_HEIGHT / 2 - 0.1, BODY_DEPTH / 2 + 0.01]}>
          <circleGeometry args={[0.045, 16]} />
          <meshBasicMaterial color={COLORS.ink} />
        </mesh>
        {/* 옆면 버튼 */}
        <RoundedBox args={[0.06, 0.5, 0.08]} radius={0.02} position={[BODY_WIDTH / 2 + 0.02, 0.7, 0]}>
          <Toon color={COLORS.lavender300} outlineThickness={1} />
        </RoundedBox>
      </group>

      <group position-y={STAND_HEIGHT + BODY_HEIGHT + 0.55}>
        <Billboard>
          <PaperCut shape={bubble} depth={0.06} color="#ffffff" outlineThickness={1.3} />
          <mesh position={[0, 0.66, 0.07]}>
            <planeGeometry args={[2.6, 0.52]} />
            <meshBasicMaterial map={bubbleText} transparent toneMapped={false} />
          </mesh>
        </Billboard>
      </group>

      {/* 움직여도 호버가 끊기지 않는 판정 상자 */}
      <mesh
        position-y={BODY_Y}
        onPointerOver={(event) => {
          event.stopPropagation()
          if (event.pointerType === 'mouse') setHovered(true)
        }}
        onPointerOut={() => setHovered(false)}
        onClick={handleClick}
      >
        <boxGeometry args={[2.3, BODY_HEIGHT + 0.6, 1.4]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
