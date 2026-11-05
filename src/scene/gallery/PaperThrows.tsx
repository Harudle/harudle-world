import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { PaperThrow, PlayState, RemotePlayer, RemotePosition } from '../../data/presence'
import { COLORS } from '../../lib/brand'
import { Toon } from '../toon'
import { BRUSH_REACH, type SpaceBounds } from './layout'
import { knockAmount } from './Player'

const THROW_RANGE = 30
const AIM_RADIUS_PIXELS = 45
const WALL_MARGIN = 0.5
const MARKER_HEIGHT = 0.03
const BODY_CENTER_HEIGHT = 1.1
const COOLDOWN_SECONDS = 0.8
const HAND_HEIGHT = 1.5
const HIT_HEIGHT = 1.3
const FLIGHT_SPEED = 16
const MIN_FLIGHT_SECONDS = 0.25
const ARC_HEIGHT = 1.4
const SPIN = 11
const REST_SECONDS = 5
const REST_HEIGHT = 0.16

const PAPER_RADIUS = 0.27
const CREASE_ANGLE = 34
const PAPER_LIGHT = new THREE.Vector3(0.45, 0.8, 0.4).normalize()

/**
 * 구겨 버린 흰 종이 뭉치. 한 번만 만들어 함께 쓴다.
 * 작은 주름 없이 큼직한 삼각형 면만 남기고, 꼭짓점을 들쭉날쭉 밀어 접힌 모서리와 삐죽한 귀퉁이를 만든다.
 * 뭉치마다 같은 모양이어도 돌아가며 날아서 달라 보이므로 항상 같은 값으로 만든다.
 */
function createCrumpledPaper() {
  let seed = 23
  const random = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const geometry = new THREE.IcosahedronGeometry(1, 2)
  const positions = geometry.attributes.position
  const direction = new THREE.Vector3()
  // 면마다 꼭짓점을 따로 가진 도형이라, 같은 자리의 꼭짓점이 벌어지지 않게 자리별로 한 번만 정한다.
  const radii = new Map<string, number>()
  for (let index = 0; index < positions.count; index += 1) {
    direction.fromBufferAttribute(positions, index).normalize()
    const spot = `${direction.x.toFixed(3)},${direction.y.toFixed(3)},${direction.z.toFixed(3)}`
    let radius = radii.get(spot)
    if (radius === undefined) {
      radius = random() < 0.12 ? 1.1 + random() * 0.12 : 0.8 + random() * 0.2
      radii.set(spot, radius)
    }
    positions.setXYZ(index, direction.x * radius * PAPER_RADIUS, direction.y * radius * PAPER_RADIUS, direction.z * radius * PAPER_RADIUS)
  }
  // 꼭짓점을 나누어 쓰지 않는 도형이라 면마다 평평하게 음영이 진다.
  geometry.computeVertexNormals()

  const normals = geometry.attributes.normal
  const colors = new Float32Array(positions.count * 3)
  const normal = new THREE.Vector3()
  for (let index = 0; index < positions.count; index += 1) {
    normal.fromBufferAttribute(normals, index)
    const shade = 0.9 + 0.1 * Math.max(normal.dot(PAPER_LIGHT), 0)
    colors.set([shade, shade, shade], index * 3)
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

const PAPER_GEOMETRY = createCrumpledPaper()
const PAPER_CREASES = new THREE.EdgesGeometry(PAPER_GEOMETRY, CREASE_ANGLE)

type Positions = RefObject<Map<number, RemotePosition>>

function FlyingPaper({ paper, positions, leader, play }: {
  paper: PaperThrow
  positions: Positions
  leader: RefObject<THREE.Vector3>
  play: PlayState
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const start = useRef<THREE.Vector3 | null>(null)
  const landing = useRef(new THREE.Vector3(paper.x, REST_HEIGHT, paper.z))
  const flight = useRef({ elapsed: 0, duration: 0, landed: false, rest: 0 })

  const locate = (id: number): { x: number; z: number } | undefined => (id === play.myId ? leader.current : positions.current.get(id))

  useFrame((_, delta) => {
    const paperMesh = mesh.current
    if (!paperMesh) return
    const state = flight.current
    const dt = Math.min(delta, 0.05)

    if (state.landed) {
      state.rest += dt
      if (state.rest >= REST_SECONDS) play.finishThrow({ ...paper, to: null })
      return
    }

    if (!start.current) {
      const origin = locate(paper.from)
      if (!origin) {
        play.finishThrow({ ...paper, to: null })
        return
      }
      start.current = new THREE.Vector3(origin.x, HAND_HEIGHT, origin.z)
    }

    // 맞을 사람이 움직여도 따라가서 맞힌다. 방을 나갔으면 마지막 자리에 떨어진다.
    const target = paper.to === null ? undefined : locate(paper.to)
    if (target) landing.current.set(target.x, HIT_HEIGHT, target.z)
    if (state.duration === 0) {
      state.duration = Math.max(start.current.distanceTo(landing.current) / FLIGHT_SPEED, MIN_FLIGHT_SECONDS)
    }

    state.elapsed += dt
    const progress = Math.min(state.elapsed / state.duration, 1)
    paperMesh.visible = true
    paperMesh.position.lerpVectors(start.current, landing.current, progress)
    paperMesh.position.y += Math.sin(progress * Math.PI) * ARC_HEIGHT
    paperMesh.rotation.x += SPIN * dt
    paperMesh.rotation.z += SPIN * 0.7 * dt

    if (progress === 1) {
      if (paper.to !== null && target) {
        play.finishThrow(paper)
        return
      }
      paperMesh.position.y = REST_HEIGHT
      state.landed = true
    }
  })

  return (
    <mesh ref={mesh} geometry={PAPER_GEOMETRY} visible={false} castShadow>
      <Toon color="#FFFDF5" vertexColors outlineThickness={1.4} />
      <lineSegments geometry={PAPER_CREASES}>
        <lineBasicMaterial color="#BDB4D9" />
      </lineSegments>
    </mesh>
  )
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches

type AimPoint = { x: number; y: number }

/** F 키, 우클릭, 휴대폰 조준, 캐릭터 클릭을 받아 던지고, 날아가는 종이를 그린다. 고른 곳으로만 던진다. 붓을 들었으면 닿는 사람은 붓으로 칠한다. */
export function PaperThrows({ players, positions, leader, play, paused, space }: {
  players: RemotePlayer[]
  positions: Positions
  leader: RefObject<THREE.Vector3>
  play: PlayState
  paused: boolean
  space: SpaceBounds
}) {
  const cooldown = useRef(0)
  const marker = useRef<THREE.Mesh>(null)
  const gl = useThree((state) => state.gl)
  const scratch = useMemo(
    () => ({ raycaster: new THREE.Raycaster(), projected: new THREE.Vector3(), ground: new THREE.Vector3(), ndc: new THREE.Vector2() }),
    [],
  )
  const { throwRequest, sendThrow } = play

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyF' || event.repeat || document.querySelector('dialog[open]')) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      throwRequest.current = { atPointer: true }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [throwRequest])

  // 마우스만으로도 던질 수 있게 우클릭은 그 자리로 던진다.
  useEffect(() => {
    const canvas = gl.domElement
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      throwRequest.current = { point: { x: ((event.clientX - rect.left) / rect.width) * 2 - 1, y: -((event.clientY - rect.top) / rect.height) * 2 + 1 } }
    }
    canvas.addEventListener('contextmenu', handleContextMenu)
    return () => canvas.removeEventListener('contextmenu', handleContextMenu)
  }, [gl, throwRequest])

  useFrame(({ camera, pointer, size }, delta) => {
    const { raycaster, projected, ground, ndc } = scratch
    const { x, z } = leader.current

    /** 고른 점 가까이에 보이는 사람. 닿는 거리 밖이면 겨냥하지 않는다. */
    const pickPerson = (aim: AimPoint) => {
      let picked: number | null = null
      let nearest = AIM_RADIUS_PIXELS
      for (const player of players) {
        const position = positions.current.get(player.id)
        if (!position || Math.hypot(position.x - x, position.z - z) > THROW_RANGE) continue
        projected.set(position.x, BODY_CENTER_HEIGHT, position.z).project(camera)
        const distance = Math.hypot(((projected.x - aim.x) * size.width) / 2, ((projected.y - aim.y) * size.height) / 2)
        if (projected.z < 1 && distance < nearest) {
          nearest = distance
          picked = player.id
        }
      }
      return picked
    }

    /** 고른 점 아래의 바닥. 멀면 닿는 데까지만 가고, 벽을 넘어가지 않게 공간 안으로 맞춘다. */
    const pickGround = (aim: AimPoint) => {
      raycaster.setFromCamera(ndc.set(aim.x, aim.y), camera)
      if (!raycaster.ray.intersectPlane(GROUND, ground)) {
        ground.copy(raycaster.ray.direction).multiplyScalar(THROW_RANGE * 2).add(camera.position)
      }
      const dx = ground.x - x
      const dz = ground.z - z
      const distance = Math.hypot(dx, dz) || 1
      const reach = Math.min(distance, THROW_RANGE) / distance
      ground.x = THREE.MathUtils.clamp(x + dx * reach, -space.halfX + WALL_MARGIN, space.halfX - WALL_MARGIN)
      ground.z = THREE.MathUtils.clamp(z + dz * reach, -space.halfZ + WALL_MARGIN, space.halfZ - WALL_MARGIN)
      return ground
    }

    const knocked = play.myId !== null && knockAmount(play.knocks.current.get(play.myId)) > 0

    // PC에서는 F 키나 우클릭으로 어디에 떨어질지 바닥에 미리 보여 준다.
    const ring = marker.current
    if (ring) {
      ring.visible = !IS_TOUCH && !paused && !knocked
      if (ring.visible) {
        const person = pickPerson(pointer)
        const target = person === null ? undefined : positions.current.get(person)
        const spot = target ?? pickGround(pointer)
        ring.position.set(spot.x, MARKER_HEIGHT, spot.z)
      }
    }

    cooldown.current = Math.max(cooldown.current - delta, 0)
    const request = throwRequest.current
    throwRequest.current = null
    if (!request || paused || cooldown.current > 0 || knocked) return

    const brushIfNear = (person: number) => {
      const target = positions.current.get(person)
      if (!play.holdsBrush || !target || Math.hypot(target.x - x, target.z - z) > BRUSH_REACH) return false
      play.sendBrush(person)
      return true
    }

    if ('target' in request) {
      const target = positions.current.get(request.target)
      if (!target) return
      cooldown.current = COOLDOWN_SECONDS
      if (brushIfNear(request.target)) return
      if (Math.hypot(target.x - x, target.z - z) <= THROW_RANGE) sendThrow({ to: request.target })
      else {
        const distance = Math.hypot(target.x - x, target.z - z)
        sendThrow({ x: x + ((target.x - x) / distance) * THROW_RANGE, z: z + ((target.z - z) / distance) * THROW_RANGE })
      }
      return
    }

    const aim = 'point' in request ? request.point : pointer
    cooldown.current = COOLDOWN_SECONDS
    const person = pickPerson(aim)
    if (person !== null) {
      if (!brushIfNear(person)) sendThrow({ to: person })
      return
    }
    const spot = pickGround(aim)
    sendThrow({ x: spot.x, z: spot.z })
  })

  return (
    <>
      <mesh ref={marker} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.3, 0.42, 28]} />
        <meshBasicMaterial color={COLORS.primaryDeep} transparent opacity={0.55} depthWrite={false} toneMapped={false} />
      </mesh>
      {play.throws.map((paper) => (
        <FlyingPaper key={paper.key} paper={paper} positions={positions} leader={leader} play={play} />
      ))}
    </>
  )
}
