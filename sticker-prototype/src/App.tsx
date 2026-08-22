import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import {
  selectionBackground,
  sharedPackage,
  stickerSets,
  getStickerById,
  type AppScreen,
  type StickerSet,
} from './data/stickers'
import campground from './assets/placement/campground.png'
import vanArt from './assets/placement/van.png'
import mapArt from './assets/map/map.png'
import mapVanArt from './assets/map/map-van.png'
import backChevron from './assets/map/back-chevron.svg'
import westFallsBanner from './assets/selection/west-falls-banner.png'
import driveOffCoast from './assets/drive-off/coast.png'
import driveOffVan from './assets/drive-off/side-van.png'
import './App.css'

const VAN_INITIAL_LEFT = -330
const VAN_WIDTH = 1062
const VAN_HEIGHT = 603
const SCENE_WIDTH = 393
const VAN_VISIBLE_MIN = 140
const STICKER_DEFAULT_POSITION = { x: 487, y: 376 }
// Coordinates are measured in the van artwork display size. This keeps the
// sticker on the painted body from the rear bumper through the front bumper,
// below the windows and above the wheel wells.
const STICKER_BOUNDS = { minX: 101, maxX: 984, minY: 331, maxY: 432 }
// Matching body panel on `.drive-off-van-wrap` (percent of the cropped wrap).
const DRIVE_OFF_STICKER_BOUNDS = {
  minLeft: 8.7,
  maxLeft: 91.5,
  minTop: 47.3,
  maxTop: 61.7,
}

type StickerPosition = {
  x: number
  y: number
}

type MapPoint = { x: number; y: number }

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function readSavedStickerPosition(): StickerPosition {
  try {
    const raw = sessionStorage.getItem('selectedStickerPosition')
    if (!raw) return STICKER_DEFAULT_POSITION
    const parsed = JSON.parse(raw) as Partial<StickerPosition>
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
      return STICKER_DEFAULT_POSITION
    }
    return {
      x: Math.max(STICKER_BOUNDS.minX, Math.min(STICKER_BOUNDS.maxX, parsed.x)),
      y: Math.max(STICKER_BOUNDS.minY, Math.min(STICKER_BOUNDS.maxY, parsed.y)),
    }
  } catch {
    return STICKER_DEFAULT_POSITION
  }
}

/** Map placement van coords → % left/top on the drive-off wrap body panel. */
function stickerPositionToDriveOffPercent(position: StickerPosition) {
  const nx = clamp01(
    (position.x - STICKER_BOUNDS.minX) / (STICKER_BOUNDS.maxX - STICKER_BOUNDS.minX),
  )
  const ny = clamp01(
    (position.y - STICKER_BOUNDS.minY) / (STICKER_BOUNDS.maxY - STICKER_BOUNDS.minY),
  )
  return {
    left:
      DRIVE_OFF_STICKER_BOUNDS.minLeft +
      nx * (DRIVE_OFF_STICKER_BOUNDS.maxLeft - DRIVE_OFF_STICKER_BOUNDS.minLeft),
    top:
      DRIVE_OFF_STICKER_BOUNDS.minTop +
      ny * (DRIVE_OFF_STICKER_BOUNDS.maxTop - DRIVE_OFF_STICKER_BOUNDS.minTop),
  }
}

/** Phone-space waypoints along the road from the yellow star to the grey stand star. */
const MAP_VAN_PATH = [
  { x: 302, y: 695 },
  { x: 298, y: 636 },
  { x: 282, y: 576 },
  { x: 240, y: 516 },
  { x: 188, y: 456 },
  { x: 147, y: 396 },
  { x: 123, y: 366 },
  { x: 119, y: 340 },
]
const MAP_DRIVE_MS = 5200
/** Top-down sprite nose points roughly top-left at rest (~-135°). */
const MAP_VAN_HEADING_OFFSET = 135

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function buildPathMetrics(points: MapPoint[]) {
  const segmentLengths: number[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    const length = Math.hypot(dx, dy)
    segmentLengths.push(length)
    total += length
  }
  return { segmentLengths, total }
}

function samplePath(points: MapPoint[], distance: number) {
  const { segmentLengths, total } = buildPathMetrics(points)
  if (total <= 0) {
    return { point: points[0], angle: 0 }
  }
  let remaining = Math.max(0, Math.min(distance, total))
  for (let i = 0; i < segmentLengths.length; i += 1) {
    const length = segmentLengths[i]
    if (remaining <= length || i === segmentLengths.length - 1) {
      const t = length === 0 ? 0 : remaining / length
      const a = points[i]
      const b = points[i + 1]
      const dx = b.x - a.x
      const dy = b.y - a.y
      return {
        point: { x: a.x + dx * t, y: a.y + dy * t },
        angle: (Math.atan2(dy, dx) * 180) / Math.PI,
      }
    }
    remaining -= length
  }
  const last = points[points.length - 1]
  const prev = points[points.length - 2]
  return {
    point: last,
    angle: (Math.atan2(last.y - prev.y, last.x - prev.x) * 180) / Math.PI,
  }
}

function MapScreen({
  dimmed,
  skipDrive = false,
  onArrived,
  onStandTap,
}: {
  dimmed: boolean
  skipDrive?: boolean
  onArrived: () => void
  onStandTap?: () => void
}) {
  const start = MAP_VAN_PATH[0]
  const end = MAP_VAN_PATH[MAP_VAN_PATH.length - 1]
  const endPrev = MAP_VAN_PATH[MAP_VAN_PATH.length - 2]
  const endAngle =
    (Math.atan2(end.y - endPrev.y, end.x - endPrev.x) * 180) / Math.PI + MAP_VAN_HEADING_OFFSET
  const [pose, setPose] = useState({
    x: skipDrive ? end.x : start.x,
    y: skipDrive ? end.y : start.y,
    angle: skipDrive ? endAngle : MAP_VAN_HEADING_OFFSET,
  })
  const arrivedRef = useRef(skipDrive)
  const onArrivedRef = useRef(onArrived)
  onArrivedRef.current = onArrived

  useEffect(() => {
    if (skipDrive) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      setPose({ x: end.x, y: end.y, angle: endAngle })
      if (!arrivedRef.current) {
        arrivedRef.current = true
        onArrivedRef.current()
      }
      return
    }

    const { total } = buildPathMetrics(MAP_VAN_PATH)
    let frame = 0
    const started = performance.now()

    const tick = (now: number) => {
      const t = easeInOutCubic(Math.min(1, (now - started) / MAP_DRIVE_MS))
      const { point, angle } = samplePath(MAP_VAN_PATH, total * t)
      setPose({
        x: point.x,
        y: point.y,
        angle: angle + MAP_VAN_HEADING_OFFSET,
      })
      if (t < 1) {
        frame = window.requestAnimationFrame(tick)
        return
      }
      if (!arrivedRef.current) {
        arrivedRef.current = true
        onArrivedRef.current()
      }
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [skipDrive, end.x, end.y, endAngle])

  return (
    <section className="map-screen" aria-label="Mind map">
      <img className="map-art" src={mapArt} alt="" draggable={false} />
      <img
        className="map-van"
        src={mapVanArt}
        alt="Your van"
        draggable={false}
        style={{
          left: pose.x,
          top: pose.y,
          transform: `rotate(${pose.angle}deg)`,
        }}
      />
      {skipDrive && onStandTap ? (
        <button
          type="button"
          className="map-stand-hit"
          aria-label="Open West Falls Sticker Stand"
          onClick={onStandTap}
        />
      ) : null}
      <StatusBar />
      <header className="map-header">
        <button type="button" className="map-back" aria-label="Back">
          <img src={backChevron} alt="" draggable={false} />
        </button>
        <div className="map-header-copy">
          <h1>Your Mind Map</h1>
          <p>Now in Starter County</p>
        </div>
        <div className="map-miles" aria-hidden>
          <span className="map-miles-value">823</span>
          <span className="map-miles-unit">MI</span>
        </div>
      </header>
      <div className={`map-dim${dimmed ? ' map-dim--visible' : ''}`} aria-hidden />
    </section>
  )
}

function IPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="phone-frame" aria-label="iPhone 15 Pro prototype">
      <div className="phone-screen">{children}</div>
    </section>
  )
}

function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`status-bar${dark ? ' status-bar--dark' : ''}`}>
      <span>9:41</span>
      <div className="dynamic-island" />
      <span className="status-icons" aria-hidden="true">
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="9" y="3" width="3" height="9" rx="1" />
          <rect x="13.5" y="0" width="3" height="12" rx="1" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path
            d="M1.76 7.3A7.2 7.2 0 0 1 14.24 7.3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M4.02 8.6A4.6 4.6 0 0 1 11.98 8.6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="8" cy="10.2" r="1.7" fill="currentColor" />
        </svg>
        <svg width="27" height="13" viewBox="0 0 27 13" fill="none">
          <rect
            x="0.5"
            y="0.5"
            width="23"
            height="12"
            rx="3.8"
            stroke="currentColor"
            strokeOpacity="0.4"
          />
          <rect x="2" y="2" width="17" height="9" rx="2.3" fill="currentColor" />
          <rect
            x="25"
            y="4.5"
            width="1.6"
            height="4"
            rx="0.8"
            fill="currentColor"
            fillOpacity="0.4"
          />
        </svg>
      </span>
    </div>
  )
}

function StickerPackage({
  set,
  index,
  active,
  dealStarted,
  packageRef,
  stickerRef,
  isTransitioning,
}: {
  set: StickerSet
  index: number
  active: boolean
  dealStarted: boolean
  packageRef: (element: HTMLDivElement | null) => void
  stickerRef: (element: HTMLImageElement | null) => void
  isTransitioning: boolean
}) {
  return (
    <div
      className={`sticker-package ${active ? 'sticker-package--active' : ''}${
        dealStarted ? ' sticker-package--dealing' : ''
      }${isTransitioning && active ? ' sticker-package--transitioning' : ''}`}
      style={
        {
          '--stack-index': index,
          '--deal-delay': `${(2 - index) * 120}ms`,
          '--deal-x': `${[-110, 120, -95][index]}px`,
          '--deal-y': `${[-70, -55, -85][index]}px`,
          '--deal-rotation': `${[-12, 11, -10][index]}deg`,
          '--deal-scale': [0.92, 0.93, 0.92][index],
        } as CSSProperties
      }
      aria-hidden={!active}
    >
      <div className="deal-animation-wrapper">
        <div className="drag-animation-wrapper" ref={packageRef}>
          <div className="package-layer-wrapper">
            <img className="package-back" src={set.packageBack} alt="" draggable={false} />
            <img
              ref={stickerRef}
              className={`package-sticker${isTransitioning && active ? ' package-sticker--lifting' : ''}`}
              src={set.stickerArt}
              alt=""
              draggable={false}
            />
            <img className="package-front" src={set.packageFront} alt="" draggable={false} />
            <img className="package-header" src={sharedPackage.packageHeader} alt="" draggable={false} />
          </div>
        </div>
      </div>
    </div>
  )
}

type PackagePose = {
  x: number
  y: number
  rotation: number
  scale: number
  opacity: number
  zIndex: number
}

const STACK_POSES: PackagePose[] = [
  { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1, zIndex: 5 },
  { x: 7, y: 5, rotation: 1.4, scale: 0.975, opacity: 0.82, zIndex: 4 },
  { x: 14, y: 10, rotation: 2.8, scale: 0.95, opacity: 0.64, zIndex: 3 },
]
const SWAP_EASING = 'cubic-bezier(0.22, 0.8, 0.28, 1)'

function poseFor(index: number, activeIndex: number) {
  return STACK_POSES[(index - activeIndex + stickerSets.length) % stickerSets.length]
}

function StickerCarousel({
  activeIndex,
  onChange,
  activeStickerRef,
  disabled,
  onIntroComplete,
  dealGate = true,
}: {
  activeIndex: number
  onChange: (index: number) => void
  activeStickerRef: (element: HTMLImageElement | null) => void
  disabled: boolean
  onIntroComplete: () => void
  dealGate?: boolean
}) {
  const [dealStarted, setDealStarted] = useState(false)
  const [isIntroComplete, setIntroComplete] = useState(false)
  const packageRefs = useRef(new Map<string, HTMLDivElement>())
  const gesture = useRef<{ x: number; time: number; dx: number } | null>(null)
  const activeIndexRef = useRef(activeIndex)
  const locked = useRef(true)
  const frame = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)
  const introStarted = useRef(false)

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    if (!dealGate) return
    if (introStarted.current) return
    introStarted.current = true
    const sources = [
      sharedPackage.packageHeader,
      ...stickerSets.flatMap((set) => [set.packageBack, set.stickerArt, set.packageFront]),
    ]
    let completeTimer: number | null = null
    // Back→front: max stagger 240ms + 600ms deal + settle buffer.
    const DEAL_COMPLETE_MS = 240 + 600 + 80

    const startDeal = () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setDealStarted(true)
        completeTimer = window.setTimeout(() => {
          setIntroComplete(true)
          locked.current = false
          onIntroComplete()
        }, 200)
        return
      }
      setDealStarted(true)
      completeTimer = window.setTimeout(() => {
        setIntroComplete(true)
        locked.current = false
        onIntroComplete()
      }, DEAL_COMPLETE_MS)
    }

    Promise.all(
      sources.map(
        (src) =>
          new Promise<void>((resolve) => {
            const image = new Image()
            image.onload = () => resolve()
            image.onerror = () => resolve()
            image.src = src
          }),
      ),
    ).then(() => {
      startDeal()
    })
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      if (settleTimer.current) window.clearTimeout(settleTimer.current)
      if (completeTimer) window.clearTimeout(completeTimer)
    }
  }, [dealGate, onIntroComplete])

  const elementFor = (index: number) => packageRefs.current.get(stickerSets[index].id)

  const applyPose = (
    element: HTMLDivElement | undefined,
    pose: PackagePose,
    duration = 0,
  ) => {
    if (!element) return
    element.style.transition = duration
      ? `transform ${duration}ms ${SWAP_EASING}, opacity ${duration}ms ease-out`
      : 'none'
    element.style.transform = `translate3d(${pose.x}px, ${pose.y}px, 0) rotate(${pose.rotation}deg) scale(${pose.scale})`
    element.style.opacity = String(pose.opacity)
    element.style.zIndex = String(pose.zIndex)
  }

  const clearInlinePoses = () => {
    stickerSets.forEach((set) => {
      const element = packageRefs.current.get(set.id)
      if (!element) return
      element.style.transition = ''
      element.style.transform = ''
      element.style.opacity = ''
      element.style.zIndex = ''
    })
  }

  const renderDrag = () => {
    frame.current = null
    const currentGesture = gesture.current
    if (!currentGesture) return
    const dx = currentGesture.dx
    const direction = dx < 0 ? 1 : -1
    const current = activeIndexRef.current
    const incomingIndex = (current + direction + stickerSets.length) % stickerSets.length
    const active = poseFor(current, current)
    const incomingRest = poseFor(incomingIndex, current)
    const progress = Math.min(Math.abs(dx) / 128, 0.9)
    const rotation = Math.sign(dx) * Math.min(4, (Math.abs(dx) / 110) * 4)

    applyPose(elementFor(current), {
      x: dx,
      y: Math.min(10, Math.abs(dx) * 0.04),
      rotation,
      scale: 1 - Math.min(0.03, (Math.abs(dx) / 128) * 0.03),
      opacity: active.opacity,
      zIndex: 6,
    })
    applyPose(elementFor(incomingIndex), {
      x: incomingRest.x * (1 - progress),
      y: incomingRest.y * (1 - progress),
      rotation: incomingRest.rotation * (1 - progress),
      scale: 0.96 + progress * 0.04,
      opacity: incomingRest.opacity + progress * (1 - incomingRest.opacity),
      zIndex: 5,
    })
  }

  const settle = (shouldSwap: boolean, dx: number) => {
    const current = activeIndexRef.current
    const direction = dx < 0 ? 1 : -1
    const next = (current + direction + stickerSets.length) % stickerSets.length
    locked.current = true
    gesture.current = null
    if (frame.current) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }

    if (!shouldSwap) {
      stickerSets.forEach((_, index) => applyPose(elementFor(index), poseFor(index, current), 200))
      settleTimer.current = window.setTimeout(() => {
        clearInlinePoses()
        locked.current = false
      }, 205)
      return
    }

    // Send the outgoing card beyond the pointer while the incoming card settles
    // to center. The remaining package moves to its next stack position.
    stickerSets.forEach((_, index) => {
      const element = elementFor(index)
      if (index === current) {
        applyPose(element, {
          x: Math.sign(dx) * 118,
          y: 12,
          rotation: Math.sign(dx) * 5,
          scale: 0.95,
          opacity: 0,
          zIndex: 2,
        }, 300)
      } else {
        applyPose(element, poseFor(index, next), 300)
      }
    })
    settleTimer.current = window.setTimeout(() => onChange(next), 300)
    window.setTimeout(() => {
      clearInlinePoses()
      locked.current = false
    }, 305)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !isIntroComplete || locked.current || !event.isPrimary) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = { x: event.clientX, time: performance.now(), dx: 0 }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const currentGesture = gesture.current
    if (!currentGesture) return
    currentGesture.dx = event.clientX - currentGesture.x
    if (frame.current === null) frame.current = requestAnimationFrame(renderDrag)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const currentGesture = gesture.current
    if (!currentGesture) return
    const dx = event.clientX - currentGesture.x
    const velocity = dx / Math.max(performance.now() - currentGesture.time, 1)
    const shouldMove = Math.abs(dx) > 40 || (Math.abs(dx) > 8 && Math.abs(velocity) > 0.35)
    settle(shouldMove, dx || 1)
  }
  return (
    <div
      className={`carousel${dealStarted ? ' carousel--dealing' : ' carousel--loading'}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        if (gesture.current) settle(false, 1)
      }}
    >
      {stickerSets.map((set, index) => {
        const offset = (index - activeIndex + stickerSets.length) % stickerSets.length
        return (
          <StickerPackage
            key={set.id}
            set={set}
            index={offset}
            active={index === activeIndex}
            dealStarted={dealStarted && !isIntroComplete}
            packageRef={(element) => {
              if (element) packageRefs.current.set(set.id, element)
              else packageRefs.current.delete(set.id)
            }}
            stickerRef={index === activeIndex ? activeStickerRef : () => {}}
            isTransitioning={disabled}
          />
        )
      })}
    </div>
  )
}

function StickerDetails({ set, visible }: { set: StickerSet; visible: boolean }) {
  const [displayedSet, setDisplayedSet] = useState(set)
  const [isLeaving, setLeaving] = useState(false)

  useEffect(() => {
    if (set.id === displayedSet.id) return
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setDisplayedSet(set)
      setLeaving(false)
    }, 70)
    return () => window.clearTimeout(timer)
  }, [set, displayedSet])

  return (
    <div
      className={`sticker-details${visible ? ' sticker-details--visible' : ''}${
        isLeaving ? ' sticker-details--leaving' : ''
      }`}
      key={displayedSet.id}
    >
      <h1>{displayedSet.title}</h1>
      <p>{displayedSet.description}</p>
    </div>
  )
}

function SelectStickerButton({
  onSelectSticker,
  disabled,
  visible,
  asSheet = false,
}: {
  onSelectSticker: () => void
  disabled: boolean
  visible: boolean
  asSheet?: boolean
}) {
  return (
    <button
      className={`select-sticker-button${asSheet ? ' select-sticker-button--sheet' : ''}${visible ? ' select-sticker-button--visible' : ''}`}
      onClick={onSelectSticker}
      disabled={disabled || !visible}
    >
      {asSheet ? 'Select This Sticker' : 'Select Sticker'}
    </button>
  )
}

function StickerSelectionScreen({
  activeIndex,
  onChange,
  onSelectSticker,
  onSaveForLater,
  activeStickerRef,
  isTransitioning,
  transitionStage,
  asSheet = false,
  sheetOpen = false,
  sheetReady = false,
}: {
  activeIndex: number
  onChange: (index: number) => void
  onSelectSticker: () => void
  onSaveForLater?: () => void
  activeStickerRef: (element: HTMLImageElement | null) => void
  isTransitioning: boolean
  transitionStage: TransitionStage
  asSheet?: boolean
  sheetOpen?: boolean
  sheetReady?: boolean
}) {
  const [isIntroComplete, setIntroComplete] = useState(false)
  const carousel = (
    <StickerCarousel
      activeIndex={activeIndex}
      onChange={onChange}
      activeStickerRef={activeStickerRef}
      disabled={isTransitioning}
      dealGate={asSheet ? sheetReady : true}
      onIntroComplete={() => setIntroComplete(true)}
    />
  )
  const details = <StickerDetails set={stickerSets[activeIndex]} visible={isIntroComplete} />

  if (asSheet) {
    return (
      <div
        className={`selection-screen selection-screen--sheet${sheetOpen ? ' selection-screen--sheet-open' : ''}${transitionStage !== 'idle' ? ` selection-screen--${transitionStage}` : ''}`}
        style={{ backgroundImage: `url(${selectionBackground})` }}
      >
        <div className="selection-sheet-layout">
          <section className="selection-sheet-section selection-sheet-section--sign">
            <div className="west-falls-banner">
              <img src={westFallsBanner} alt="West Falls Sticker Stand" draggable={false} />
            </div>
          </section>
          <section className="selection-sheet-section selection-sheet-section--pack">
            {carousel}
            {details}
          </section>
          <section
            className={`selection-sheet-section selection-sheet-section--actions${isIntroComplete ? ' selection-sheet-actions--visible' : ''}`}
          >
            <SelectStickerButton
              onSelectSticker={onSelectSticker}
              disabled={isTransitioning}
              visible={isIntroComplete}
              asSheet
            />
            <button
              type="button"
              className="save-for-later-sheet-button"
              onClick={onSaveForLater}
              disabled={isTransitioning || !isIntroComplete}
            >
              Save For Later
            </button>
          </section>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`selection-screen${transitionStage !== 'idle' ? ` selection-screen--${transitionStage}` : ''}`}
      style={{ backgroundImage: `url(${selectionBackground})` }}
    >
      <StatusBar />
      {carousel}
      {details}
      <SelectStickerButton
        onSelectSticker={onSelectSticker}
        disabled={isTransitioning}
        visible={isIntroComplete}
      />
    </div>
  )
}

function clampVanOffset(offset: number) {
  const left = VAN_INITIAL_LEFT + offset
  const minLeft = VAN_VISIBLE_MIN - VAN_WIDTH
  const maxLeft = SCENE_WIDTH - VAN_VISIBLE_MIN
  const clampedLeft = Math.max(minLeft, Math.min(maxLeft, left))
  return clampedLeft - VAN_INITIAL_LEFT
}

function PlacedSticker({
  sticker,
  stickerRef,
  position,
}: {
  sticker: StickerSet
  stickerRef: (element: HTMLImageElement | null) => void
  position: StickerPosition
}) {
  return (
    <img
      ref={stickerRef}
      className="placed-sticker"
      src={sticker.stickerArt}
      alt={`${sticker.title} on the van`}
      draggable={false}
      style={{ left: position.x, top: position.y }}
    />
  )
}

function DraggableVan({
  sticker,
  stickerRef,
  stickerPosition,
  onStickerPositionChange,
  locked = false,
}: {
  sticker: StickerSet
  stickerRef: (element: HTMLImageElement | null) => void
  stickerPosition: StickerPosition
  onStickerPositionChange: (position: StickerPosition) => void
  locked?: boolean
}) {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const offsetRef = useRef(0)
  const gesture = useRef<{
    startX: number
    startY: number
    startOffset: number
    dragging: boolean
  } | null>(null)
  const vanWrapperRef = useRef<HTMLDivElement | null>(null)
  const vanRef = useRef<HTMLImageElement | null>(null)
  const alphaCanvas = useRef<HTMLCanvasElement | null>(null)

  const hitTestsVan = (clientX: number, clientY: number) => {
    const image = vanRef.current
    const canvas = alphaCanvas.current
    if (!image || !canvas) return false
    const box = image.getBoundingClientRect()
    if (
      clientX < box.left ||
      clientX > box.right ||
      clientY < box.top ||
      clientY > box.bottom
    ) {
      return false
    }
    const x = Math.floor(((clientX - box.left) / box.width) * image.naturalWidth)
    const y = Math.floor(((clientY - box.top) / box.height) * image.naturalHeight)
    const pixel = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data
    return Boolean(pixel && pixel[3] >= 20)
  }

  const stickerPositionFor = (clientX: number, clientY: number): StickerPosition | null => {
    const wrapper = vanWrapperRef.current
    if (!wrapper) return null
    const box = wrapper.getBoundingClientRect()
    const x = ((clientX - box.left) / box.width) * VAN_WIDTH
    const y = ((clientY - box.top) / box.height) * VAN_HEIGHT
    return {
      x: Math.max(STICKER_BOUNDS.minX, Math.min(STICKER_BOUNDS.maxX, x)),
      y: Math.max(STICKER_BOUNDS.minY, Math.min(STICKER_BOUNDS.maxY, y)),
    }
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (locked) return
    if (!hitTestsVan(event.clientX, event.clientY)) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offsetRef.current,
      dragging: false,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    if (!current.dragging && Math.hypot(dx, dy) < 8) return
    current.dragging = true
    setIsDragging(true)
    const next = clampVanOffset(current.startOffset + dx)
    offsetRef.current = next
    setOffset(next)
  }

  const endGesture = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current
    if (!current) return
    if (!current.dragging && !locked) {
      const position = stickerPositionFor(event.clientX, event.clientY)
      if (position) onStickerPositionChange(position)
    }
    gesture.current = null
    setIsDragging(false)
  }

  const cancelGesture = () => {
    gesture.current = null
    setIsDragging(false)
  }

  return (
    <>
      <canvas ref={alphaCanvas} className="alpha-canvas" aria-hidden />
      <div
        ref={vanWrapperRef}
        className={`van-transform${isDragging ? ' van-transform--dragging' : ''}${locked ? ' van-transform--locked' : ''}`}
        style={{ transform: `translate3d(${offset}px, 0, 0)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={cancelGesture}
      >
        <img
          ref={vanRef}
          className="van"
          src={vanArt}
          alt="Blue camper van"
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget
            const canvas = alphaCanvas.current
            if (!canvas) return
            canvas.width = image.naturalWidth
            canvas.height = image.naturalHeight
            canvas.getContext('2d')?.drawImage(image, 0, 0)
          }}
        />
        <PlacedSticker
          sticker={sticker}
          stickerRef={stickerRef}
          position={stickerPosition}
        />
      </div>
    </>
  )
}

function VanScene({
  sticker,
  stickerRef,
  stickerPosition,
  onStickerPositionChange,
  faded = false,
  locked = false,
}: {
  sticker: StickerSet
  stickerRef: (element: HTMLImageElement | null) => void
  stickerPosition: StickerPosition
  onStickerPositionChange: (position: StickerPosition) => void
  faded?: boolean
  locked?: boolean
}) {
  return (
    <section
      className={`van-scene${faded ? ' van-scene--faded' : ''}${locked ? ' van-scene--placed' : ''}`}
      aria-label="Campground scene"
    >
      <img className="campground" src={campground} alt="" draggable={false} />
      <DraggableVan
        sticker={sticker}
        stickerRef={stickerRef}
        stickerPosition={stickerPosition}
        onStickerPositionChange={onStickerPositionChange}
        locked={locked}
      />
    </section>
  )
}

function PlacementContent() {
  return (
    <div className="placement-content">
      <h1>Place Your Sticker</h1>
      <p>Drag your van to adjust the view, then tap where you want to place the sticker.</p>
    </div>
  )
}

function PlacementActions({ onPlace }: { onPlace: () => void }) {
  return (
    <div className="placement-actions">
      <button type="button" className="place-sticker-button" onClick={onPlace}>
        Place Sticker
      </button>
    </div>
  )
}

function PlaceStickerScreen({
  sticker,
  stickerRef,
  isTransitioning = false,
  transitionStage = 'idle',
  onContinue,
}: {
  sticker: StickerSet
  stickerRef: (element: HTMLImageElement | null) => void
  isTransitioning?: boolean
  transitionStage?: TransitionStage
  onContinue: () => void
}) {
  const [stickerPosition, setStickerPosition] = useState<StickerPosition>(
    readSavedStickerPosition,
  )

  const handlePlace = () => {
    sessionStorage.setItem('selectedStickerId', sticker.id)
    sessionStorage.setItem('selectedStickerPosition', JSON.stringify(stickerPosition))
    onContinue()
  }

  return (
    <div
      className={`placement-screen${isTransitioning ? ' placement-screen--transitioning' : ''} placement-screen--${transitionStage}`}
    >
      <VanScene
        sticker={sticker}
        stickerRef={stickerRef}
        stickerPosition={stickerPosition}
        onStickerPositionChange={setStickerPosition}
        faded
        locked={false}
      />
      <div className="placement-panel">
        <PlacementContent />
        <PlacementActions onPlace={handlePlace} />
      </div>
      <StatusBar dark />
    </div>
  )
}

const DRIVE_OFF_DURATION_MS = 2800

function DriveOffScreen({
  sticker,
  onComplete,
  onChangePlacement,
}: {
  sticker: StickerSet
  onComplete: () => void
  onChangePlacement: () => void
}) {
  const [driving, setDriving] = useState(false)
  const stickerPercent = stickerPositionToDriveOffPercent(readSavedStickerPosition())
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (!driving) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(
      () => onCompleteRef.current(),
      reduced ? 400 : DRIVE_OFF_DURATION_MS,
    )
    return () => window.clearTimeout(timer)
  }, [driving])

  return (
    <div className="drive-off-screen" aria-label="Van driving off">
      <img className="drive-off-coast" src={driveOffCoast} alt="" draggable={false} />
      <div className={`drive-off-van-wrap${driving ? ' drive-off-van-wrap--driving' : ''}`}>
        <img className="drive-off-van" src={driveOffVan} alt="" draggable={false} />
        <img
          className="drive-off-sticker"
          src={sticker.stickerArt}
          alt=""
          draggable={false}
          style={{ left: `${stickerPercent.left}%`, top: `${stickerPercent.top}%` }}
        />
      </div>
      {!driving ? (
        <div className="drive-off-actions">
          <button
            type="button"
            className="place-sticker-button"
            onClick={() => setDriving(true)}
          >
            Continue
          </button>
          <button
            type="button"
            className="save-for-later-button"
            onClick={onChangePlacement}
          >
            Change Placement
          </button>
        </div>
      ) : null}
      <StatusBar />
    </div>
  )
}

type TransitionStage = 'idle' | 'lifting' | 'crossfading' | 'landing' | 'complete'

type StickerRect = {
  left: number
  top: number
  width: number
  height: number
}

const LIFT_DISTANCE = 152
const LIFT_DURATION = 400
const HOVER_DURATION = 140
const DROP_DURATION = 340
// Small gap so the drop transition has finished painting before the overlay is
// swapped for the real placed sticker.
const HANDOFF_DELAY = 40

/**
 * Rect of the artwork actually painted by an `<img>`, expressed in the 393pt
 * screen coordinate space the overlay lives in. Both stickers use
 * `object-fit: contain`, so the element box can be taller/wider than the
 * bitmap; matching element boxes would leave the drop off by the letterboxing.
 */
function measureArtwork(
  element: HTMLImageElement,
  phone: DOMRect,
  fallbackAspect?: number,
): StickerRect {
  const scale = phone.width / SCENE_WIDTH
  const box = element.getBoundingClientRect()
  const left = (box.left - phone.left) / scale
  const top = (box.top - phone.top) / scale
  const boxWidth = box.width / scale
  const boxHeight = box.height / scale
  const aspect =
    element.naturalWidth && element.naturalHeight
      ? element.naturalWidth / element.naturalHeight
      : fallbackAspect ?? (boxHeight ? boxWidth / boxHeight : 1)

  // An `height: auto` image reports zero height until its bitmap is decoded.
  // The placed sticker is centred on its anchor point, so grow it around the
  // measured centre instead of the (collapsed) box.
  if (!boxHeight || !boxWidth) {
    const height = boxWidth / aspect
    return { left, top: top - height / 2, width: boxWidth, height }
  }

  const width = Math.min(boxWidth, boxHeight * aspect)
  const height = width / aspect
  return {
    left: left + (boxWidth - width) / 2,
    top: top + (boxHeight - height) / 2,
    width,
    height,
  }
}

function StickerTransitionOverlay({
  sticker,
  source,
  target,
  stage,
}: {
  sticker: StickerSet
  source: StickerRect | null
  target: StickerRect | null
  stage: TransitionStage
}) {
  if (!source || !target || stage === 'idle' || stage === 'complete') return null
  const targetScale = target.width / source.width
  // The overlay scales about its centre, so shrinking pulls every edge inward
  // by half the lost size. Offset the translation by that much so the box lands
  // exactly on the target rect rather than half a sticker away from it.
  const landingX = target.left - source.left - ((1 - targetScale) * source.width) / 2
  const landingY = target.top - source.top - ((1 - targetScale) * source.height) / 2
  const style = {
    '--source-left': `${source.left}px`,
    '--source-top': `${source.top}px`,
    '--source-width': `${source.width}px`,
    '--source-height': `${source.height}px`,
    '--lift': `${LIFT_DISTANCE}px`,
    '--lift-duration': `${LIFT_DURATION}ms`,
    '--drop-duration': `${DROP_DURATION}ms`,
    '--landing-x': `${landingX}px`,
    '--landing-y': `${landingY}px`,
    '--target-scale': String(targetScale),
  } as CSSProperties

  return (
    <div className={`sticker-transition-overlay sticker-transition-overlay--${stage}`} aria-hidden style={style}>
      <img src={sticker.stickerArt} alt="" draggable={false} />
    </div>
  )
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('map')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetReady, setSheetReady] = useState(false)
  const [standReached, setStandReached] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectedStickerId, setSelectedStickerId] = useState(() => {
    const savedId = sessionStorage.getItem('selectedStickerId')
    return getStickerById(savedId ?? '')?.id ?? 'hike'
  })
  const [stage, setStage] = useState<TransitionStage>('idle')
  const [overlayRects, setOverlayRects] = useState<{ source: StickerRect; target: StickerRect } | null>(null)
  const sourceStickerRef = useRef<HTMLImageElement | null>(null)
  const targetStickerRef = useRef<HTMLImageElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const timers = useRef<number[]>([])
  const isTransitioning = stage !== 'idle' && stage !== 'complete'
  const selectedSticker = getStickerById(selectedStickerId) ?? stickerSets[0]
  const showMap = screen === 'map' || screen === 'selection'
  const showSelection = screen === 'selection' || isTransitioning

  useEffect(() => {
    return () => timers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  useEffect(() => {
    if (!sheetOpen) {
      setSheetReady(false)
      return
    }
    const sheet = sheetRef.current
    if (!sheet) return

    let settled = false
    let settleTimer: number | null = null
    const markReady = () => {
      if (settled) return
      settled = true
      settleTimer = window.setTimeout(() => setSheetReady(true), 40)
    }

    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== sheet) return
      if (event.propertyName !== 'transform') return
      window.clearTimeout(fallbackTimer)
      markReady()
    }

    sheet.addEventListener('transitionend', onTransitionEnd)
    // Fallback if transitionend is skipped (e.g. reduced motion / already open).
    const fallbackTimer = window.setTimeout(markReady, 750)

    return () => {
      sheet.removeEventListener('transitionend', onTransitionEnd)
      window.clearTimeout(fallbackTimer)
      if (settleTimer) window.clearTimeout(settleTimer)
    }
  }, [sheetOpen])

  // Measured before paint so the overlay is already sitting on the package
  // sticker for the first frame of the lift. The target is re-measured once the
  // placement screen has settled, by which point the placed sticker's bitmap
  // has decoded and its `height: auto` box is real.
  useLayoutEffect(() => {
    if (stage !== 'lifting' && stage !== 'crossfading') return
    const source = sourceStickerRef.current
    const target = targetStickerRef.current
    const phone = (source ?? target)?.closest('.phone-screen')?.getBoundingClientRect()
    if (!phone) return
    setOverlayRects((current) => {
      const sourceRect = source ? measureArtwork(source, phone) : current?.source
      if (!sourceRect) return current
      const targetRect = target
        ? measureArtwork(target, phone, sourceRect.width / sourceRect.height)
        : current?.target
      if (!targetRect) return current
      return { source: sourceRect, target: targetRect }
    })
  }, [stage])

  const handleMapArrived = () => {
    setStandReached(true)
    setScreen('selection')
    // Next frame so the sheet mounts off-screen before sliding up.
    window.requestAnimationFrame(() => setSheetOpen(true))
  }

  const handleStandTap = () => {
    if (sheetOpen || screen === 'selection') return
    setStandReached(true)
    setScreen('selection')
    window.requestAnimationFrame(() => setSheetOpen(true))
  }

  const handleSaveForLater = () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
    setStage('idle')
    setOverlayRects(null)
    setSheetOpen(false)
    setSheetReady(false)
    setStandReached(true)
    setScreen('map')
  }

  const handleContinueToDriveOff = () => {
    setSheetOpen(false)
    setSheetReady(false)
    setStage('idle')
    setOverlayRects(null)
    setScreen('driveOff')
  }

  const handleDriveOffComplete = () => {
    setStandReached(true)
    setScreen('map')
  }

  const handleChangePlacement = () => {
    setScreen('placement')
  }

  const handleSelectSticker = () => {
    if (isTransitioning) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sticker = stickerSets[activeIndex]
    setSelectedStickerId(sticker.id)
    sessionStorage.setItem('selectedStickerId', sticker.id)
    setStage('lifting')

    const crossfadeAt = LIFT_DURATION
    const dropAt = crossfadeAt + HOVER_DURATION
    const handoffAt = dropAt + DROP_DURATION + HANDOFF_DELAY

    timers.current = [
      window.setTimeout(() => {
        setScreen('placement')
        setSheetOpen(false)
        setSheetReady(false)
        setStage('crossfading')
      }, reducedMotion ? 20 : crossfadeAt),
      window.setTimeout(() => setStage('landing'), reducedMotion ? 40 : dropAt),
      window.setTimeout(() => {
        setStage('complete')
        setOverlayRects(null)
      }, reducedMotion ? 60 : handoffAt),
    ]
  }

  return (
    <div className="desktop-shell">
      <IPhoneFrame>
        {showMap ? (
          <MapScreen
            dimmed={showSelection && sheetOpen}
            skipDrive={standReached}
            onArrived={handleMapArrived}
            onStandTap={handleStandTap}
          />
        ) : null}
        {showSelection ? (
          <div
            ref={sheetRef}
            className={`selection-sheet${sheetOpen ? ' selection-sheet--open' : ''}`}
          >
            <StickerSelectionScreen
              asSheet
              sheetOpen={sheetOpen}
              sheetReady={sheetReady}
              activeIndex={activeIndex}
              onChange={setActiveIndex}
              onSelectSticker={handleSelectSticker}
              onSaveForLater={handleSaveForLater}
              activeStickerRef={(element) => {
                sourceStickerRef.current = element
              }}
              isTransitioning={isTransitioning}
              transitionStage={stage}
            />
          </div>
        ) : null}
        {screen === 'placement' || isTransitioning ? (
          <PlaceStickerScreen
            key={`${selectedStickerId}-placement`}
            sticker={selectedSticker}
            stickerRef={(element) => {
              targetStickerRef.current = element
            }}
            isTransitioning={isTransitioning}
            transitionStage={stage}
            onContinue={handleContinueToDriveOff}
          />
        ) : null}
        {screen === 'driveOff' ? (
          <DriveOffScreen
            sticker={selectedSticker}
            onComplete={handleDriveOffComplete}
            onChangePlacement={handleChangePlacement}
          />
        ) : null}
        <StickerTransitionOverlay
          sticker={selectedSticker}
          source={overlayRects?.source ?? null}
          target={overlayRects?.target ?? null}
          stage={stage}
        />
      </IPhoneFrame>
    </div>
  )
}

export default App
