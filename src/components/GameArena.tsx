import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Button } from './ui/button'
import { Card } from './ui/card'
import { Progress } from './ui/progress'
import { Slider } from './ui/slider'

// Game types
interface Character {
  id: string
  team: 'vegan' | 'meatLover'
  x: number
  y: number
  health: number
  maxHealth: number
  name: string
  vy: number // Vertical velocity for falling
  isGrounded: boolean // Whether character is on solid ground
  fallDistance: number // Track how far character has fallen
  movementLeft: number // Movement points remaining this turn
  hasJumped: boolean // Whether character has jumped this turn
}

interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  type: string
  team: 'vegan' | 'meatLover'
  active: boolean
  bounces: number // Track bounces for grenades
  fuseTime: number // Fuse timer for grenades
}

interface Explosion {
  x: number
  y: number
  radius: number
  particles: Array<{
    x: number
    y: number
    vx: number
    vy: number
    life: number
    maxLife: number
    color: string
  }>
}

interface GameState {
  characters: Character[]
  currentPlayer: number
  currentTeam: 'vegan' | 'meatLover'
  turnTimeLeft: number
  wind: number
  gamePhase: 'setup' | 'movement' | 'aiming' | 'firing' | 'gameOver'
  selectedWeapon: string
  power: number
  angle: number
  projectiles: Projectile[]
  terrain: number[] // Height map for destructible terrain
  explosions: Explosion[]
}

// Traditional Worms Armageddon weapons with realistic physics
const VEGAN_WEAPONS = [
  { id: 'bazooka', name: 'Bazooka', damage: 45, color: '#8B4513', explosionRadius: 30, bounces: false, fuseTime: 0 },
  { id: 'grenade', name: 'Grenade', damage: 50, color: '#228B22', explosionRadius: 35, bounces: true, fuseTime: 180 }, // 3 seconds at 60fps
  { id: 'shotgun', name: 'Shotgun', damage: 25, color: '#4682B4', explosionRadius: 15, bounces: false, fuseTime: 0 },
  { id: 'uzi', name: 'Uzi (Burst)', damage: 15, color: '#696969', explosionRadius: 10, bounces: false, fuseTime: 0 }, // Fires 5 bullets
  { id: 'dynamite', name: 'Dynamite', damage: 75, color: '#DC143C', explosionRadius: 50, bounces: false, fuseTime: 300 }, // 5 seconds
  { id: 'drill', name: 'Drill', damage: 20, color: '#FFD700', explosionRadius: 60, bounces: false, fuseTime: 0 } // New tunnel digger
]

const MEAT_WEAPONS = [
  { id: 'bazooka', name: 'Bazooka', damage: 45, color: '#8B4513', explosionRadius: 30, bounces: false, fuseTime: 0 },
  { id: 'grenade', name: 'Grenade', damage: 50, color: '#228B22', explosionRadius: 35, bounces: true, fuseTime: 180 }, // 3 seconds at 60fps
  { id: 'shotgun', name: 'Shotgun', damage: 25, color: '#4682B4', explosionRadius: 15, bounces: false, fuseTime: 0 },
  { id: 'uzi', name: 'Uzi (Burst)', damage: 15, color: '#696969', explosionRadius: 10, bounces: false, fuseTime: 0 }, // Fires 5 bullets
  { id: 'dynamite', name: 'Dynamite', damage: 75, color: '#DC143C', explosionRadius: 50, bounces: false, fuseTime: 300 }, // 5 seconds
  { id: 'drill', name: 'Drill', damage: 20, color: '#FFD700', explosionRadius: 60, bounces: false, fuseTime: 0 } // New tunnel digger
]

const GameArena: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Enhanced realistic sound effects using Web Audio API
  const createAudioContext = () => {
    try {
      return new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.log('Audio not supported')
      return null
    }
  }

  const playComplexSound = (config: {
    frequencies: number[]
    durations: number[]
    types: ('sine' | 'square' | 'sawtooth' | 'triangle')[]
    volumes: number[]
    delays?: number[]
    noiseAmount?: number
  }) => {
    const audioContext = createAudioContext()
    if (!audioContext) return

    config.frequencies.forEach((freq, index) => {
      const delay = config.delays?.[index] || 0
      
      setTimeout(() => {
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        const filterNode = audioContext.createBiquadFilter()
        
        // Add noise for realism
        let noiseBuffer: AudioBuffer | null = null
        let noiseSource: AudioBufferSourceNode | null = null
        
        if (config.noiseAmount && config.noiseAmount > 0) {
          const bufferSize = audioContext.sampleRate * 0.1
          noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate)
          const output = noiseBuffer.getChannelData(0)
          
          for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * config.noiseAmount
          }
          
          noiseSource = audioContext.createBufferSource()
          noiseSource.buffer = noiseBuffer
          noiseSource.loop = true
          
          const noiseGain = audioContext.createGain()
          noiseGain.gain.setValueAtTime(config.volumes[index] * 0.3, audioContext.currentTime)
          noiseSource.connect(noiseGain)
          noiseGain.connect(audioContext.destination)
          noiseSource.start(audioContext.currentTime)
          noiseSource.stop(audioContext.currentTime + config.durations[index])
        }
        
        // Setup oscillator
        oscillator.connect(filterNode)
        filterNode.connect(gainNode)
        gainNode.connect(audioContext.destination)
        
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime)
        oscillator.type = config.types[index] || 'sine'
        
        // Dynamic frequency modulation for realism
        if (index === 0) {
          oscillator.frequency.exponentialRampToValueAtTime(freq * 0.7, audioContext.currentTime + config.durations[index] * 0.8)
        }
        
        // Filter for more realistic sound
        filterNode.type = 'lowpass'
        filterNode.frequency.setValueAtTime(freq * 3, audioContext.currentTime)
        filterNode.frequency.exponentialRampToValueAtTime(freq * 0.5, audioContext.currentTime + config.durations[index])
        
        // Volume envelope
        gainNode.gain.setValueAtTime(0, audioContext.currentTime)
        gainNode.gain.linearRampToValueAtTime(config.volumes[index], audioContext.currentTime + 0.01)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + config.durations[index])
        
        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + config.durations[index])
      }, delay)
    })
  }
  
  const playWeaponSound = (weaponType: string) => {
    switch (weaponType) {
      case 'bazooka':
        // Realistic rocket launcher: whoosh + ignition + propulsion
        playComplexSound({
          frequencies: [200, 80, 150, 300],
          durations: [0.1, 0.3, 0.4, 0.2],
          types: ['sawtooth', 'square', 'triangle', 'sine'],
          volumes: [0.15, 0.25, 0.2, 0.1],
          delays: [0, 50, 100, 200],
          noiseAmount: 0.3
        })
        break
        
      case 'grenade':
        // Realistic grenade throw: metallic clink + pin pull + throw whoosh
        playComplexSound({
          frequencies: [800, 400, 200, 150],
          durations: [0.05, 0.1, 0.15, 0.2],
          types: ['square', 'triangle', 'sawtooth', 'sine'],
          volumes: [0.2, 0.15, 0.1, 0.08],
          delays: [0, 30, 80, 120],
          noiseAmount: 0.2
        })
        break
        
      case 'shotgun':
        // Realistic shotgun: sharp crack + echo + shell ejection
        playComplexSound({
          frequencies: [1200, 400, 800, 300],
          durations: [0.05, 0.2, 0.1, 0.15],
          types: ['square', 'sawtooth', 'triangle', 'square'],
          volumes: [0.3, 0.25, 0.15, 0.1],
          delays: [0, 20, 100, 200],
          noiseAmount: 0.4
        })
        break
        
      case 'uzi':
        // Realistic machine gun: rapid fire crack + mechanical action
        playComplexSound({
          frequencies: [600, 300, 1000],
          durations: [0.03, 0.05, 0.02],
          types: ['square', 'sawtooth', 'triangle'],
          volumes: [0.15, 0.12, 0.08],
          delays: [0, 10, 20],
          noiseAmount: 0.25
        })
        break
        
      case 'dynamite':
        // Realistic dynamite: fuse hiss + ignition spark
        playComplexSound({
          frequencies: [2000, 800, 400, 200],
          durations: [0.3, 0.2, 0.4, 0.6],
          types: ['sawtooth', 'triangle', 'square', 'sine'],
          volumes: [0.1, 0.15, 0.2, 0.25],
          delays: [0, 100, 200, 400],
          noiseAmount: 0.5
        })
        break
        
      case 'drill':
        // Realistic drill: motor start + drilling + metal grinding
        playComplexSound({
          frequencies: [1500, 800, 1200, 600],
          durations: [0.1, 0.3, 0.2, 0.4],
          types: ['sawtooth', 'square', 'triangle', 'sawtooth'],
          volumes: [0.2, 0.25, 0.2, 0.15],
          delays: [0, 50, 150, 250],
          noiseAmount: 0.6
        })
        break
    }
  }
  
  const playExplosionSound = (weaponType: string) => {
    switch (weaponType) {
      case 'bazooka':
        // Realistic rocket explosion: initial blast + rumble + debris
        playComplexSound({
          frequencies: [60, 120, 200, 80, 40],
          durations: [0.2, 0.4, 0.3, 0.6, 0.8],
          types: ['square', 'sawtooth', 'triangle', 'square', 'sine'],
          volumes: [0.4, 0.35, 0.25, 0.3, 0.2],
          delays: [0, 50, 100, 200, 400],
          noiseAmount: 0.7
        })
        break
        
      case 'grenade':
        // Realistic grenade explosion: sharp crack + pressure wave + shrapnel
        playComplexSound({
          frequencies: [80, 150, 300, 100, 60],
          durations: [0.15, 0.3, 0.2, 0.5, 0.7],
          types: ['square', 'sawtooth', 'triangle', 'square', 'sine'],
          volumes: [0.35, 0.3, 0.2, 0.25, 0.15],
          delays: [0, 30, 80, 150, 300],
          noiseAmount: 0.6
        })
        break
        
      case 'shotgun':
        // Realistic shotgun impact: pellet spread + surface impact
        playComplexSound({
          frequencies: [400, 800, 200, 600],
          durations: [0.1, 0.05, 0.2, 0.15],
          types: ['square', 'triangle', 'sawtooth', 'square'],
          volumes: [0.25, 0.2, 0.15, 0.1],
          delays: [0, 20, 50, 100],
          noiseAmount: 0.4
        })
        break
        
      case 'uzi':
        // Realistic bullet impact: crack + ricochet
        playComplexSound({
          frequencies: [800, 400, 1200, 300],
          durations: [0.05, 0.1, 0.03, 0.15],
          types: ['square', 'triangle', 'sawtooth', 'sine'],
          volumes: [0.2, 0.15, 0.1, 0.08],
          delays: [0, 20, 40, 80],
          noiseAmount: 0.3
        })
        break
        
      case 'dynamite':
        // Realistic dynamite explosion: massive blast + ground shake + echo
        playComplexSound({
          frequencies: [40, 80, 160, 60, 30, 100],
          durations: [0.3, 0.5, 0.4, 0.8, 1.0, 0.6],
          types: ['square', 'sawtooth', 'triangle', 'square', 'sine', 'triangle'],
          volumes: [0.5, 0.45, 0.35, 0.4, 0.3, 0.25],
          delays: [0, 100, 200, 300, 500, 700],
          noiseAmount: 0.8
        })
        break
        
      case 'drill':
        // Realistic drill impact: metal grinding + sparks + debris
        playComplexSound({
          frequencies: [1000, 500, 1500, 300, 800],
          durations: [0.2, 0.3, 0.15, 0.4, 0.25],
          types: ['sawtooth', 'square', 'triangle', 'sawtooth', 'square'],
          volumes: [0.3, 0.25, 0.2, 0.15, 0.2],
          delays: [0, 50, 100, 200, 300],
          noiseAmount: 0.7
        })
        break
    }
  }

  // Additional realistic sound effects
  const playBounceSound = () => {
    // Realistic grenade bounce: metallic clang + roll
    playComplexSound({
      frequencies: [600, 300, 800],
      durations: [0.05, 0.1, 0.08],
      types: ['triangle', 'square', 'sawtooth'],
      volumes: [0.15, 0.1, 0.08],
      delays: [0, 20, 50],
      noiseAmount: 0.2
    })
  }

  const playReloadSound = () => {
    // Realistic weapon reload: click + mechanical action
    playComplexSound({
      frequencies: [400, 800, 200],
      durations: [0.05, 0.03, 0.1],
      types: ['square', 'triangle', 'sawtooth'],
      volumes: [0.1, 0.08, 0.06],
      delays: [0, 30, 80],
      noiseAmount: 0.1
    })
  }

  const [gameState, setGameState] = useState<GameState>({
    characters: [],
    currentPlayer: 0,
    currentTeam: 'vegan',
    turnTimeLeft: 30,
    wind: 0,
    gamePhase: 'setup',
    selectedWeapon: 'bazooka',
    power: 50,
    angle: 45,
    projectiles: [],
    terrain: [],
    explosions: []
  })

  const getTerrainHeight = (x: number, terrain: number[]) => {
    const index = Math.floor(x / 5)
    return terrain[index] || 400
  }

  const initializeGame = useCallback(() => {
    // Generate complex Worms Armageddon-style terrain
    const terrainPoints = []
    for (let x = 0; x < 1000; x += 5) {
      // Create multiple layers of terrain complexity
      const baseHeight = 350 // Base ground level
      const mainHills = Math.sin(x * 0.008) * 80 // Large rolling hills
      const mediumHills = Math.sin(x * 0.02) * 40 // Medium hills
      const smallHills = Math.sin(x * 0.05) * 20 // Small bumps
      const noise = (Math.random() - 0.5) * 10 // Random noise
      
      // Add some dramatic peaks and valleys
      const peaks = Math.sin(x * 0.003) * 120
      const valleys = Math.cos(x * 0.012) * 60
      
      const finalHeight = baseHeight - mainHills - mediumHills - smallHills - peaks + valleys + noise
      terrainPoints.push(Math.max(finalHeight, 200)) // Don't go too high
    }

    const characters: Character[] = [
      // Vegan team
      { id: 'v1', team: 'vegan', x: 150, y: getTerrainHeight(150, terrainPoints) - 20, health: 100, maxHealth: 100, name: 'Kale', vy: 0, isGrounded: true, fallDistance: 0, movementLeft: 60, hasJumped: false },
      { id: 'v2', team: 'vegan', x: 250, y: getTerrainHeight(250, terrainPoints) - 20, health: 100, maxHealth: 100, name: 'Quinoa', vy: 0, isGrounded: true, fallDistance: 0, movementLeft: 60, hasJumped: false },
      { id: 'v3', team: 'vegan', x: 350, y: getTerrainHeight(350, terrainPoints) - 20, health: 100, maxHealth: 100, name: 'Tofu', vy: 0, isGrounded: true, fallDistance: 0, movementLeft: 60, hasJumped: false },
      // Meat Lover team
      { id: 'm1', team: 'meatLover', x: 650, y: getTerrainHeight(650, terrainPoints) - 20, health: 100, maxHealth: 100, name: 'Beef', vy: 0, isGrounded: true, fallDistance: 0, movementLeft: 60, hasJumped: false },
      { id: 'm2', team: 'meatLover', x: 750, y: getTerrainHeight(750, terrainPoints) - 20, health: 100, maxHealth: 100, name: 'Bacon', vy: 0, isGrounded: true, fallDistance: 0, movementLeft: 60, hasJumped: false },
      { id: 'm3', team: 'meatLover', x: 850, y: getTerrainHeight(850, terrainPoints) - 20, health: 100, maxHealth: 100, name: 'Steak', vy: 0, isGrounded: true, fallDistance: 0, movementLeft: 60, hasJumped: false }
    ]

    setGameState(prev => ({
      ...prev,
      characters,
      terrain: terrainPoints,
      wind: Math.random() * 20 - 10, // -10 to 10
      gamePhase: 'movement'
    }))
  }, [])

  const drawTerrain = (ctx: CanvasRenderingContext2D) => {
    const canvas = ctx.canvas
    
    // Draw sky gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height)
    gradient.addColorStop(0, '#87CEEB') // Sky blue
    gradient.addColorStop(0.7, '#98D8E8') // Light blue
    gradient.addColorStop(1, '#B0E0E6') // Powder blue
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    // Draw clouds
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
    for (let i = 0; i < 5; i++) {
      const x = (i * 200) + 50
      const y = 50 + Math.sin(i) * 20
      ctx.beginPath()
      ctx.arc(x, y, 30, 0, Math.PI * 2)
      ctx.arc(x + 25, y, 35, 0, Math.PI * 2)
      ctx.arc(x + 50, y, 30, 0, Math.PI * 2)
      ctx.fill()
    }
    
    // Draw destructible terrain with gradient
    const terrainGradient = ctx.createLinearGradient(0, 200, 0, canvas.height)
    terrainGradient.addColorStop(0, '#8FBC8F') // Dark sea green
    terrainGradient.addColorStop(0.3, '#9ACD32') // Yellow green
    terrainGradient.addColorStop(0.7, '#6B8E23') // Olive drab
    terrainGradient.addColorStop(1, '#556B2F') // Dark olive green
    
    ctx.fillStyle = terrainGradient
    ctx.beginPath()
    ctx.moveTo(0, canvas.height)
    
    // Use terrain height map for destructible terrain
    if (gameState.terrain.length > 0) {
      for (let i = 0; i < gameState.terrain.length; i++) {
        const x = i * 5
        const y = gameState.terrain[i]
        ctx.lineTo(x, y)
      }
    } else {
      // Fallback to simple hills
      for (let x = 0; x <= canvas.width; x += 20) {
        const y = canvas.height - 100 - Math.sin(x * 0.01) * 50
        ctx.lineTo(x, y)
      }
    }
    
    ctx.lineTo(canvas.width, canvas.height)
    ctx.closePath()
    ctx.fill()
    
    // Add terrain texture/details
    ctx.strokeStyle = '#556B2F'
    ctx.lineWidth = 1
    if (gameState.terrain.length > 0) {
      for (let i = 0; i < gameState.terrain.length - 1; i++) {
        const x = i * 5
        const y = gameState.terrain[i]
        
        // Add grass texture
        if (Math.random() > 0.95) {
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x + Math.random() * 3 - 1.5, y - Math.random() * 8)
          ctx.stroke()
        }
      }
    }
  }

  const drawCharacter = (ctx: CanvasRenderingContext2D, char: Character) => {
    if (char.health <= 0) return

    const isCurrentPlayer = gameState.characters[gameState.currentPlayer]?.id === char.id
    const x = char.x
    const y = char.y
    
    if (char.team === 'vegan') {
      // VEGAN CHARACTER - ZOMBIE STYLE
      
      // Zombie body (decaying, greyish-green)
      ctx.fillStyle = '#8B9A8B' // Zombie greyish-green skin
      ctx.fillRect(x - 5, y - 8, 10, 25) // Thin zombie body
      
      // Zombie arms (decaying, bony)
      ctx.fillRect(x - 9, y - 5, 4, 15) // Left arm (slightly thicker than skeleton)
      ctx.fillRect(x + 5, y - 5, 4, 15) // Right arm
      
      // Zombie legs (decaying)
      ctx.fillRect(x - 4, y + 17, 3, 12) // Left leg
      ctx.fillRect(x + 1, y + 17, 3, 12) // Right leg
      
      // Tattered, dirty clothes
      ctx.fillStyle = '#D3D3D3' // Dirty, tattered linen
      ctx.fillRect(x - 12, y - 5, 24, 20) // Torn, baggy shirt
      
      // Add holes and tears in clothes
      ctx.fillStyle = '#8B9A8B' // Show zombie skin through holes
      ctx.beginPath()
      ctx.arc(x - 6, y + 2, 2, 0, Math.PI * 2) // Hole in shirt
      ctx.arc(x + 4, y + 8, 1.5, 0, Math.PI * 2) // Another hole
      ctx.fill()
      
      // Zombie head (decaying, skull-like)
      ctx.fillStyle = '#9CAF9C' // Pale zombie head
      ctx.fillRect(x - 8, y - 25, 16, 18) // Zombie head shape
      
      // Decay spots on face
      ctx.fillStyle = '#556B55' // Dark decay spots
      ctx.beginPath()
      ctx.arc(x - 5, y - 18, 2, 0, Math.PI * 2) // Decay spot on cheek
      ctx.arc(x + 3, y - 12, 1.5, 0, Math.PI * 2) // Decay spot on jaw
      ctx.fill()
      
      // Hollow, sunken zombie eyes (glowing)
      ctx.fillStyle = '#2F2F2F' // Dark, hollow eye sockets
      ctx.fillRect(x - 7, y - 22, 5, 6) // Left eye socket (deep and hollow)
      ctx.fillRect(x + 2, y - 22, 5, 6) // Right eye socket
      
      // Glowing zombie eyes
      ctx.fillStyle = '#32CD32' // Eerie green glow
      ctx.beginPath()
      ctx.arc(x - 4.5, y - 19, 2, 0, Math.PI * 2) // Glowing left eye
      ctx.arc(x + 4.5, y - 19, 2, 0, Math.PI * 2) // Glowing right eye
      ctx.fill()
      
      // Zombie mouth (open, showing teeth)
      ctx.fillStyle = '#1C1C1C' // Dark mouth cavity
      ctx.fillRect(x - 3, y - 15, 6, 4) // Open mouth
      
      // Zombie teeth (yellowed, some missing)
      ctx.fillStyle = '#F5F5DC' // Yellowed teeth
      ctx.fillRect(x - 2, y - 14, 1, 2) // Left tooth
      ctx.fillRect(x, y - 14, 1, 2) // Center tooth
      ctx.fillRect(x + 1, y - 14, 1, 2) // Right tooth (one missing for zombie effect)
      
      // Zombie hair (stringy, falling out)
      ctx.fillStyle = '#696969' // Greyish, dead hair
      ctx.fillRect(x - 6, y - 28, 12, 5) // Patchy, stringy hair
      
      // Bald spots (hair falling out)
      ctx.fillStyle = '#9CAF9C' // Show scalp through hair
      ctx.beginPath()
      ctx.arc(x - 2, y - 26, 2, 0, Math.PI * 2) // Bald spot
      ctx.arc(x + 4, y - 25, 1.5, 0, Math.PI * 2) // Another bald spot
      ctx.fill()
      
      // Dead, wilted flower necklace (zombie style)
      ctx.fillStyle = '#654321' // Dead, brown flowers
      ctx.beginPath()
      ctx.arc(x - 4, y - 2, 1.5, 0, Math.PI * 2) // Dead flower
      ctx.arc(x, y - 1, 1.5, 0, Math.PI * 2) // Dead flower
      ctx.arc(x + 4, y - 2, 1.5, 0, Math.PI * 2) // Dead flower
      ctx.fill()
      
      // Zombie hands (clawed, decaying)
      ctx.fillStyle = '#8B9A8B'
      ctx.beginPath()
      ctx.arc(x - 9, y + 10, 2, 0, Math.PI * 2) // Left hand
      ctx.arc(x + 9, y + 10, 2, 0, Math.PI * 2) // Right hand
      ctx.fill()
      
      // Zombie claws
      ctx.strokeStyle = '#2F2F2F'
      ctx.lineWidth = 1
      ctx.beginPath()
      // Left hand claws
      ctx.moveTo(x - 10, y + 9)
      ctx.lineTo(x - 12, y + 7)
      ctx.moveTo(x - 8, y + 9)
      ctx.lineTo(x - 10, y + 7)
      // Right hand claws
      ctx.moveTo(x + 8, y + 9)
      ctx.lineTo(x + 10, y + 7)
      ctx.moveTo(x + 10, y + 9)
      ctx.lineTo(x + 12, y + 7)
      ctx.stroke()
      
      // Torn, dirty sandals
      ctx.fillStyle = '#654321'
      ctx.fillRect(x - 4, y + 29, 3, 2) // Left sandal (torn)
      ctx.fillRect(x + 1, y + 29, 3, 2) // Right sandal (torn)
      
    } else {
      // MEAT LOVER CHARACTER - Enhanced, clearer design with smooth curves
      
      // Very fat, round body with smooth gradients (bright red/greasy brown)
      const bodyGradient = ctx.createRadialGradient(x, y + 5, 5, x, y + 5, 18)
      bodyGradient.addColorStop(0, '#D2691E') // Lighter center
      bodyGradient.addColorStop(1, '#A0522D') // Darker edges
      ctx.fillStyle = bodyGradient
      ctx.beginPath()
      ctx.arc(x, y + 5, 18, 0, Math.PI * 2) // Round, bloated body
      ctx.fill()
      
      // Fat arms with smooth curves (bloated)
      const armGradient = ctx.createRadialGradient(x - 20, y - 2, 2, x - 20, y - 2, 6)
      armGradient.addColorStop(0, '#D2691E')
      armGradient.addColorStop(1, '#A0522D')
      ctx.fillStyle = armGradient
      ctx.beginPath()
      ctx.arc(x - 20, y - 2, 6, 0, Math.PI * 2) // Left fat arm
      ctx.fill()
      
      ctx.fillStyle = armGradient
      ctx.beginPath()
      ctx.arc(x + 20, y - 2, 6, 0, Math.PI * 2) // Right fat arm
      ctx.fill()
      
      // Fat legs with smooth curves (bloated)
      const legGradient = ctx.createRadialGradient(x - 8, y + 25, 2, x - 8, y + 25, 5)
      legGradient.addColorStop(0, '#D2691E')
      legGradient.addColorStop(1, '#A0522D')
      ctx.fillStyle = legGradient
      ctx.beginPath()
      ctx.arc(x - 8, y + 25, 5, 0, Math.PI * 2) // Left fat leg
      ctx.fill()
      
      ctx.fillStyle = legGradient
      ctx.beginPath()
      ctx.arc(x + 8, y + 25, 5, 0, Math.PI * 2) // Right fat leg
      ctx.fill()
      
      // Tight, dirty butcher apron with better shading
      const apronGradient = ctx.createLinearGradient(x - 12, y - 8, x + 12, y + 12)
      apronGradient.addColorStop(0, '#FFFAF0') // Clean white at top
      apronGradient.addColorStop(1, '#F0E68C') // Dirty yellow at bottom
      ctx.fillStyle = apronGradient
      ctx.fillRect(x - 12, y - 8, 24, 20) // Tight apron
      
      // Apron straps with detail
      ctx.fillStyle = '#8B4513'
      ctx.fillRect(x - 2, y - 15, 4, 8) // Center strap
      ctx.fillRect(x - 15, y - 10, 3, 15) // Left strap
      ctx.fillRect(x + 12, y - 10, 3, 15) // Right strap
      
      // Grease stains on apron with better detail
      ctx.fillStyle = '#8B4513' // Brown grease stains
      ctx.beginPath()
      ctx.arc(x - 6, y - 2, 3, 0, Math.PI * 2)
      ctx.arc(x + 4, y + 3, 2.5, 0, Math.PI * 2)
      ctx.arc(x - 2, y + 8, 2, 0, Math.PI * 2)
      ctx.fill()
      
      // Red meat stains with splatter effect
      ctx.fillStyle = '#8B0000'
      ctx.beginPath()
      ctx.arc(x + 6, y - 4, 2, 0, Math.PI * 2)
      ctx.arc(x - 4, y + 6, 1.5, 0, Math.PI * 2)
      ctx.arc(x + 2, y + 2, 1, 0, Math.PI * 2) // Additional splatter
      ctx.arc(x - 8, y + 4, 0.8, 0, Math.PI * 2) // More splatter
      ctx.fill()
      
      // Round, bloated head with smooth gradient
      const headGradient = ctx.createRadialGradient(x, y - 15, 5, x, y - 15, 14)
      headGradient.addColorStop(0, '#D2691E') // Lighter center
      headGradient.addColorStop(1, '#A0522D') // Darker edges
      ctx.fillStyle = headGradient
      ctx.beginPath()
      ctx.arc(x, y - 15, 14, 0, Math.PI * 2) // Fat, round head
      ctx.fill()
      
      // Butcher cap with detail
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(x, y - 22, 12, Math.PI, 0) // Cap top
      ctx.fill()
      ctx.fillStyle = '#E0E0E0'
      ctx.fillRect(x - 14, y - 22, 28, 4) // Cap brim
      
      // Small, beady eyes with more detail
      ctx.fillStyle = '#FFFFFF' // Eye whites
      ctx.beginPath()
      ctx.arc(x - 5, y - 18, 2.5, 0, Math.PI * 2)
      ctx.arc(x + 5, y - 18, 2.5, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.fillStyle = '#000000' // Pupils
      ctx.beginPath()
      ctx.arc(x - 5, y - 18, 1.5, 0, Math.PI * 2) // Small beady pupils
      ctx.arc(x + 5, y - 18, 1.5, 0, Math.PI * 2)
      ctx.fill()
      
      // Big, greasy smile with teeth detail
      ctx.strokeStyle = '#8B0000'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(x, y - 12, 8, 0, Math.PI) // Big greasy grin
      ctx.stroke()
      
      // Teeth detail
      ctx.fillStyle = '#FFFAF0'
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(x + i * 2, y - 12, 1.5, 3) // Individual teeth
      }
      
      // Thick, unkempt beard with texture
      ctx.fillStyle = '#654321'
      ctx.beginPath()
      ctx.arc(x, y - 5, 12, 0, Math.PI) // Rounded beard shape
      ctx.fill()
      
      // Beard texture lines
      ctx.strokeStyle = '#4A4A4A'
      ctx.lineWidth = 1
      for (let i = -8; i <= 8; i += 2) {
        ctx.beginPath()
        ctx.moveTo(x + i, y - 8)
        ctx.lineTo(x + i + Math.random() * 2 - 1, y + 2)
        ctx.stroke()
      }
      
      // Greasy, unkempt hair with texture
      ctx.fillStyle = '#654321'
      ctx.fillRect(x - 10, y - 25, 20, 8) // Base hair
      
      // Hair texture
      ctx.strokeStyle = '#4A4A4A'
      ctx.lineWidth = 1
      for (let i = -8; i <= 8; i += 3) {
        ctx.beginPath()
        ctx.moveTo(x + i, y - 25)
        ctx.lineTo(x + i + Math.random() * 2 - 1, y - 17)
        ctx.stroke()
      }
      
      // Large, meat-stained cleaver with better detail
      ctx.fillStyle = '#C0C0C0' // Silver cleaver blade
      ctx.fillRect(x + 22, y - 8, 6, 10) // Cleaver blade
      
      // Blade shine effect
      ctx.fillStyle = '#E6E6FA'
      ctx.fillRect(x + 23, y - 7, 1, 8) // Shine line
      
      ctx.fillStyle = '#8B4513' // Brown handle
      ctx.fillRect(x + 24, y + 2, 2, 6) // Handle
      
      // Handle grip lines
      ctx.strokeStyle = '#654321'
      ctx.lineWidth = 1
      for (let i = 0; i < 4; i++) {
        ctx.beginPath()
        ctx.moveTo(x + 24, y + 3 + i)
        ctx.lineTo(x + 26, y + 3 + i)
        ctx.stroke()
      }
      
      // Blood stains with drip effect
      ctx.fillStyle = '#8B0000'
      ctx.beginPath()
      ctx.arc(x + 24, y - 4, 1, 0, Math.PI * 2)
      ctx.arc(x + 26, y - 1, 0.8, 0, Math.PI * 2)
      ctx.fill()
      
      // Blood drips
      ctx.fillRect(x + 24, y - 3, 0.5, 3)
      ctx.fillRect(x + 26, y - 1, 0.3, 2)
      
      // Greasy, oversized burger with better detail
      ctx.fillStyle = '#DEB887' // Burger bun with sesame seeds
      ctx.beginPath()
      ctx.arc(x - 22, y - 5, 3, 0, Math.PI * 2) // Top bun
      ctx.fill()
      
      // Sesame seeds
      ctx.fillStyle = '#F5DEB3'
      ctx.beginPath()
      ctx.arc(x - 23, y - 6, 0.3, 0, Math.PI * 2)
      ctx.arc(x - 21, y - 5.5, 0.3, 0, Math.PI * 2)
      ctx.arc(x - 22.5, y - 4.5, 0.3, 0, Math.PI * 2)
      ctx.fill()
      
      ctx.fillStyle = '#8B4513' // Meat patty with char marks
      ctx.fillRect(x - 24, y - 4, 6, 2) // Patty
      
      // Char marks on patty
      ctx.strokeStyle = '#654321'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(x - 23, y - 3.5)
      ctx.lineTo(x - 19, y - 3.5)
      ctx.moveTo(x - 23, y - 2.5)
      ctx.lineTo(x - 19, y - 2.5)
      ctx.stroke()
      
      ctx.fillStyle = '#228B22' // Lettuce
      ctx.fillRect(x - 23, y - 2, 4, 1) // Lettuce
      
      ctx.fillStyle = '#FFD700' // Cheese
      ctx.fillRect(x - 23.5, y - 1.5, 5, 0.5) // Cheese slice
      
      ctx.fillStyle = '#DEB887'
      ctx.beginPath()
      ctx.arc(x - 22, y - 1, 3, 0, Math.PI * 2) // Bottom bun
      ctx.fill()
      
      // Boots with better detail (dirty)
      ctx.fillStyle = '#654321'
      ctx.fillRect(x - 10, y + 30, 6, 4) // Left boot
      ctx.fillRect(x + 4, y + 30, 6, 4) // Right boot
      
      // Boot laces
      ctx.strokeStyle = '#8B4513'
      ctx.lineWidth = 1
      ctx.beginPath()
      // Left boot laces
      ctx.moveTo(x - 9, y + 31)
      ctx.lineTo(x - 5, y + 31)
      ctx.moveTo(x - 9, y + 32)
      ctx.lineTo(x - 5, y + 32)
      // Right boot laces
      ctx.moveTo(x + 5, y + 31)
      ctx.lineTo(x + 9, y + 31)
      ctx.moveTo(x + 5, y + 32)
      ctx.lineTo(x + 9, y + 32)
      ctx.stroke()
    }

    // Falling indicator (show when character is in the air)
    if (!char.isGrounded && char.health > 0) {
      ctx.strokeStyle = '#EF4444'
      ctx.lineWidth = 3
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.arc(x, y, 30, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      
      // Falling speed indicator
      ctx.fillStyle = '#EF4444'
      ctx.font = 'bold 12px Inter'
      ctx.textAlign = 'center'
      ctx.fillText('FALLING!', x, y - 45)
      
      // Fall distance indicator
      if (char.fallDistance > 20) {
        ctx.fillStyle = '#DC2626'
        ctx.font = '10px Inter'
        ctx.fillText(`${char.fallDistance.toFixed(0)}px`, x, y - 55)
      }
    }

    // Current player indicator (enhanced)
    if (isCurrentPlayer) {
      ctx.strokeStyle = '#FBBF24'
      ctx.lineWidth = 4
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      ctx.arc(x, y, 25, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      
      // Pulsing effect
      const pulseRadius = 30 + Math.sin(Date.now() * 0.01) * 3
      ctx.strokeStyle = '#FBBF24'
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.arc(x, y, pulseRadius, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Enhanced health bar
    const barWidth = 40
    const barHeight = 6
    const healthPercent = char.health / char.maxHealth
    
    // Health bar background
    ctx.fillStyle = '#374151'
    ctx.fillRect(x - barWidth/2 - 1, y - 40 - 1, barWidth + 2, barHeight + 2)
    
    // Health bar background (red)
    ctx.fillStyle = '#EF4444'
    ctx.fillRect(x - barWidth/2, y - 40, barWidth, barHeight)
    
    // Health bar foreground (green)
    ctx.fillStyle = healthPercent > 0.5 ? '#22C55E' : healthPercent > 0.25 ? '#FBBF24' : '#EF4444'
    ctx.fillRect(x - barWidth/2, y - 40, barWidth * healthPercent, barHeight)

    // Name with background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fillRect(x - 25, y - 52, 50, 16)
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 1
    ctx.strokeRect(x - 25, y - 52, 50, 16)
    
    ctx.fillStyle = char.team === 'vegan' ? '#22C55E' : '#DC2626'
    ctx.font = 'bold 12px Inter'
    ctx.textAlign = 'center'
    ctx.fillText(char.name, x, y - 42)
  }

  const drawProjectile = (ctx: CanvasRenderingContext2D, proj: Projectile) => {
    if (!proj.active) return

    const weapon = [...VEGAN_WEAPONS, ...MEAT_WEAPONS].find(w => w.id === proj.type)
    ctx.fillStyle = weapon?.color || '#374151'
    
    // Special drawing for different projectile types
    if (proj.type === 'grenade') {
      // Draw grenade with fuse indicator
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2)
      ctx.fill()
      
      // Fuse indicator (gets redder as it gets closer to exploding)
      const fusePercent = proj.fuseTime / 180
      ctx.fillStyle = fusePercent > 0.5 ? '#228B22' : fusePercent > 0.2 ? '#FFA500' : '#FF0000'
      ctx.beginPath()
      ctx.arc(proj.x, proj.y - 6, 2, 0, Math.PI * 2)
      ctx.fill()
    } else if (proj.type === 'drill') {
      // Draw drill bit
      ctx.fillStyle = '#FFD700'
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2)
      ctx.fill()
      
      // Drill spiral
      ctx.strokeStyle = '#B8860B'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2
        const radius = 2 + (i % 2)
        ctx.lineTo(proj.x + Math.cos(angle) * radius, proj.y + Math.sin(angle) * radius)
      }
      ctx.stroke()
    } else {
      // Standard projectile
      ctx.beginPath()
      ctx.arc(proj.x, proj.y, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  const drawExplosions = (ctx: CanvasRenderingContext2D) => {
    gameState.explosions.forEach(explosion => {
      // Draw explosion flash at center
      if (explosion.particles.length > 0) {
        const flashAlpha = Math.max(...explosion.particles.map(p => p.life / p.maxLife))
        if (flashAlpha > 0.5) {
          ctx.globalAlpha = (flashAlpha - 0.5) * 2 // Bright flash for first half of explosion
          ctx.fillStyle = '#FFFFFF'
          ctx.beginPath()
          ctx.arc(explosion.x, explosion.y, explosion.radius * 0.3, 0, Math.PI * 2)
          ctx.fill()
          
          // Outer explosion ring
          ctx.globalAlpha = (flashAlpha - 0.5) * 1.5
          ctx.fillStyle = '#FF4500'
          ctx.beginPath()
          ctx.arc(explosion.x, explosion.y, explosion.radius * 0.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      
      // Draw individual particles
      explosion.particles.forEach(particle => {
        if (particle.life > 0) {
          const alpha = Math.min(particle.life / particle.maxLife, 0.9)
          ctx.globalAlpha = alpha
          ctx.fillStyle = particle.color
          
          // Make particles bigger and more visible
          const particleSize = particle.color === '#FFFFFF' ? 4 : 3 // White flash particles are bigger
          ctx.beginPath()
          ctx.arc(particle.x, particle.y, particleSize, 0, Math.PI * 2)
          ctx.fill()
          
          // Add glow effect for bright particles
          if (particle.color === '#FFFFFF' || particle.color.includes('FF')) {
            ctx.globalAlpha = alpha * 0.3
            ctx.beginPath()
            ctx.arc(particle.x, particle.y, particleSize * 2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      })
    })
    ctx.globalAlpha = 1
  }

  const moveCharacter = (direction: 'left' | 'right') => {
    const currentChar = gameState.characters[gameState.currentPlayer]
    if (!currentChar || gameState.gamePhase !== 'movement' || currentChar.movementLeft <= 0) return

    const moveDistance = 5
    const newX = direction === 'left' 
      ? Math.max(20, currentChar.x - moveDistance)
      : Math.min(980, currentChar.x + moveDistance)

    // Check if new position is valid (not inside terrain)
    const terrainHeight = getTerrainHeight(newX, gameState.terrain)
    const newY = terrainHeight - 20

    setGameState(prev => ({
      ...prev,
      characters: prev.characters.map(char => 
        char.id === currentChar.id 
          ? { ...char, x: newX, y: newY, movementLeft: char.movementLeft - 1 }
          : char
      )
    }))
  }

  const jumpCharacter = () => {
    const currentChar = gameState.characters[gameState.currentPlayer]
    if (!currentChar || gameState.gamePhase !== 'movement' || currentChar.hasJumped || !currentChar.isGrounded) return

    setGameState(prev => ({
      ...prev,
      characters: prev.characters.map(char => 
        char.id === currentChar.id 
          ? { ...char, vy: -12, isGrounded: false, hasJumped: true, fallDistance: 0 }
          : char
      )
    }))
  }

  const endMovementPhase = () => {
    setGameState(prev => ({
      ...prev,
      gamePhase: 'aiming'
    }))
  }

  const getExplosionColor = (weaponType: string, baseColor: string) => {
    switch (weaponType) {
      case 'grenade':
        return Math.random() > 0.5 ? '#FF4500' : '#FF6B35' // Orange/red explosion
      case 'bazooka':
        return Math.random() > 0.5 ? '#FF0000' : '#FF4500' // Red explosion
      case 'dynamite':
        return Math.random() > 0.5 ? '#FF1493' : '#FF4500' // Pink/red explosion
      case 'drill':
        return Math.random() > 0.5 ? '#FFD700' : '#FFA500' // Gold/orange sparks
      default:
        return baseColor
    }
  }

  const createExplosion = (x: number, y: number, weaponType: string) => {
    const weapon = [...VEGAN_WEAPONS, ...MEAT_WEAPONS].find(w => w.id === weaponType)
    const explosionRadius = weapon ? weapon.explosionRadius || weapon.damage : 30
    
    const particles = []
    const particleCount = weaponType === 'drill' ? 40 : 30 // More particles for better visibility
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount
      const speed = Math.random() * 8 + 3 // Faster particles for more dramatic effect
      const randomAngle = angle + (Math.random() - 0.5) * 0.5 // Add some randomness
      
      particles.push({
        x,
        y,
        vx: Math.cos(randomAngle) * speed,
        vy: Math.sin(randomAngle) * speed,
        life: weaponType === 'drill' ? 90 : 60, // Longer lasting particles
        maxLife: weaponType === 'drill' ? 90 : 60,
        color: getExplosionColor(weaponType, weapon?.color || '#FF6B35')
      })
    }

    // Add additional bright flash particles
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = Math.random() * 12 + 5
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20,
        maxLife: 20,
        color: '#FFFFFF' // Bright white flash
      })
    }

    const explosion: Explosion = {
      x,
      y,
      radius: explosionRadius,
      particles
    }

    console.log(`💥 EXPLOSION CREATED at (${x.toFixed(1)}, ${y.toFixed(1)}) with ${particles.length} particles, radius: ${explosionRadius}`)
    return explosion
  }

  const destroyTerrain = (x: number, y: number, radius: number, weaponType?: string) => {
    const terrainCopy = [...gameState.terrain]
    
    console.log(`🕳️ DESTROYING TERRAIN at (${x.toFixed(1)}, ${y.toFixed(1)}) with radius: ${radius}, weapon: ${weaponType}`)
    
    let pointsDestroyed = 0
    
    for (let i = 0; i < terrainCopy.length; i++) {
      const terrainX = i * 5
      const distance = Math.sqrt((terrainX - x) ** 2 + (terrainCopy[i] - y) ** 2)
      
      if (distance < radius) {
        let destructionAmount = (1 - distance / radius) * radius * 2.5 // Even more destruction multiplier
        
        // Drill creates deeper, narrower tunnels
        if (weaponType === 'drill') {
          destructionAmount *= 4 // Quadruple destruction for drill
          // Create vertical tunnel effect
          if (Math.abs(terrainX - x) < 20) {
            destructionAmount *= 2
          }
        }
        
        // Grenades create bigger holes
        if (weaponType === 'grenade') {
          destructionAmount *= 1.8 // Extra destruction for grenades
        }
        
        // Make sure we create visible holes by adding more destruction
        const oldHeight = terrainCopy[i]
        terrainCopy[i] = Math.min(terrainCopy[i] + destructionAmount, 500) // Don't go below canvas bottom
        
        if (destructionAmount > 5) { // Only log significant destruction
          console.log(`  🔥 Terrain point ${i} (x=${terrainX}): ${oldHeight.toFixed(1)} → ${terrainCopy[i].toFixed(1)} (destroyed ${destructionAmount.toFixed(1)})`)
          pointsDestroyed++
        }
      }
    }
    
    console.log(`✅ TERRAIN DESTRUCTION COMPLETE: ${pointsDestroyed} points destroyed`)
    
    return terrainCopy
  }

  const checkCollision = (proj: Projectile): boolean => {
    // Check bounds first
    if (proj.x < 0 || proj.x > 1000 || proj.y > 500) {
      return true
    }
    
    // Check terrain collision
    if (gameState.terrain.length > 0) {
      const terrainHeight = getTerrainHeight(proj.x, gameState.terrain)
      if (proj.y >= terrainHeight - 5) {
        return true
      }
    } else {
      // Fallback terrain collision
      const fallbackHeight = 400 - Math.sin(proj.x * 0.01) * 50
      if (proj.y >= fallbackHeight - 5) {
        return true
      }
    }
    
    // Check character collision
    for (const char of gameState.characters) {
      if (char.health <= 0) continue
      const distance = Math.sqrt((proj.x - char.x) ** 2 + (proj.y - char.y) ** 2)
      if (distance < 20) { // Character radius + projectile radius
        return true
      }
    }
    
    return false
  }

  const applyDamage = (explosionX: number, explosionY: number, damage: number, radius: number) => {
    const updatedCharacters = gameState.characters.map(char => {
      if (char.health <= 0) return char
      
      const distance = Math.sqrt((char.x - explosionX) ** 2 + (char.y - explosionY) ** 2)
      if (distance < radius) {
        const damageMultiplier = 1 - (distance / radius)
        const actualDamage = Math.floor(damage * damageMultiplier)
        return {
          ...char,
          health: Math.max(0, char.health - actualDamage)
        }
      }
      return char
    })
    
    return updatedCharacters
  }

  const updateCharacterGravity = (characters: Character[], terrain: number[]) => {
    return characters.map(char => {
      if (char.health <= 0) return char // Dead characters don't fall
      
      const terrainHeight = getTerrainHeight(char.x, terrain)
      const groundLevel = terrainHeight - 20 // Character stands 20 pixels above terrain
      
      // Check if character is above ground level
      if (char.y < groundLevel) {
        // Character is in the air - apply gravity
        const newVy = char.vy + 0.8 // Gravity acceleration
        const newY = char.y + newVy
        const newFallDistance = char.fallDistance + Math.abs(newVy)
        
        // Check if character hits ground
        if (newY >= groundLevel) {
          // Character hits ground
          const finalY = groundLevel
          const finalVy = 0
          const finalIsGrounded = true
          
          // Calculate fall damage (damage starts after falling 50 pixels)
          let fallDamage = 0
          if (newFallDistance > 50) {
            fallDamage = Math.floor((newFallDistance - 50) / 10) // 1 damage per 10 pixels fallen after 50
            fallDamage = Math.min(fallDamage, 80) // Max 80 fall damage
          }
          
          console.log(`${char.name} landed! Fall distance: ${newFallDistance.toFixed(1)}, Fall damage: ${fallDamage}`)
          
          return {
            ...char,
            y: finalY,
            vy: finalVy,
            isGrounded: finalIsGrounded,
            fallDistance: 0, // Reset fall distance
            health: Math.max(0, char.health - fallDamage)
          }
        } else {
          // Character is still falling
          return {
            ...char,
            y: newY,
            vy: newVy,
            isGrounded: false,
            fallDistance: newFallDistance
          }
        }
      } else {
        // Character is on or below ground level - snap to ground
        return {
          ...char,
          y: groundLevel,
          vy: 0,
          isGrounded: true,
          fallDistance: 0
        }
      }
    })
  }

  const drawTrajectoryPreview = (ctx: CanvasRenderingContext2D) => {
    const currentChar = gameState.characters[gameState.currentPlayer]
    if (!currentChar) return

    const power = (gameState.power / 100) * 25 // Increased power scaling to match fireWeapon
    const angle = (gameState.angle * Math.PI) / 180
    const wind = gameState.wind * 0.02

    ctx.strokeStyle = '#FBBF24'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    ctx.beginPath()

    let x = currentChar.x
    let y = currentChar.y
    let vx = Math.cos(angle) * power
    let vy = -Math.sin(angle) * power // Negative for upward trajectory

    ctx.moveTo(x, y)

    for (let i = 0; i < 100; i++) {
      vx += wind
      vy += 0.5 // Enhanced gravity to match projectile physics
      x += vx
      y += vy

      // Check if trajectory hits terrain
      const terrainHeight = getTerrainHeight(x, gameState.terrain)
      if (y >= terrainHeight - 5 || x < 0 || x > 1000) break
      
      ctx.lineTo(x, y)
    }

    ctx.stroke()
    ctx.setLineDash([])
  }

  const updateProjectiles = () => {
    setGameState(prev => {
      let newExplosions = [...prev.explosions]
      let newTerrain = [...prev.terrain]
      let newCharacters = [...prev.characters]
      
      const updatedProjectiles = prev.projectiles.map(proj => {
        if (!proj.active) return proj

        const weapon = [...VEGAN_WEAPONS, ...MEAT_WEAPONS].find(w => w.id === proj.type)
        
        // Handle grenade special physics
        if (proj.type === 'grenade') {
          // Check if grenade should explode FIRST (before any physics)
          if (proj.fuseTime <= 0) {
            console.log('💥 GRENADE EXPLODING!')
            
            // Create explosion immediately
            const explosion = createExplosion(proj.x, proj.y, proj.type)
            newExplosions.push(explosion)
            playExplosionSound(proj.type)
            
            // Destroy terrain immediately
            const explosionRadius = weapon ? weapon.explosionRadius || weapon.damage : 35
            newTerrain = destroyTerrain(proj.x, proj.y, explosionRadius, proj.type)
            
            // Apply damage to characters immediately
            newCharacters = applyDamage(proj.x, proj.y, weapon?.damage || 50, explosionRadius)
            
            // Mark projectile as inactive
            return { ...proj, active: false }
          }
          
          // Decrement fuse timer AFTER explosion check
          const newFuseTime = proj.fuseTime - 1
          
          // Debug logging for grenade fuse
          if (newFuseTime % 30 === 0) { // Log every half second
            console.log(`🎯 Grenade fuse: ${newFuseTime} frames remaining (${(newFuseTime/60).toFixed(1)}s)`)
          }
          
          // Apply physics AFTER fuse check
          const newVx = proj.vx + prev.wind * 0.02
          const newVy = proj.vy + 0.5 // Gravity
          let newX = proj.x + newVx
          let newY = proj.y + newVy
          
          // Check for bouncing on all surfaces
          let bounced = false
          let finalVx = newVx
          let finalVy = newVy
          
          // Bounce off left/right screen boundaries
          if (newX <= 0 || newX >= 1000) {
            finalVx = -finalVx * 0.4 // Smaller bounce coefficient
            newX = newX <= 0 ? 0 : 1000 // Keep in bounds
            bounced = true
          }
          
          // Bounce off top boundary
          if (newY <= 0) {
            finalVy = -finalVy * 0.4 // Smaller bounce coefficient
            newY = 0 // Keep in bounds
            bounced = true
          }
          
          // Bounce off terrain
          const terrainHeight = getTerrainHeight(newX, prev.terrain)
          if (newY >= terrainHeight - 5) {
            finalVy = -Math.abs(finalVy) * 0.4 // Smaller bounce coefficient
            finalVx *= 0.6 // Increased friction
            newY = terrainHeight - 5 // Keep above terrain
            bounced = true
          }
          
          // Play bounce sound if bounced
          if (bounced) {
            playBounceSound()
          }
          
          return {
            ...proj,
            x: newX,
            y: newY,
            vx: finalVx,
            vy: finalVy,
            fuseTime: newFuseTime
          }
        }
        
        // Apply physics with enhanced gravity - create new object to avoid mutation
        const updatedProj = {
          ...proj,
          vx: proj.vx + prev.wind * 0.02, // Enhanced wind effect
          vy: proj.vy + 0.5, // Enhanced gravity for more realistic physics
          x: proj.x + proj.vx,
          y: proj.y + proj.vy
        }

        // Check collisions for non-grenade projectiles
        if (checkCollision(updatedProj)) {
          console.log(`💥 ${updatedProj.type.toUpperCase()} HIT at (${updatedProj.x.toFixed(1)}, ${updatedProj.y.toFixed(1)})!`)
          updatedProj.active = false
          
          // Create explosion
          const explosion = createExplosion(updatedProj.x, updatedProj.y, updatedProj.type)
          newExplosions.push(explosion)
          playExplosionSound(updatedProj.type)
          
          // Destroy terrain
          const explosionRadius = weapon ? weapon.explosionRadius || weapon.damage : 30
          newTerrain = destroyTerrain(updatedProj.x, updatedProj.y, explosionRadius, updatedProj.type)
          
          // Apply damage to characters
          newCharacters = applyDamage(updatedProj.x, updatedProj.y, weapon?.damage || 30, explosionRadius)
        }

        // Remove projectiles that go off screen (except grenades which bounce)
        if (updatedProj.type !== 'grenade' && (updatedProj.x < -50 || updatedProj.x > 1050 || updatedProj.y > 550)) {
          updatedProj.active = false
        }

        return updatedProj
      }).filter(proj => proj.active)

      // Update explosion particles
      newExplosions = newExplosions.map(explosion => ({
        ...explosion,
        particles: explosion.particles.map(particle => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vy: particle.vy + 0.2, // Enhanced gravity on particles to match projectiles
          life: particle.life - 1
        })).filter(particle => particle.life > 0)
      })).filter(explosion => explosion.particles.length > 0)

      // Apply gravity to characters (IMPORTANT: This makes characters fall when terrain is destroyed!)
      newCharacters = updateCharacterGravity(newCharacters, newTerrain)

      return {
        ...prev,
        projectiles: updatedProjectiles,
        explosions: newExplosions,
        terrain: newTerrain,
        characters: newCharacters
      }
    })
  }

  const fireWeapon = () => {
    const currentChar = gameState.characters[gameState.currentPlayer]
    if (!currentChar || gameState.gamePhase !== 'aiming') return

    const power = (gameState.power / 100) * 25 // Increased power scaling for more noticeable difference
    const angle = (gameState.angle * Math.PI) / 180

    const baseVx = Math.cos(angle) * power
    const baseVy = -Math.sin(angle) * power // Negative for upward trajectory

    const weapon = [...VEGAN_WEAPONS, ...MEAT_WEAPONS].find(w => w.id === gameState.selectedWeapon)
    
    console.log('Firing weapon:', { 
      weapon: gameState.selectedWeapon,
      weaponFuseTime: weapon?.fuseTime,
      power: gameState.power, 
      angle: gameState.angle, 
      baseVx, 
      baseVy,
      startPos: { x: currentChar.x, y: currentChar.y }
    })

    // UZI fires multiple projectiles in a burst
    if (gameState.selectedWeapon === 'uzi') {
      const projectiles: Projectile[] = []
      const burstCount = 5 // Fire 5 bullets in rapid succession
      
      for (let i = 0; i < burstCount; i++) {
        // Add spread to each bullet (realistic machine gun spread)
        const spreadAngle = (Math.random() - 0.5) * 0.3 // ±0.15 radians spread
        const spreadPower = 0.9 + Math.random() * 0.2 // 90-110% power variation
        
        const vx = Math.cos(angle + spreadAngle) * power * spreadPower
        const vy = -Math.sin(angle + spreadAngle) * power * spreadPower
        
        const projectile: Projectile = {
          x: currentChar.x + (Math.random() - 0.5) * 4, // Slight position spread
          y: currentChar.y - 10 + (Math.random() - 0.5) * 2, // Slight vertical spread
          vx,
          vy,
          type: gameState.selectedWeapon,
          team: currentChar.team,
          active: true,
          bounces: 0,
          fuseTime: weapon?.fuseTime || 0
        }
        
        projectiles.push(projectile)
      }
      
      // Fire bullets with slight delays for realistic burst effect
      projectiles.forEach((projectile, index) => {
        setTimeout(() => {
          // Play realistic rapid fire sound for each bullet
          playWeaponSound('uzi')
          
          setGameState(prev => ({
            ...prev,
            projectiles: [...prev.projectiles, projectile]
          }))
        }, index * 80) // 80ms delay between each bullet
      })
      
      console.log(`🔫 UZI BURST: Firing ${burstCount} bullets with spread and timing delays`)
      
    } else {
      // Single projectile for other weapons
      const projectile: Projectile = {
        x: currentChar.x,
        y: currentChar.y - 10, // Start slightly above character
        vx: baseVx,
        vy: baseVy,
        type: gameState.selectedWeapon,
        team: currentChar.team,
        active: true,
        bounces: 0,
        fuseTime: weapon?.fuseTime || 0 // This should be 180 for grenades
      }

      setGameState(prev => ({
        ...prev,
        projectiles: [...prev.projectiles, projectile]
      }))
    }

    // Play weapon sound (for non-Uzi weapons, Uzi plays individual bullet sounds)
    if (gameState.selectedWeapon !== 'uzi') {
      playWeaponSound(gameState.selectedWeapon)
    }

    setGameState(prev => ({
      ...prev,
      gamePhase: 'firing'
    }))

    // Switch turns after 4 seconds (longer for Uzi burst to complete)
    const turnDelay = gameState.selectedWeapon === 'uzi' ? 4000 : 3000
    setTimeout(() => {
      setGameState(prev => {
        const aliveCharacters = prev.characters.filter(c => c.health > 0)
        const aliveVegans = aliveCharacters.filter(c => c.team === 'vegan')
        const aliveMeatLovers = aliveCharacters.filter(c => c.team === 'meatLover')
        
        // Check for victory conditions
        if (aliveVegans.length === 0) {
          return { ...prev, gamePhase: 'gameOver', currentTeam: 'meatLover' }
        }
        if (aliveMeatLovers.length === 0) {
          return { ...prev, gamePhase: 'gameOver', currentTeam: 'vegan' }
        }
        
        // Find next alive player
        let nextPlayerIndex = (prev.currentPlayer + 1) % prev.characters.length
        while (prev.characters[nextPlayerIndex].health <= 0) {
          nextPlayerIndex = (nextPlayerIndex + 1) % prev.characters.length
        }
        
        const nextChar = prev.characters[nextPlayerIndex]
        
        return {
          ...prev,
          currentPlayer: nextPlayerIndex,
          currentTeam: nextChar.team,
          gamePhase: 'movement',
          turnTimeLeft: 30,
          wind: Math.random() * 20 - 10, // New wind each turn
          characters: prev.characters.map(char => ({
            ...char,
            movementLeft: 60, // Reset movement for new turn
            hasJumped: false // Reset jump for new turn
          }))
        }
      })
    }, turnDelay)
  }

  // Initialize game
  useEffect(() => {
    initializeGame()
  }, [initializeGame])

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameState.gamePhase !== 'movement') return
      
      switch (e.key.toLowerCase()) {
        case 'a':
        case 'arrowleft':
          e.preventDefault()
          moveCharacter('left')
          break
        case 'd':
        case 'arrowright':
          e.preventDefault()
          moveCharacter('right')
          break
        case 'w':
        case 'arrowup':
        case ' ':
          e.preventDefault()
          jumpCharacter()
          break
        case 'enter':
          e.preventDefault()
          endMovementPhase()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  })

  // Game loop - combined physics and rendering
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const gameLoop = () => {
      // Clear canvas
      ctx.fillStyle = '#FEF3C7'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw terrain
      drawTerrain(ctx)
      
      // Draw characters
      gameState.characters.forEach(char => drawCharacter(ctx, char))
      
      // Draw projectiles
      gameState.projectiles.forEach(proj => drawProjectile(ctx, proj))
      
      // Draw explosions
      drawExplosions(ctx)
      
      // Draw trajectory preview if aiming
      if (gameState.gamePhase === 'aiming') {
        drawTrajectoryPreview(ctx)
      }

      // Update projectiles physics whenever there are active projectiles
      if (gameState.projectiles.some(p => p.active)) {
        updateProjectiles()
      }

      // Always update character gravity (characters can fall anytime terrain changes)
      if (gameState.characters.some(char => !char.isGrounded && char.health > 0)) {
        setGameState(prev => ({
          ...prev,
          characters: updateCharacterGravity(prev.characters, prev.terrain)
        }))
      }
    }

    const interval = setInterval(gameLoop, 1000 / 60) // 60 FPS
    return () => clearInterval(interval)
  })

  const currentChar = gameState.characters[gameState.currentPlayer]
  const availableWeapons = currentChar?.team === 'vegan' ? VEGAN_WEAPONS : MEAT_WEAPONS

  return (
    <div className="min-h-screen bg-amber-50 p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-4">
        <h1 className="text-4xl font-bold text-center text-gray-800 mb-2">
          🧟‍♂️ Zombie Vegans vs Fat Meat Lovers 🥩
        </h1>
        <p className="text-center text-gray-600">Epic Artillery Battle with Realistic Physics!</p>
      </div>

      {/* Victory Screen */}
      {gameState.gamePhase === 'gameOver' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-8 text-center max-w-md">
            <h2 className="text-3xl font-bold mb-4">
              {gameState.currentTeam === 'vegan' ? '🧟‍♂️ Zombie Vegans Win!' : '🥩 Fat Meat Lovers Win!'}
            </h2>
            <p className="text-lg mb-6">
              {gameState.currentTeam === 'vegan' 
                ? 'The undead plant-eaters have conquered! Brains... and vegetables!' 
                : 'The carnivorous gluttons rule supreme! Meat is victory!'}
            </p>
            <Button 
              onClick={initializeGame}
              className="w-full"
              size="lg"
            >
              🔄 Play Again
            </Button>
          </Card>
        </div>
      )}

      {/* Game Canvas */}
      <div className="max-w-6xl mx-auto mb-4">
        <canvas
          ref={canvasRef}
          width={1000}
          height={500}
          className="border-2 border-gray-300 rounded-lg bg-amber-50 w-full max-w-full"
          style={{ aspectRatio: '2/1' }}
        />
      </div>

      {/* Game Controls */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Current Player Info */}
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Current Player</h3>
          {currentChar && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full ${currentChar.team === 'vegan' ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="font-medium">{currentChar.name}</span>
              </div>
              <div className="text-sm text-gray-600">
                Team: {currentChar.team === 'vegan' ? '🧟‍♂️ Zombie Vegans' : '🥩 Fat Meat Lovers'}
              </div>
              <Progress value={(currentChar.health / currentChar.maxHealth) * 100} className="h-2" />
              <div className="text-xs text-gray-500">{currentChar.health}/100 HP</div>
              
              {/* Movement Info */}
              {gameState.gamePhase === 'movement' && (
                <div className="mt-3 p-2 bg-blue-50 rounded border">
                  <div className="text-xs font-medium text-blue-800 mb-1">Movement Phase</div>
                  <div className="text-xs text-blue-600">
                    Movement: {currentChar.movementLeft}/60
                  </div>
                  <div className="text-xs text-blue-600">
                    Jump: {currentChar.hasJumped ? 'Used' : 'Available'}
                  </div>
                  <div className="text-xs text-blue-500 mt-1">
                    A/D: Move • W/Space: Jump • Enter: End Turn
                  </div>
                </div>
              )}
              
              {gameState.gamePhase === 'aiming' && (
                <div className="mt-3 p-2 bg-orange-50 rounded border">
                  <div className="text-xs font-medium text-orange-800">Aiming Phase</div>
                  <div className="text-xs text-orange-600">Set power and angle, then fire!</div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Weapon Selection */}
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Weapons Arsenal</h3>
          <div className="grid grid-cols-2 gap-2">
            {availableWeapons?.map(weapon => (
              <Button
                key={weapon.id}
                variant={gameState.selectedWeapon === weapon.id ? "default" : "outline"}
                size="sm"
                onClick={() => setGameState(prev => ({ ...prev, selectedWeapon: weapon.id }))}
                className="text-xs p-2 h-auto"
                title={weapon.id === 'drill' ? 'Tunnel Digger - Creates deep holes!' : weapon.id === 'uzi' ? 'Machine Gun - Fires 5 bullets in rapid succession!' : `Damage: ${weapon.damage}, Radius: ${weapon.explosionRadius}`}
              >
                {weapon.name}
                {weapon.id === 'grenade' && ' 💣'}
                {weapon.id === 'drill' && ' ⛏️'}
                {weapon.id === 'uzi' && ' 🔫'}
              </Button>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2">
            💣 Grenades bounce and have a 3-second fuse!<br/>
            ⛏️ Drill creates deep tunnels through terrain!<br/>
            🔫 Uzi fires 5 bullets in rapid succession with spread!
          </div>
        </Card>

        {/* Controls */}
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Controls</h3>
          <div className="space-y-3">
            
            {/* Movement Controls */}
            {gameState.gamePhase === 'movement' && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Movement</div>
                <div className="flex gap-2">
                  <Button 
                    onClick={() => moveCharacter('left')}
                    disabled={!currentChar || currentChar.movementLeft <= 0}
                    size="sm"
                    variant="outline"
                  >
                    ← Left
                  </Button>
                  <Button 
                    onClick={() => moveCharacter('right')}
                    disabled={!currentChar || currentChar.movementLeft <= 0}
                    size="sm"
                    variant="outline"
                  >
                    Right →
                  </Button>
                  <Button 
                    onClick={jumpCharacter}
                    disabled={!currentChar || currentChar.hasJumped || !currentChar.isGrounded}
                    size="sm"
                    variant="outline"
                  >
                    ↑ Jump
                  </Button>
                </div>
                <Button 
                  onClick={endMovementPhase}
                  className="w-full"
                  size="sm"
                >
                  End Movement
                </Button>
              </div>
            )}

            {/* Aiming Controls */}
            {gameState.gamePhase === 'aiming' && (
              <>
                <div>
                  <label className="text-sm font-medium">Power: {gameState.power}% (Enhanced scaling)</label>
                  <Slider
                    value={[gameState.power]}
                    onValueChange={([value]) => setGameState(prev => ({ ...prev, power: value }))}
                    max={100}
                    step={1}
                    className="mt-1"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Gentle</span>
                    <span>Medium</span>
                    <span>Maximum</span>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium">Angle: {gameState.angle}° (360° range)</label>
                  <Slider
                    value={[gameState.angle]}
                    onValueChange={([value]) => setGameState(prev => ({ ...prev, angle: value }))}
                    max={360}
                    step={1}
                    className="mt-1"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0° →</span>
                    <span>90° ↑</span>
                    <span>180° ←</span>
                    <span>270° ↓</span>
                    <span>360° →</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Wind: {gameState.wind.toFixed(1)}</span>
                  <span className="text-gray-500">
                    {gameState.wind > 0 ? '→' : gameState.wind < 0 ? '←' : '•'}
                  </span>
                </div>
                <Button 
                  onClick={fireWeapon}
                  disabled={gameState.gamePhase !== 'aiming'}
                  className="w-full"
                >
                  🎯 Fire!
                </Button>
              </>
            )}

            {/* Firing Phase */}
            {gameState.gamePhase === 'firing' && (
              <div className="text-center text-sm text-gray-600">
                Projectile in flight...
                {gameState.projectiles.some(p => p.type === 'grenade') && (
                  <div className="text-xs text-orange-600 mt-1">
                    💣 Grenade bouncing and counting down!
                  </div>
                )}
                {gameState.projectiles.some(p => p.type === 'uzi') && (
                  <div className="text-xs text-blue-600 mt-1">
                    🔫 Uzi burst fire in progress!
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

export default GameArena