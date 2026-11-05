import { useMemo } from 'react'
import { Billboard, RoundedBox } from '@react-three/drei'
import { COLORS, FONT_DISPLAY } from '../../lib/brand'
import { HarudleFrame } from '../../ui/HarudleFrame'
import { PaperCut } from '../Room'
import { speechBubble } from '../shapes'
import { Toon } from '../toon'
import { useCanvasTexture, type DrawFn } from '../useCanvasTexture'
import { WebScreen } from '../WebScreen'
import { PHONE_POSITION, PHONE_ROTATION_Y } from './layout'

const SCREEN_WIDTH = 2.4
const SCREEN_HEIGHT = 4.8
const BEZEL = 0.12
const BODY_WIDTH = SCREEN_WIDTH + BEZEL * 2
const BODY_HEIGHT = SCREEN_HEIGHT + BEZEL * 2 + 0.2
const BODY_DEPTH = 0.2
const STAND_HEIGHT = 0.3
const BODY_Y = STAND_HEIGHT + BODY_HEIGHT / 2

/** 하루들을 띄우는 휴대폰 화면의 CSS 크기. 모바일 화면으로 보이도록 폭을 좁게 둔다. */
const VIEWPORT_WIDTH = 360
const VIEWPORT_HEIGHT = 720

const drawBubble: DrawFn = (ctx, w, h) => {
  ctx.fillStyle = COLORS.primaryDeep
  ctx.font = `${h * 0.5}px ${FONT_DISPLAY}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('하루들 직접 써 보기', w / 2, h / 2 + h * 0.03)
}

/**
 * 전시관 안에 세워 둔 큰 휴대폰. 화면에 하루들이 그대로 떠 있어서 바로 누르고 스크롤할 수 있다. 화면이 +z를 본다.
 */
export function HarudlePhone() {
  const bubbleText = useCanvasTexture(drawBubble, 640, 128)
  const bubble = useMemo(() => speechBubble(2.9, 0.78, 0.26), [])

  return (
    <group position={PHONE_POSITION} rotation-y={PHONE_ROTATION_Y}>
      <RoundedBox args={[1.9, STAND_HEIGHT, 1.2]} radius={0.08} position-y={STAND_HEIGHT / 2} castShadow receiveShadow>
        <Toon color={COLORS.primaryDeep} />
      </RoundedBox>

      <group position-y={BODY_Y}>
        <RoundedBox args={[BODY_WIDTH, BODY_HEIGHT, BODY_DEPTH]} radius={0.18} castShadow receiveShadow>
          <Toon color={COLORS.ink} />
        </RoundedBox>
        {/* 화면 위 카메라 구멍 */}
        <mesh position={[0, BODY_HEIGHT / 2 - 0.12, BODY_DEPTH / 2 + 0.005]}>
          <circleGeometry args={[0.04, 16]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* 옆면 버튼 */}
        <RoundedBox args={[0.06, 0.6, 0.08]} radius={0.02} position={[BODY_WIDTH / 2 + 0.02, 1, 0]}>
          <Toon color={COLORS.lavender300} outlineThickness={1} />
        </RoundedBox>

        <WebScreen
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          viewportWidth={VIEWPORT_WIDTH}
          viewportHeight={VIEWPORT_HEIGHT}
          position={[0, -0.04, BODY_DEPTH / 2 + 0.01]}
          className="overflow-hidden bg-paper"
        >
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-6 text-center text-sm leading-relaxed text-haru-800">
            하루들을 불러오는 중이에요.
            <br />
            화면이 계속 비어 있으면 아래 ‘하루들 열기’를 눌러 주세요.
          </p>
          <HarudleFrame className="relative size-full border-0 bg-transparent" />
        </WebScreen>
      </group>

      <group position-y={STAND_HEIGHT + BODY_HEIGHT + 0.35}>
        <Billboard>
          <PaperCut shape={bubble} depth={0.06} color="#ffffff" outlineThickness={1.3} />
          <mesh position={[0, 0.66, 0.07]}>
            <planeGeometry args={[2.6, 0.52]} />
            <meshBasicMaterial map={bubbleText} transparent toneMapped={false} />
          </mesh>
        </Billboard>
      </group>
    </group>
  )
}
