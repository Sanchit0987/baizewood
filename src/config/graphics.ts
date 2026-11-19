export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  label: string;
  maxPixelRatio: number;
  /** Lamp lights that cast shadows (the lamp has three; the middle one first). */
  shadowLights: number;
  shadowMapSize: number;
  /** Contact-hardening (PCSS) shadows instead of blurred PCF. */
  contactHardening: boolean;
  ssao: boolean;
  ssaoSamples: number;
  ssaoRatio: number;
  bloom: boolean;
  depthOfField: boolean;
  msaaSamples: number;
  fxaa: boolean;
  anisotropy: number;
  environmentSize: number;
  ballSegments: number;
  /** Load the glTF furniture. */
  props: boolean;
}

export const QUALITY: Record<Quality, QualityPreset> = {
  low: { label: 'Low', maxPixelRatio: 1, shadowLights: 1, shadowMapSize: 1024, contactHardening: false, ssao: false, ssaoSamples: 0, ssaoRatio: 0.5, bloom: false, depthOfField: false, msaaSamples: 1, fxaa: true, anisotropy: 2, environmentSize: 128, ballSegments: 20, props: false },
  medium: { label: 'Medium', maxPixelRatio: 1.5, shadowLights: 1, shadowMapSize: 2048, contactHardening: false, ssao: true, ssaoSamples: 8, ssaoRatio: 0.5, bloom: true, depthOfField: true, msaaSamples: 1, fxaa: true, anisotropy: 4, environmentSize: 256, ballSegments: 32, props: true },
  high: { label: 'High', maxPixelRatio: 2, shadowLights: 3, shadowMapSize: 1024, contactHardening: true, ssao: true, ssaoSamples: 12, ssaoRatio: 0.5, bloom: true, depthOfField: true, msaaSamples: 4, fxaa: false, anisotropy: 8, environmentSize: 256, ballSegments: 48, props: true },
};
export const DEFAULT_QUALITY: Quality = 'medium';

/** Longest frame time passed to the game; longer frames (tab switches) are clamped. */
export const MAX_FRAME_SECONDS = 0.1;

export const CAMERA = {
  fov: 0.72,
  maxFov: 1.2,
  /** Aspect ratio below which the field of view widens (portrait screens). */
  wideAspect: 1.5,
  near: 0.05,
  far: 40,
  /** Cue view: behind the cue ball, looking along the shot. */
  cue: { distance: 1.55, minDistance: 0.6, maxDistance: 3.2, pitch: 0.36, minPitch: 0.1, maxPitch: 1.35, lead: 0.42, lookHeight: 0.03 },
  /** Free view: orbiting the middle of the table. */
  free: { distance: 3.1, minDistance: 1.2, maxDistance: 4.4, pitch: 0.55, minPitch: 0.08, maxPitch: 1.45, yaw: -2.2 },
  /** Top view: margin around the rails, metres. */
  topMargin: 0.16,
  /** Extra margin at the bottom of the screen for the controls, as a fraction of the view height. */
  topPadding: 1.22,
  /** On portrait screens the table sits this far (metres) above the middle, clear of the controls. */
  topPortraitShift: 0.12,
  followRate: 6,
  /** Radians of aim or orbit per pixel dragged. */
  aimSensitivity: 0.0032,
  orbitSensitivity: 0.0055,
  /** Zoom factor per wheel pixel. */
  wheelZoom: 0.0012,
  menuOrbitSpeed: 0.07,
  menuDistance: 3.3,
  menuPitch: 0.42,
  /** The camera stays this far inside the walls and above the floor. */
  wallClearance: 0.35,
  floorClearance: 0.25,
  /** While balls roll the cue view pulls back, rises and drifts toward the middle of the table. */
  watch: { distance: 1.35, pitch: 0.16, centre: 0.45 },
  /** Aiming follows the pointer this many times faster than other camera moves. */
  aimRateBoost: 3,
  /** Break cut: a low camera beside the rack looking back up the table. */
  breakCut: { position: [1.75, 0.34, 0.92] as const, target: [0.45, 0, 0] as const, seconds: 2.6 },
  /** Winning-pot cut: behind and above the pocket the 8-ball is heading for. */
  potCut: { back: 0.5, height: 0.42, hold: 1.6 },
} as const;

export const LIGHTS = {
  /** Height of the lamp bulbs above the cloth and their spacing along the table. */
  lampHeight: 0.92,
  lampSpacing: 0.62,
  /** The middle lamp carries most of the light (and the shadows on lower presets); the outer two fill in. */
  lampIntensity: 7.4,
  sideLampIntensity: 4.1,
  lampColour: '#ffe3b8',
  /** Full cone angle of each lamp light, radians. */
  lampAngle: 2.5,
  lampExponent: 1.4,
  lampRange: 9,
  /** The lamp is hidden once the camera rises above this height, so it never blocks a steep view. */
  lampHideHeight: 1.9,
  fillIntensity: 0.42,
  fillColour: '#ffd9b0',
  fillGround: '#1a2420',
  environmentIntensity: 0.5,
  shadowBias: 0.0006,
  shadowNormalBias: 0.004,
  shadowDarkness: 0.28,
  shadowBlur: 20,
  /** PCSS light size as a fraction of the shadow frustum. */
  shadowSoftness: 0.05,
  shadowNear: 0.3,
  shadowFar: 3,
} as const;

export const POST = {
  exposure: 1.15,
  contrast: 1.14,
  bloomThreshold: 0.78,
  bloomWeight: 0.35,
  bloomKernel: 56,
  bloomScale: 0.5,
  vignetteWeight: 1.6,
  vignetteStretch: 0.3,
  ssaoRadius: 0.16,
  ssaoStrength: 1.1,
  ssaoBase: 0.1,
  ssaoMaxZ: 12,
  /** Depth of field: a long lens stopped down, so only the far wall and near rail soften. */
  dofFocalLength: 55,
  dofFStop: 3.2,
  dofLensSize: 36,
} as const;

export const LOOK = {
  felt: '#1f7a63',
  feltRoughness: 0.96,
  feltSheen: 0.5,
  feltTextureSize: 512,
  /** Fibre noise cells across the texture, along and across the nap. */
  feltCells: [128, 40] as const,
  feltBump: 0.5,
  feltNoise: 0.16,
  /** Texture repeats per metre. */
  feltTiling: 7,
  woodTiling: 1.6,
  floorTiling: 0.55,
  wallTiling: 0.4,
  railTint: '#b0705a',
  bodyTint: '#7d5244',
  wainscotTint: '#8a6a55',
  wallTint: '#3e6a5c',
  ceiling: '#1c1a17',
  liner: '#0c0b0a',
  brass: '#c9a253',
  pearl: '#efe8d6',
  shade: '#17463b',
  bulb: '#fff1d6',
  bulbGlow: 2.6,
  sconceGlow: 9,
  ballRoughness: 0.06,
  ballTextureSize: 512,
  cueWhite: '#f4efe2',
  /** Ball colours by number 1-7 (stripes 9-15 repeat them) and the 8. */
  ballColours: ['#f2b705', '#1d4fb8', '#c8201d', '#5b2a86', '#e8691a', '#0f7a45', '#7a1f2b'] as const,
  eight: '#111111',
  spotDot: '#c8201d',
  rug: ['#3a1f1c', '#6e2f27', '#c9a253', '#1d3b34'] as const,
  rugTextureSize: 512,
  chalk: '#2f6fd6',
  /** Lacquer and finish values: [clear-coat intensity, clear-coat roughness]. */
  railCoat: [0.9, 0.08] as const,
  bodyCoat: [0.5, 0.25] as const,
  floorCoat: [0.35, 0.3] as const,
  ballCoatRoughness: 0.02,
  feltSpecular: 0.3,
  rugSheen: 0.3,
  linerRoughness: 0.85,
  brassRoughness: 0.28,
  pearlRoughness: 0.2,
  shadeRoughness: 0.35,
} as const;

/** Shapes of the visible table around the playing geometry. Metres. */
export const TABLE_LOOK = {
  railWidth: 0.108,
  railTop: 0.04,
  railSkirt: 0.05,
  railCorner: 0.09,
  /** Height of the cushion nose and how far its foot and top lean back from it. */
  noseHeight: 0.031,
  noseUndercut: 0.013,
  noseTopInset: 0.007,
  /** Extra radius of the cut in the rail around each pocket. */
  pocketRim: 0.004,
  pocketDepth: 0.13,
  pocketSegments: 40,
  /** Samples around the table used to trace the rail outline. */
  outlineSamples: 2880,
  /** Brass pocket plates: half width in radians of arc seen from the table centre, and thickness. */
  cornerPlate: 0.085,
  sidePlate: 0.075,
  plateThickness: 0.0018,
  diamondRadius: 0.0065,
  diamondOffset: 0.058,
  bodyInset: 0.03,
  bodyHeight: 0.2,
  legInset: 0.2,
  legRadius: 0.075,
  spotRadius: 0.009,
  spotColour: '#d9d2bd',
  /** Height of the cloth above the floor. */
  height: 0.8,
} as const;

export const ROOM = {
  halfLength: 4.3,
  halfWidth: 3.5,
  height: 3.05,
  wainscot: 1.0,
  rug: [4.3, 2.9] as const,
  shadeRadius: 0.2,
  shadeHeight: 0.17,
  shadeTop: 0.05,
  barRadius: 0.012,
  sconceHeight: 1.05,
  sconceRadius: 0.075,
} as const;

export const CUE_LOOK = {
  length: 1.46,
  tipRadius: 0.0062,
  buttRadius: 0.0145,
  tipLength: 0.008,
  ferruleLength: 0.022,
  /** Fraction of the length that is the dark butt with its wrap. */
  butt: 0.42,
  shaft: '#e3c58f',
  buttColour: '#3a1d14',
  wrap: '#151515',
  ferrule: '#f3efe6',
  /** Gap between tip and ball at address, and extra travel at full pull-back. */
  address: 0.018,
  pull: 0.34,
  /** Resting elevation of the butt, radians, and the most it rises to clear a rail or ball. */
  elevation: 0.075,
  maxElevation: 0.6,
  clearance: 0.012,
  /** Seconds for the forward stroke, and how long the cue lingers afterwards. */
  strokeSeconds: 0.11,
  followThrough: 0.05,
  fadeSeconds: 0.5,
  segments: 20,
} as const;

export type GuideLevel = 'full' | 'short' | 'off';

export const GUIDE = {
  width: 0.006,
  lift: 0.0015,
  colour: '#ffffff',
  objectColour: '#ffd66b',
  illegalColour: '#ff5a4a',
  opacity: 0.85,
  ghostThickness: 0.004,
  /** Lengths of the object-ball and cue-ball deflection lines for each level, metres. */
  full: { object: 0.95, cue: 0.5 },
  short: { object: 0.16, cue: 0 },
  /** With the guide off only a short pointer in front of the cue ball remains. */
  offStub: 0.22,
  ringSegments: 40,
} as const;

export const BALL_FX = {
  /** Seconds a pocketed ball takes to roll in and drop out of sight. */
  sinkSeconds: 0.32,
  sinkDepth: 0.11,
  /** Height of the lifted cue ball while it is being placed. */
  handLift: 0.012,
  handColour: '#7df5c0',
  handBadColour: '#ff5a4a',
} as const;

/** How the balls are painted. Angles in radians on the sphere. */
export const BALL_ART = {
  /** Angular radius of the white number disc. */
  disc: 0.36,
  /** Half-width of the stripe band (a real stripe is half the ball's diameter wide). */
  stripe: 0.52,
  /** Width of the anti-aliased edge. */
  edge: 0.012,
  /** Number height as a fraction of the texture height. */
  numeral: 0.15,
  numeralColour: '#141414',
  /** Red training dots on the cue ball so its spin can be read: angular radius. */
  dot: 0.075,
  dotColour: '#c8201d',
  /** Largest random tilt of a racked ball away from number-up. */
  tilt: 0.7,
  seed: 2718,
} as const;
