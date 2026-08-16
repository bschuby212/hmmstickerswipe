import woodBg from '../assets/backgrounds/wood-bg.png'
import packageBack from '../assets/packages/package-back.png'
import packageFront from '../assets/packages/package-front.png'
import packageHeader from '../assets/packages/package-header.png'
import stickerCar from '../assets/stickers/sticker-car.png'
import stickerHike from '../assets/stickers/sticker-hike.png'
import stickerTurtle from '../assets/stickers/sticker-turtle.png'

export type StickerSet = {
  id: string
  stickerArt: string
  packageBack: string
  packageFront: string
  title: string
  description: string
}

export type AppScreen = 'selection' | 'placement'

/**
 * Shared packaging layers — one front / back / header for all sets.
 */
export const sharedPackage = {
  packageBack,
  packageFront,
  packageHeader,
} as const

/** Wood tabletop from Sticker Stand/screen 1 background.png */
export const selectionBackground = woodBg

export const stickerSets: StickerSet[] = [
  {
    id: 'turtle',
    stickerArt: stickerTurtle,
    packageBack: sharedPackage.packageBack,
    packageFront: sharedPackage.packageFront,
    title: 'Adventure Sticker',
    description:
      'Complete 30 wellness activities in your first month using Healthy Mind Map.',
  },
  {
    id: 'hike',
    stickerArt: stickerHike,
    packageBack: sharedPackage.packageBack,
    packageFront: sharedPackage.packageFront,
    title: 'Hike Sticker',
    description:
      'Take a mindful moment outside and discover a new path to feeling your best.',
  },
  {
    id: 'car',
    stickerArt: stickerCar,
    packageBack: sharedPackage.packageBack,
    packageFront: sharedPackage.packageFront,
    title: 'Car Sticker',
    description:
      'Adventure is closer than it appears — celebrate the journeys that get you there.',
  },
]

export function getStickerById(id: string): StickerSet | undefined {
  return stickerSets.find((set) => set.id === id)
}
