<script setup lang="ts">
/**
 * SceneRenderer.vue — GK-04 拆分产出
 *
 * 职责：纯渲染（按 sceneGraph.nodes 遍历构图），无 emit / 无 pointer 事件。
 *   - 视觉/交互零回归：原 ThreeViewer.vue 渲染代码原封不动平移，仅 buildMarkers / buildPoints / buildAreaMarkers 数据源从
 *     sceneStore.visibleBuildings / sceneStore.devicePoints / sceneStore.markers 改为从 props.sceneSchema.sceneGraph.nodes 遍历。
 *   - 非空间数据（选中态、hover、buildingDisplay、markerSwitch、live metrics、activeSubsystem、model URL 等）
 *     仍由 useSceneStore 提供，保留与重构前的完全一致行为。
 *   - GK-01 物化器未上线前，sceneSchema 由 sceneStore.loadSchema() 本地拼装（mock），节点 ID/position/semantic.meta
 *     完整保留 → 不引入任何视觉跳变。
 *   - 不发任何 emit；点击/hover 由 InteractionController.vue 监听 canvas pointer 事件独立处理。
 */
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
import { KP_ACCENT, KP_ACCENT_LABEL, KP_SCENE_BG, KP_AREA_SELECTED, KP_AREA_HOVER, KP_BUILDING_HOVER, KP_BUILDING_FILL, KP_ALERT, KP_FALLBACK_CYAN, KP_SUBSYS_HEX, KP_SCENE_PALETTE, KP_LIGHT_SECONDARY, KP_HEMI_SKY, KP_HEMI_GROUND, KP_GROUND, KP_SELECT_RING } from '@/lib/kp-accent'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useSceneStore } from '@/stores/scene'
import { useI18nStore } from '@/stores/i18n'
import { BUILDING_META, getBuildingMeta } from '@/types/scene'
import type { SceneMarker, FloorLabel, BuildingDisplay, FloorModelAsset } from '@/types/api'
// GK-30：楼层真实模型 additive 配置（schema 可配映射的本地权威源）
import { findFloorModel, floorModelFromSchemaAssets, findBuildingModel, type BuildingModelAsset } from '@/lib/floorModels'
// GK-08：schema cameraPresets → 相机 flyTo。解析/查找为纯函数，补间在 lib/presetFlight，
// SceneRenderer 仅负责把 camera/controls 交给补间并在 store 选楼/楼层变化时触发。
import {
  cameraPresetCatalog,
  findBuildingPreset,
  findFloorPreset,
  findPresetById,
  presetIdForBuilding,
  presetIdForFloor,
  DEFAULT_CAMERA_POSE,
} from '@/lib/cameraPreset'
import type { CameraPose, CameraPreset } from '@/lib/cameraPreset'
import { tweenCameraTo } from '@/lib/presetFlight'
import type { CameraTweenHandle } from '@/lib/presetFlight'

// sceneSchema prop 由 ThreeViewer facade 传入；本期为本地 mock 文档，待 GK-01 接后端后切到 /scene/schema
const props = defineProps<{ sceneSchema: any | null }>()

const sceneStore = useSceneStore()
const { t } = useI18nStore()
const container = ref<HTMLDivElement | null>(null)

const MODEL_URL = '/models/hospital.glb'
const FIT = 230
const TARGET: [number, number, number] = [30, 0, 0]
const DEFAULT_BG = new THREE.Color(KP_SCENE_BG)

const isMediaScene = computed(() => {
  const type = sceneStore.sceneConfig?.model_type
  return type === 'video' || type === 'image' || type === 'panorama'
})

// GK-08：可用相机预设目录（schema.cameraPresets 优先 → sceneConfig.camera_presets 兜底）
const cameraPresetList = computed<CameraPreset[]>(() =>
  cameraPresetCatalog(props.sceneSchema, sceneStore.sceneConfig),
)

let mediaTexture: THREE.Texture | null = null
let mediaVideo: HTMLVideoElement | null = null
const texLoader = new THREE.TextureLoader()
texLoader.crossOrigin = 'anonymous'

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let raf = 0
let ready = false
let disposed = false

const modelGroup = new THREE.Group()
const markersGroup = new THREE.Group()
const pointsGroup = new THREE.Group()
const areaGroup = new THREE.Group()
const highlightGroup = new THREE.Group()
// GK-30：楼层真实模型组（妇产儿科楼 1 层 GLB）。与 modelGroup（院区主模型）解耦，独立加载/卸载。
const floorModelGroup = new THREE.Group()
const floorModelReady = ref(false)
// 6 号楼整栋世界包围盒（点击整栋模型按世界 Y 跳楼层映射用）；仅整栋态有效
let bld6WholeWorldBox: THREE.Box3 | null = null
let ground: THREE.Mesh | null = null
const selectedAreaId = ref<string | null>(null)
const hoveredAreaId = ref<string | null>(null)
const hoveredBuildingId = ref<string | null>(null)
let pointerDownFlag = false

// GK-08：当前激活 preset（数据留档 / 排查）；camTween 用于打断上一次飞行补间
const activePresetId = ref<string | null>(null)
let camTween: CameraTweenHandle | null = null

const AREA_SELECTED_COLOR = KP_AREA_SELECTED
const AREA_HOVER_COLOR = KP_AREA_HOVER
const AREA_SELECTED_OPACITY = 0.5
const AREA_HOVER_OPACITY = 0.42
const AREA_BASE_OPACITY = 0.3

const BUILDING_HOVER_COLOR = KP_BUILDING_HOVER

// selectables 暴露给父组件供 InteractionController 取用（raycast 范围）
const selectables: THREE.Object3D[] = []
function getSelectables(): THREE.Object3D[] {
  return selectables
}

/** GK-13：按 userData.type 精准移除 selectables 条目（各数据层重建时只清自己的，互不踩踏） */
function removeSelectablesByTypes(types: string[]) {
  for (let i = selectables.length - 1; i >= 0; i--) {
    if (types.includes(selectables[i].userData?.type)) selectables.splice(i, 1)
  }
}

let fillColor = new THREE.Color(KP_BUILDING_FILL)
let borderColor = new THREE.Color(KP_ACCENT)
let selColor = new THREE.Color(KP_ACCENT)
const buildingMeshes = new Map<string, { box: THREE.Mesh; line?: THREE.LineSegments }>()
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
let downX = 0
let downY = 0

const SUBSYS_HEX: Record<string, string> = KP_SUBSYS_HEX
// 设备类别(marker_type) → 子系统 code，用于 3D 设备点按子系统着色（E1：呼应 #49 电梯/供配电点位增强，
// 使 3D 点具备子系统色彩语义，而非旧实现按楼栋索引 PALETTE 的彩虹色）。非映射类别回退到楼栋调色板。
const CATEGORY_SUBSYS: Record<string, string> = {
  screw_chiller: 'hvac',
  water_pump: 'hvac',
  cooling_tower: 'hvac',
  vrf_outdoor: 'hvac',
  air_cooled_module: 'hvac',
  heat_pump_water: 'hotwater',
  elevator: 'elevator',
  power: 'power',
  lighting_loop: 'lighting',
}
const highlightColor = computed(() => {
  const code = sceneStore.activeSubsystem
  if (code && code !== 'overview') return SUBSYS_HEX[code as string] || KP_ACCENT
  return KP_ACCENT
})

// ========================== sceneGraph 派生 ==========================
// 节点类型与 scene-schema.v1.schema.json 一致：root/building/floor/room/device/group/decor
// 本期（GK-04 mock）将 sceneStore 现有 buildings / devicePoints / markers 投影为下方三个 computed；接 GK-01 后端后即免。
interface BuildingNode {
  id: string
  name: string
  position: [number, number, number]
  floors: number
  gross_area: number
  buildingId: string
  buildingCode: string
  visible: boolean
}
interface DeviceNode {
  id: string
  deviceId: string
  buildingId: string
  // GK-19：设备所属楼层（由 parent=floor_<bid>_<f> 解析，供楼层钻取过滤）；解析失败为 null
  floor: number | null
  position: [number, number, number]
  marker_type: string
  label: string
  level_of_detail: 'building' | 'subsystem' | 'equipment'
  visible: boolean
}
interface AreaNode {
  id: string
  markerId: string
  building_id: string
  floor: number
  label: string
  position: [number, number, number]
  color: string
  area_points: { x: number; y: number; z: number }[]
  link?: SceneMarker['link'] | null
  params?: Record<string, string>
}

const buildingNodes = computed<BuildingNode[]>(() => {
  const nodes = props.sceneSchema?.sceneGraph ?? []
  return nodes
    .filter((n: any) => n?.type === 'building' && n?.visible !== false)
    .map((n: any) => ({
      id: n.id,
      name: n.name || '',
      position: (n.transform?.position || [0, 0, 0]) as [number, number, number],
      floors: n.semantic?.meta?.floors ?? n.semantic?.meta?.floors_above ?? 0,
      gross_area: n.semantic?.meta?.gross_area ?? n.semantic?.meta?.area_m2 ?? 0,
      buildingId: n.semantic?.deviceId || n.id,
      buildingCode: n.semantic?.meta?.code || n.semantic?.deviceId || n.id,
      visible: n.visible !== false,
    }))
})
// GK-19：floor 节点 id → { buildingId, floor }。
// schema 中设备 parent 指向 floor_<bid>_<f>（bid 可能含下划线），靠截取末段不可靠；
// 改为先从 floor 节点的 parent（bldg_<bid>）反解 buildingId，再用前缀长度精确取楼层号。
const floorMetaById = computed<Map<string, { buildingId: string; floor: number }>>(() => {
  const m = new Map<string, { buildingId: string; floor: number }>()
  const nodes = (props.sceneSchema?.sceneGraph ?? []) as any[]
  nodes.forEach((n) => {
    if (n?.type !== 'floor' || typeof n?.id !== 'string') return
    const parent = typeof n.parent === 'string' ? n.parent : ''
    const buildingId = parent.startsWith('bldg_') ? parent.slice(5) : ''
    if (!buildingId) return
    const prefix = `floor_${buildingId}_`
    if (!n.id.startsWith(prefix)) return
    const floor = Number(n.id.slice(prefix.length))
    if (!Number.isFinite(floor)) return
    m.set(n.id, { buildingId, floor })
  })
  return m
})

const deviceNodes = computed<DeviceNode[]>(() => {
  const nodes = props.sceneSchema?.sceneGraph ?? []
  return nodes
    .filter((n: any) => n?.type === 'device' && n?.visible !== false)
    .map((n: any) => {
      const parentFloor = typeof n.parent === 'string' ? floorMetaById.value.get(n.parent) : undefined
      return {
      id: n.id,
      deviceId: n.semantic?.deviceId || n.id,
      buildingId:
        n.semantic?.meta?.building_id ||
        parentFloor?.buildingId ||
        (typeof n.parent === 'string' && n.parent.startsWith('bldg_') ? n.parent.slice(5) : ''),
      floor: typeof parentFloor?.floor === 'number' ? parentFloor.floor : null,
      position: (n.transform?.position || [0, 0, 0]) as [number, number, number],
      marker_type: n.semantic?.meta?.marker_type || 'equipment',
      label: n.semantic?.meta?.label || n.name || n.id,
      level_of_detail: (n.semantic?.meta?.level_of_detail || 'equipment') as
        | 'building'
        | 'subsystem'
        | 'equipment',
      visible: n.visible !== false,
      }
    })
})
const areaNodes = computed<AreaNode[]>(() => {
  const nodes = props.sceneSchema?.sceneGraph ?? []
  return nodes
    .filter((n: any) => n?.semantic?.shape === 'area' && n?.visible !== false)
    .map((n: any) => {
      const meta = n.semantic?.meta || {}
      return {
        id: n.id,
        markerId: n.semantic?.deviceId || n.id,
        building_id: meta.building_id || '',
        floor: typeof meta.floor === 'number' ? meta.floor : Number(meta.floor) || 0,
        label: n.name || meta.label || n.id,
        position: (n.transform?.position || [0, 0, 0]) as [number, number, number],
        color: n.semantic?.color || meta.color || KP_FALLBACK_CYAN,
        area_points: n.semantic?.areaPoints || meta.area_points || [],
        link: n.semantic?.link ?? null,
        params: n.semantic?.params,
      }
    })
  })

// GK-30：楼层真实模型解析。优先 schema.assets（前瞻兼容），回退本地 additive 配置。
function resolveFloorModel(buildingId: string, floor: number): FloorModelAsset | null {
  const fromSchema = floorModelFromSchemaAssets(props.sceneSchema?.assets, buildingId, floor)
  if (fromSchema) return fromSchema
  return findFloorModel(buildingId, floor)
}

// 当前钻取态命中的楼层真实模型（floorDrill 驱动）。
const activeFloorModel = computed<FloorModelAsset | null>(() => {
  const bid = sceneStore.floorDrill.buildingId
  const f = sceneStore.floorDrill.floor
  if (!bid || typeof f !== 'number') return null
  return resolveFloorModel(bid, f)
})

// GK-30b：整栋建筑真实模型（选中楼栋且未钻取时显示，替换程序盒体；与楼层钻取模型共用 floorModelGroup）。
// 钻取态（activeFloorModel 命中）优先于整栋模型 —— 点楼层进入时切到该层分割模型。
const activeBuildingModel = computed<BuildingModelAsset | null>(() => {
  const sel = sceneStore.selectedBuilding
  const fd = sceneStore.floorDrill
  if (sel !== '6') return null
  // 已在 6 号楼钻取楼层 → 交由 activeFloorModel 处理，避免整栋/单层冲突
  if (fd.buildingId === '6' && typeof fd.floor === 'number') return null
  return findBuildingModel('6')
})

// 当前实际挂载在 floorModelGroup 的模型所属楼栋（盒体隐藏判定用）。
const activeModelBuildingId = ref<string | null>(null)

function initThree() {
  const el = container.value
  if (!el) return
  const w = el.clientWidth || 960
  const h = el.clientHeight || 540

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(w, h)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  el.appendChild(renderer.domElement)
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'

  scene = new THREE.Scene()
  scene.background = new THREE.Color(KP_SCENE_BG)

  camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 3000)
  camera.position.set(74, 56, 102)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.08
  controls.target.set(30, 20, 0)
  controls.maxPolarAngle = Math.PI / 2.1
  controls.minDistance = 18
  controls.maxDistance = 600

  const ambient = new THREE.AmbientLight(0xffffff, 0.85)
  scene.add(ambient)
  const dir1 = new THREE.DirectionalLight(0xffffff, 1.1)
  dir1.position.set(120, 150, 90)
  scene.add(dir1)
  const dir2 = new THREE.DirectionalLight(KP_LIGHT_SECONDARY, 0.45)
  dir2.position.set(-90, 70, -70)
  scene.add(dir2)
  const hemi = new THREE.HemisphereLight(KP_HEMI_SKY, KP_HEMI_GROUND, 0.4)
  scene.add(hemi)

  scene.add(modelGroup)
  scene.add(markersGroup)
  scene.add(pointsGroup)
  scene.add(areaGroup)
  scene.add(highlightGroup)
  scene.add(floorModelGroup)

  if (!isMediaScene.value) {
    const groundGeo = new THREE.PlaneGeometry(320, 220)
    const groundMat = new THREE.MeshStandardMaterial({ color: KP_GROUND, metalness: 0.1, roughness: 0.9 })
    ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(30, -0.2, 0)
    scene.add(ground)
  }

  ready = true
  animate()
}

function animate() {
  if (disposed || !renderer || !scene || !camera) return
  raf = requestAnimationFrame(animate)
  controls?.update()
  if (mediaTexture && mediaVideo && mediaVideo.readyState >= 2) mediaTexture.needsUpdate = true
  renderer.render(scene, camera)
}

// ---------- 模型加载（含 DRACO / Meshopt 解码，进度驱动遮罩） ----------
async function tryLoad(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
  loader.setDRACOLoader(draco)
  try {
    loader.setMeshoptDecoder(MeshoptDecoder)
  } catch {
    /* meshopt 可选 */
  }
  return (await loader.loadAsync(url, (e) => {
    if (e.lengthComputable && e.total) {
      const pct = Math.round((e.loaded / e.total) * 100)
      const base = sceneStore.modelLoadingHint || '模型加载中…'
      sceneStore.setLoading(true, pct, `${base} ${pct}%`)
    }
  })).scene
}

function placeModel(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = false
      mesh.receiveShadow = false
    }
  })
  const box = new THREE.Box3().setFromObject(obj)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = FIT / maxDim

  const group = new THREE.Group()
  group.add(obj)
  group.scale.setScalar(scale)
  group.position.set(
    TARGET[0] - center.x * scale,
    -box.min.y * scale,
    TARGET[2] - center.z * scale,
  )
  while (modelGroup.children.length) {
    const child = modelGroup.children[0]
    child.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m: any) => m.dispose?.())
      }
    })
    modelGroup.remove(child)
  }
  modelGroup.add(group)
}

async function loadModel() {
  sceneStore.modelLoading = true
  sceneStore.modelError = false
  const url = sceneStore.sceneConfig?.model_url || MODEL_URL
  const type = (sceneStore.sceneConfig?.model_type || '3d') as string
  try {
    while (modelGroup.children.length) {
      const child = modelGroup.children[0]
      ;(child as THREE.Object3D).traverse((o: any) => {
        if (o.geometry) o.geometry.dispose?.()
        if (o.material) {
          const mats = Array.isArray(o.material) ? o.material : [o.material]
          mats.forEach((m: any) => m.dispose?.())
        }
      })
      modelGroup.remove(child)
    }
    disposeMedia()

    if (type === 'video') {
      await loadVideoBackground(url)
    } else if (type === 'image') {
      await loadImageBackground(url)
    } else if (type === 'panorama') {
      await loadPanoramaBackground(url)
    } else {
      let obj: THREE.Object3D
      try {
        obj = await tryLoad(url)
      } catch {
        obj = await tryLoad(MODEL_URL)
      }
      placeModel(obj)
      // 模型重载后回到默认视角（先打断可能在途的 preset 补间，避免旧 tween 覆盖默认落点）
      cancelCameraTween()
      activePresetId.value = null
      if (camera && controls) {
        camera.position.set(74, 56, 102)
        controls.target.set(30, 20, 0)
        controls.minDistance = 18
        controls.maxDistance = 600
        controls.maxPolarAngle = Math.PI / 2.1
        controls.update()
      }
    }
    if (disposed) return
    sceneStore.modelLoading = false
    sceneStore.modelError = false
  } catch (e) {
    if (disposed) return
    sceneStore.modelLoading = false
    sceneStore.modelError = true
    console.warn('[SceneRenderer] 场景模型加载失败', e)
  }
}

function disposeMedia() {
  if (mediaVideo) {
    try {
      mediaVideo.pause()
    } catch {
      /* 忽略 */
    }
    mediaVideo.removeAttribute('src')
    try {
      mediaVideo.load()
    } catch {
      /* 忽略 */
    }
    mediaVideo = null
  }
  if (mediaTexture) {
    mediaTexture.dispose()
    mediaTexture = null
  }
  if (scene) scene.background = DEFAULT_BG
}

function loadVideoBackground(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const vid = document.createElement('video')
    vid.src = url
    vid.loop = true
    vid.muted = true
    vid.playsInline = true
    vid.crossOrigin = 'anonymous'
    vid.addEventListener('loadeddata', () => {
      vid.play().catch(() => {
        /* 部分浏览器需用户交互后才可播放，静默忽略 */
      })
      const tex = new THREE.VideoTexture(vid)
      tex.colorSpace = THREE.SRGBColorSpace
      mediaVideo = vid
      mediaTexture = tex
      if (scene) scene.background = tex
      resolve()
    })
    vid.addEventListener('error', () => reject(new Error('video load error')))
  })
}

function loadImageBackground(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        mediaTexture = tex
        if (scene) scene.background = tex
        resolve()
      },
      undefined,
      (e) => reject(e),
    )
  })
}

function loadPanoramaBackground(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.mapping = THREE.EquirectangularReflectionMapping
        mediaTexture = tex
        if (scene) scene.background = tex
        console.log('[SceneRenderer] panorama equirect-bg v5 loaded:', url)

        if (camera && controls) {
          camera.position.set(0, 0, 0)
          controls.target.set(0, 0, -1)
          controls.minDistance = 0
          controls.maxDistance = 1
          controls.maxPolarAngle = Math.PI
          controls.update()
        }
        resolve()
      },
      undefined,
      (e) => reject(e),
    )
  })
}

// ---------- GK-30：楼层真实模型（additive，独立组，不触碰院区主模型与盒体拾取） ----------
// 仅在 floorDrill 命中配置中的 {buildingId, floor} 时加载；退出钻取时卸载并恢复程序盒体。
// 加载失败：保持现有盒体渲染，仅 console.warn，不抛错、不污染主模型加载状态。

// 轻量 GLTF 加载器（不复用 tryLoad：避免劫持主模型 loading 遮罩状态）。
async function loadObject(url: string): Promise<THREE.Object3D> {
  const loader = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
  loader.setDRACOLoader(draco)
  try {
    loader.setMeshoptDecoder(MeshoptDecoder)
  } catch {
    /* meshopt 可选 */
  }
  return (await loader.loadAsync(url)).scene
}

function disposeGroup(g: THREE.Group) {
  while (g.children.length) {
    const c = g.children[0]
    c.traverse((o: any) => {
      if (o.geometry) o.geometry.dispose?.()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m: any) => m.dispose?.())
      }
    })
    g.remove(c)
  }
}

async function loadFloorModel(
  asset: {
    url: string
    buildingId: string
    floor?: number
    mapping: { position: [number, number, number]; rotationY: number; scale: number }
  },
): Promise<void> {
  const obj = await loadObject(asset.url)
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.isMesh) {
      mesh.castShadow = false
      mesh.receiveShadow = false
    }
  })
  // 按包围盒中心归零，使模型以自身几何中心为原点，便于按 mapping 摆放
  const box = new THREE.Box3().setFromObject(obj)
  const center = box.getCenter(new THREE.Vector3())
  obj.position.sub(center)

  const g = new THREE.Group()
  g.add(obj)
  const m = asset.mapping
  g.rotation.y = m.rotationY || 0
  g.scale.setScalar(m.scale)
  g.position.set(m.position[0], m.position[1], m.position[2])

  disposeGroup(floorModelGroup)
  floorModelGroup.add(g)
  // 记录 6 号楼整栋世界包围盒（供点击跳楼层按世界 Y 映射楼层；含模型真实 transform）
  if (String(asset.buildingId) === '6' && !('floor' in (asset as Record<string, unknown>))) {
    bld6WholeWorldBox = new THREE.Box3().setFromObject(floorModelGroup)
  } else if (String(asset.buildingId) === '6') {
    bld6WholeWorldBox = null
  }
}

/**
 * 6 号楼整栋命中代理：不可见盒体覆盖整栋模型世界包围盒，供射线拾取命中后按命中 Y 映射楼层。
 * 仅在整栋态（activeBuildingModel 非空）由 buildMarkers 调用；进入楼层钻取或切换楼栋时随 buildMarkers 清理。
 */
function addBld6WholeHitProxy(box: THREE.Box3): void {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z)
  const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.copy(center)
  mesh.userData = { type: 'bldg6whole', id: '6', yMin: box.min.y, yMax: box.max.y }
  markersGroup.add(mesh)
  selectables.push(mesh)
}

/** 6 号楼整栋世界 Y → 楼层（1/2/3）映射（与 InteractionController 同一公式） */
function bld6FloorFromWorldY(y: number, yMin: number, yMax: number): number {
  const span = Math.max(0.001, yMax - yMin)
  const f = Math.ceil(((y - yMin) / span) * 3)
  return Math.min(3, Math.max(1, f))
}

function unloadFloorModel(): void {
  disposeGroup(floorModelGroup)
}

// ---------- 楼栋标记（可点击框框区域 + 选中光环） ----------
function anchorOf(buildingId: string): [number, number, number] {
  const a = sceneStore.anchorByBuilding[buildingId]
  if (a) return a
  const meta = getBuildingMeta(buildingId)
  return (meta?.anchor as [number, number, number]) || [0, 0, 0]
}

const FLOOR_HEIGHT = 4.2
const FOOTPRINT_SCALE = 0.6
const HEIGHT_SCALE = 0.3
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

function buildingBoxSize(b: { floors: number; gross_area: number }, sizeScale: number) {
  const floors = clamp(b.floors || 1, 1, 40)
  const footprintSideM = clamp(Math.sqrt(Math.max(b.gross_area, 1) / floors), 8, 40)
  const side = footprintSideM * FOOTPRINT_SCALE * sizeScale
  const height = floors * FLOOR_HEIGHT * HEIGHT_SCALE * sizeScale
  return { side, height, floors }
}

function buildingOpacity(
  buildingId: string,
  disp: { mode: 'box' | 'plane'; background_opacity?: number; box_opacity?: number; plane_opacity?: number; per_building?: Record<string, { background_opacity?: number }> },
) {
  const per = disp.per_building?.[buildingId]
  if (typeof per?.background_opacity === 'number') return clamp(per.background_opacity, 0, 1)
  const def = disp.mode === 'plane'
    ? (disp.plane_opacity ?? disp.background_opacity ?? 0.35)
    : (disp.box_opacity ?? disp.background_opacity ?? 0.35)
  return clamp(def, 0, 1)
}

function makeLabelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const fontSize = 48
  ctx.font = `bold ${fontSize}px sans-serif`
  const w = Math.ceil(ctx.measureText(text).width) + 28
  const h = fontSize + 22
  canvas.width = w
  canvas.height = h
  ctx.font = `bold ${fontSize}px sans-serif`
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 14, h / 2)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
  const sprite = new THREE.Sprite(mat)
  const s = 0.045
  sprite.scale.set(w * s, h * s, 1)
  return sprite
}

const floorLabels: { sprite: THREE.Sprite; bid: string; fidx: number; def: FloorLabel }[] = []

function formatNum(v: number): string {
  if (!isFinite(v)) return '-'
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)
}

function aggregateFloorMetric(bid: string, metricKey: string): number | undefined {
  let sum = 0
  let count = 0
  for (const key in sceneStore.liveMetrics) {
    const idx = key.lastIndexOf(':')
    if (idx < 0) continue
    const devId = key.slice(0, idx)
    const mk = key.slice(idx + 1)
    if (mk !== metricKey) continue
    const dp = sceneStore.devicePoints.find((d) => d.device_id === devId)
    if (dp && dp.building_id === bid) {
      const val = sceneStore.liveMetrics[key]
      if (typeof val === 'number') {
        sum += val
        count++
      }
    }
  }
  return count ? sum / count : undefined
}

function makeFloorLabelDefText(def: FloorLabel, val: number | undefined): string {
  const num = typeof val === 'number' ? ` ${formatNum(val)}` : ''
  return `${def.index}F ${def.label}${num}`
}

function floorLabelColor(def: FloorLabel, val: number | undefined): string {
  const alert = typeof def.threshold === 'number' && typeof val === 'number' && val > def.threshold
  return alert ? KP_ALERT : def.color || KP_ACCENT_LABEL
}

function refreshFloorLabelValues() {
  floorLabels.forEach((fl) => {
    const val = fl.def.bound_fields?.length ? aggregateFloorMetric(fl.bid, fl.def.bound_fields[0]) : undefined
    const color = floorLabelColor(fl.def, val)
    const text = makeFloorLabelDefText(fl.def, val)
    const next = makeLabelSprite(text, color)
    next.position.copy(fl.sprite.position)
    next.userData = fl.sprite.userData
    markersGroup.add(next)
    markersGroup.remove(fl.sprite)
    const si = selectables.indexOf(fl.sprite)
    if (si >= 0) selectables[si] = next
    const mat = fl.sprite.material as THREE.SpriteMaterial
    mat.map?.dispose()
    mat.dispose()
    fl.sprite = next
  })
}

function buildFloorLabelsForBuilding(
  b: { id: string; floors: number },
  a: [number, number, number],
  side: number,
  isBox: boolean,
  disp: BuildingDisplay,
) {
  const floors = disp.floors_by_building?.[b.id]
  if (!floors || !isBox) return
  const floorUnitY = FLOOR_HEIGHT * HEIGHT_SCALE * (disp.size_scale ?? 1)
  floors.forEach((fl: FloorLabel) => {
    if (fl.visible === false) return
    const fy = (fl.index - 0.5) * floorUnitY
    const val = fl.bound_fields?.length ? aggregateFloorMetric(b.id, fl.bound_fields[0]) : undefined
    const color = floorLabelColor(fl, val)
    const text = makeFloorLabelDefText(fl, val)
    const sprite = makeLabelSprite(text, color)
    sprite.position.set(a[0] + side / 2 + 3, fy, a[2])
    sprite.userData = { type: 'floorLabel', bid: b.id, fidx: fl.index }
    markersGroup.add(sprite)
    selectables.push(sprite)
    floorLabels.push({ sprite, bid: b.id, fidx: fl.index, def: fl })
  })
}

// 数据源切换：从 sceneStore.visibleBuildings 改为 props.sceneSchema.sceneGraph.nodes.filter(type='building')
function buildMarkers() {
  floorLabels.length = 0
  if (!ready) return
  if (isMediaScene.value) {
    while (markersGroup.children.length) markersGroup.remove(markersGroup.children[0])
    removeSelectablesByTypes(['building', 'floorLabel', 'bldg6whole'])
    buildingMeshes.clear()
    return
  }
  if (!sceneStore.markerSwitch?.show_building_markers) {
    while (markersGroup.children.length) markersGroup.remove(markersGroup.children[0])
    removeSelectablesByTypes(['building', 'floorLabel', 'bldg6whole'])
    buildingMeshes.clear()
    return
  }
  while (markersGroup.children.length) markersGroup.remove(markersGroup.children[0])
  // GK-13 修复：只移除本层（楼栋/楼层标签）的条目，不能全量清空 ——
  // 否则 markerSwitch→buildPoints 先入队的设备标记会在 buildingDisplay→本函数
  // 重建时被整段抹掉（watch 顺序敏感），设备从此不可 raycast。
  removeSelectablesByTypes(['building', 'floorLabel', 'bldg6whole'])
  buildingMeshes.clear()

  const disp = sceneStore.buildingDisplay
  fillColor = new THREE.Color(disp.fill_color || KP_BUILDING_FILL)
  borderColor = new THREE.Color(disp.border_color || KP_ACCENT)
  selColor = new THREE.Color(KP_ACCENT)
  const isBox = disp.mode !== 'plane'

  buildingNodes.value.forEach((b) => {
    // GK-30 / GK-30b：钻取进入该楼真实楼层模型 / 选中该楼显示整栋真实模型时，隐藏程序生成盒体，
    // 改由 floorModelGroup 渲染真实模型（activeModelBuildingId 统一记录当前挂载模型所属楼栋）。
    if (floorModelReady.value && activeModelBuildingId.value === b.buildingId) {
      return
    }
    // 楼栋位置优先采用 DIY 锚点（building_anchors，后台「楼栋锚点」可拖动），
    // 与高亮光束 / 相机共用同一坐标源，避免「锚点改了盒体不动、光束却跳位」的三者错位；
    // 锚点未加载（初始 [0,0,0]）时回退 sceneGraph 节点 transform.position。
    let a = anchorOf(b.buildingId) || anchorOf(b.buildingCode)
    if (!a || (a[0] === 0 && a[1] === 0 && a[2] === 0)) {
      a = b.position || [0, 0, 0]
    }
    const selected = sceneStore.selectedBuilding === b.buildingId || sceneStore.selectedBuilding === b.buildingCode
    const { side, height } = buildingBoxSize({ floors: b.floors, gross_area: b.gross_area }, disp.size_scale ?? 1)
    const opacity = buildingOpacity(b.buildingId, disp)

    const boxH = isBox ? height : 0.5
    const geo = new THREE.BoxGeometry(side, boxH, side)
    const baseColor = selected ? selColor : fillColor
    const mat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: selected ? selColor : new THREE.Color(0x000000),
      emissiveIntensity: selected ? 0.25 : 0,
      transparent: true,
      opacity: isBox ? opacity : Math.max(opacity, 0.18),
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(a[0], boxH / 2, a[2])
    mesh.userData = { type: 'building', id: b.buildingId, bid: b.buildingCode, code: b.buildingCode }
    markersGroup.add(mesh)
    selectables.push(mesh)

    const hitR = Math.min(Math.max(side, boxH) * 0.8 + 8, 60)
    const hitGeo = new THREE.SphereGeometry(hitR, 12, 12)
    const hitMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    const hitMesh = new THREE.Mesh(hitGeo, hitMat)
    hitMesh.position.set(a[0], boxH / 2, a[2])
    hitMesh.userData = { type: 'building', id: b.buildingId, bid: b.buildingCode, code: b.buildingCode }
    markersGroup.add(hitMesh)
    selectables.push(hitMesh)

    let borderLine: THREE.LineSegments | undefined
    if (disp.show_border) {
      const edges = new THREE.EdgesGeometry(geo)
      borderLine = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({
          color: selected ? selColor : borderColor,
          transparent: true,
          opacity: selected ? 0.95 : 0.6,
        }),
      )
      mesh.add(borderLine)
    }

    if (disp.show_labels) {
      const label = makeLabelSprite(b.name, selected ? KP_ACCENT : KP_ACCENT_LABEL)
      label.position.set(a[0], boxH + 1.6, a[2])
      markersGroup.add(label)
    }

    if (selected) {
      const ringGeo = new THREE.RingGeometry(side * 0.7, side * 0.7 + 1.4, 48)
      const ringMat = new THREE.MeshBasicMaterial({ color: KP_SELECT_RING, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = Math.PI / 2
      ring.position.set(a[0], 0.5, a[2])
      markersGroup.add(ring)
    }
    buildingMeshes.set(b.buildingId, { box: mesh, line: borderLine })
    buildFloorLabelsForBuilding({ id: b.buildingId, floors: b.floors }, a, side, isBox, disp)
  })
  // 6 号楼整栋态：命中代理（点击整栋模型按世界 Y 跳楼层，仿参考页 click→jump floor）
  if (
    floorModelReady.value &&
    activeModelBuildingId.value === '6' &&
    activeBuildingModel.value &&
    bld6WholeWorldBox
  ) {
    addBld6WholeHitProxy(bld6WholeWorldBox)
  }
  buildAreaMarkers()
  applyBuildingHoverColors()
}

function applyBuildingHoverColors() {
  buildingMeshes.forEach((entry, id) => {
    const isSel = sceneStore.selectedBuilding === id
    const isHover = hoveredBuildingId.value === id
    const mat = entry.box.material as THREE.MeshStandardMaterial
    if (isSel) {
      mat.color.copy(selColor)
      mat.emissive.copy(selColor)
      mat.emissiveIntensity = isHover ? 0.45 : 0.25
    } else if (isHover) {
      mat.color.set(BUILDING_HOVER_COLOR)
      mat.emissive.set(BUILDING_HOVER_COLOR)
      mat.emissiveIntensity = 0.4
    } else {
      mat.color.copy(fillColor)
      mat.emissive.set(0x000000)
      mat.emissiveIntensity = 0
    }
    if (entry.line) {
      const lm = entry.line.material as THREE.LineBasicMaterial
      if (isSel) lm.color.copy(selColor)
      else if (isHover) lm.color.set(BUILDING_HOVER_COLOR)
      else lm.color.copy(borderColor)
    }
  })
}

// 数据源切换：从 sceneStore.devicePoints 改为 props.sceneSchema.sceneGraph.nodes.filter(type='device')
function buildPoints() {
  if (!ready) return
  if (isMediaScene.value) {
    while (pointsGroup.children.length) pointsGroup.remove(pointsGroup.children[0])
    removeSelectablesByTypes(['device'])
    return
  }
  if (!sceneStore.markerSwitch?.show_device_points) {
    while (pointsGroup.children.length) pointsGroup.remove(pointsGroup.children[0])
    removeSelectablesByTypes(['device'])
    return
  }
  while (pointsGroup.children.length) pointsGroup.remove(pointsGroup.children[0])
  // GK-13 修复：重建前先移除旧设备条目，避免 toggle 时 selectables 里设备重复累积
  removeSelectablesByTypes(['device'])

  const PALETTE = KP_SCENE_PALETTE
  const visibleBuildingsArr = sceneStore.visibleBuildings
  // 当 sceneSchema 未挂载时，仍提供与原实现一致的占位彩球（视觉零回归兜底）
  // GK-19：元素补 floor（全景抽稀 / 楼层钻取过滤需要；store 侧场景点位无 floor 时为 null）
  type Pt = {
    id: string
    device_id: string
    building_id: string
    floor?: number | null
    position: { x: number; y: number; z: number }
    marker_type: string
    label: string
    level_of_detail: 'building' | 'subsystem' | 'equipment'
    visible: boolean
  }
  let pts: Pt[] = []
  if (deviceNodes.value.length > 0) {
    pts = deviceNodes.value.map((d) => ({
      id: d.id,
      device_id: d.deviceId,
      building_id: d.buildingId,
      floor: d.floor,
      position: { x: d.position[0], y: d.position[1], z: d.position[2] },
      marker_type: d.marker_type,
      label: d.label,
      level_of_detail: d.level_of_detail,
      visible: d.visible,
    }))
  } else {
    // 兼容旧行为：sceneSchema 未含 device 节点时退回到 sceneStore.devicePoints；都没有时按楼栋合成点位
    if (sceneStore.devicePoints.length > 0) {
      pts = (sceneStore.devicePoints as unknown as Pt[]).map((p) => ({
        ...p,
        floor: (p as Pt).floor ?? null,
      }))
    } else {
      visibleBuildingsArr.forEach((b, bi) => {
        const a = anchorOf(b.id)
        for (let k = 0; k < 5; k++) {
          pts.push({
            id: `${b.id}-p${k}`,
            device_id: `${b.id}-dev${k}`,
            building_id: b.id,
            position: { x: a[0] + (k - 2) * 4, y: 13 + (k % 3) * 4, z: a[2] + ((k % 2) - 0.5) * 8 },
            marker_type: 'equipment',
            label: `${b.name} ${t('设备', 'Device')} ${k + 1}`,
            level_of_detail: 'equipment',
            visible: true,
          } as any)
        }
      })
    }
  }

  // GK-19：显示层分级过滤（单一入口在 store：楼层钻取 > 选中楼栋 > 全景按楼栋分层抽稀）
  // 只影响渲染，不删后端任何点位数据（1842 条资产完整保留）。
  const filtered = sceneStore.filterDevicePoints(pts)
  const visible = filtered.filter(
    (p) => !sceneStore.selectedBuilding || p.building_id === sceneStore.selectedBuilding,
  )
  visible.forEach((p) => {
    const idx = visibleBuildingsArr.findIndex((b) => b.id === p.building_id)
    // 3D 设备点按子系统着色（E1）：category → subsystem → SUBSYS_HEX；未映射类别回退楼栋调色板
    const subsys = CATEGORY_SUBSYS[p.marker_type] || ''
    const color = subsys && SUBSYS_HEX[subsys] ? SUBSYS_HEX[subsys] : PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length]
    const geo = new THREE.SphereGeometry(1.1, 12, 12)
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(p.position.x, p.position.y, p.position.z)
    mesh.userData = { type: 'device', id: p.device_id }
    pointsGroup.add(mesh)
    selectables.push(mesh)
  })
}

// ---------- 区域热点（多边形描边，可点击） ----------
function buildAreaMesh(
  m: SceneMarker,
  selected: boolean,
  hovered: boolean,
): THREE.Mesh {
  const arr = m.area_points || []
  const verts: number[] = []
  const centroid = new THREE.Vector3()
  arr.forEach((p) => centroid.add(new THREE.Vector3(p.x, p.y, p.z)))
  centroid.multiplyScalar(1 / arr.length)
  for (let i = 1; i < arr.length; i++) {
    const p0 = arr[i - 1]
    const p1 = arr[i]
    verts.push(centroid.x, centroid.y, centroid.z, p0.x, p0.y, p0.z, p1.x, p1.y, p1.z)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.computeVertexNormals()

  let color = new THREE.Color(m.color || KP_FALLBACK_CYAN)
  let opacity = AREA_BASE_OPACITY
  if (selected) {
    color = new THREE.Color(AREA_SELECTED_COLOR)
    opacity = AREA_SELECTED_OPACITY
  } else if (hovered) {
    color = new THREE.Color(AREA_HOVER_COLOR)
    opacity = AREA_HOVER_OPACITY
  }
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.userData = { type: 'area', id: m.id, marker: m }

  if (arr.length >= 3) {
    const perimeter = arr.map((p) => new THREE.Vector3(p.x, p.y, p.z))
    const loopGeo = new THREE.BufferGeometry().setFromPoints(perimeter)
    const loopMat = new THREE.LineBasicMaterial({
      color: selected ? new THREE.Color(AREA_SELECTED_COLOR) : color,
      transparent: true,
      opacity: selected ? 0.95 : 0.5,
    })
    mesh.add(new THREE.LineLoop(loopGeo, loopMat))
  }
  return mesh
}

// 数据源切换：从 sceneStore.markers.filter(shape='area') 改为 props.sceneSchema.sceneGraph.nodes.filter(semantic.shape='area')
function buildAreaMarkers() {
  if (!ready) return
  if (isMediaScene.value) {
    while (areaGroup.children.length) areaGroup.remove(areaGroup.children[0])
    for (let i = selectables.length - 1; i >= 0; i--) {
      if (selectables[i].userData?.type === 'area') selectables.splice(i, 1)
    }
    return
  }
  while (areaGroup.children.length) areaGroup.remove(areaGroup.children[0])
  for (let i = selectables.length - 1; i >= 0; i--) {
    if (selectables[i].userData?.type === 'area') selectables.splice(i, 1)
  }
  // 兼容旧逻辑：当 sceneSchema 没有 area 节点（mock 未含/接 GK-01 前）退化到 sceneStore.markers
  let areas: SceneMarker[] = []
  if (areaNodes.value.length > 0) {
    areas = areaNodes.value.map((a) => ({
      id: a.markerId,
      building_id: a.building_id,
      building: '',
      floor: a.floor,
      position: { x: a.position[0], y: a.position[1], z: a.position[2] },
      marker_type: 'area',
      label: a.label,
      device_id: null,
      visible: true,
      color: a.color,
      shape: 'area',
      area_points: a.area_points,
      link: a.link ?? null,
      params: a.params,
    } as unknown as SceneMarker))
  } else {
    areas = sceneStore.markers.filter(
      (m) => m.shape === 'area' && m.visible && m.area_points && m.area_points.length >= 3,
    )
  }
  areas.forEach((m) => {
    const mesh = buildAreaMesh(m, m.id === selectedAreaId.value, m.id === hoveredAreaId.value)
    areaGroup.add(mesh)
    selectables.push(mesh)
  })
}

// ---------- 选中楼栋高亮光束 ----------
function buildHighlight() {
  if (!ready) return
  if (isMediaScene.value) {
    while (highlightGroup.children.length) highlightGroup.remove(highlightGroup.children[0])
    return
  }
  while (highlightGroup.children.length) highlightGroup.remove(highlightGroup.children[0])
  const a = sceneStore.selectedAnchor
  if (!a) return
  const color = new THREE.Color(highlightColor.value)
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 68, 16),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 }),
  )
  beam.position.set(a[0], 34, a[2])
  highlightGroup.add(beam)

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(8, 10, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.set(a[0], 0.6, a[2])
  highlightGroup.add(ring)

  const top = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 16, 16),
    new THREE.MeshBasicMaterial({ color }),
  )
  top.position.set(a[0], 68, a[2])
  highlightGroup.add(top)
}

function rebuildDataLayers() {
  while (markersGroup.children.length) markersGroup.remove(markersGroup.children[0])
  while (pointsGroup.children.length) pointsGroup.remove(pointsGroup.children[0])
  while (areaGroup.children.length) areaGroup.remove(areaGroup.children[0])
  while (highlightGroup.children.length) highlightGroup.remove(highlightGroup.children[0])
  selectables.length = 0
  buildingMeshes.clear()
  if (!isMediaScene.value) {
    buildMarkers()
    buildPoints()
    buildAreaMarkers()
    buildHighlight()
  }
}
async function reloadScene() {
  await loadModel()
  rebuildDataLayers()
}

// ---------- 相机飞行聚焦 ----------
function flyTo(target: [number, number, number]) {
  if (!camera || !controls) return
  const fromPos = camera.position.clone()
  const fromTarget = controls.target.clone()
  const toTarget = new THREE.Vector3(target[0], target[1], target[2])
  const toPos = new THREE.Vector3(target[0] + 60, target[1] + 55, target[2] + 95)
  const start = performance.now()
  const dur = 600
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur)
    const e = ease(t)
    camera!.position.lerpVectors(fromPos, toPos, e)
    controls!.target.copy(fromTarget.clone().lerp(toTarget, e))
    controls!.update()
    if (t < 1 && !disposed) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

// ---------- GK-08：cameraPresets 数据驱动相机（单一入口） ----------
// 约定：schema.cameraPresets 的 preset id = preset_bldg_<楼栋原始id>_overview / preset_floor_<楼栋原始id>_<层号>。
// 数据源：sceneSchema.cameraPresets（sceneSchema=null 时 sceneStore.sceneConfig.camera_presets 兜底）。
// 命中 → 按 preset.transitionMs 平滑补间（position/lookAt/fov 全量生效）；
// 未命中 → console.warn + 回退（楼栋回退楼栋锚点旧视角 / presetId 回退默认视角），保证与改造前无 schema 行为一致。

function cancelCameraTween() {
  camTween?.cancel()
  camTween = null
}

function applyPresetFlight(preset: CameraPreset, presetId: string): boolean {
  if (!camera || !controls) return false
  cancelCameraTween()
  activePresetId.value = presetId
  camTween = tweenCameraTo({
    camera,
    controls,
    pose: preset.pose,
    durationMs: preset.transitionMs,
    onDone: () => {
      camTween = null
    },
  })
  return true
}

/** 回退默认全院视角（无 schema / 预设缺失时的"默认视角"兜底） */
function resetDefaultView(): boolean {
  if (!camera) return false
  cancelCameraTween()
  activePresetId.value = null
  camTween = tweenCameraTo({
    camera,
    controls,
    pose: DEFAULT_CAMERA_POSE,
    durationMs: 700,
    onDone: () => {
      camTween = null
    },
  })
  return true
}

/** 单一入口 1：按 presetId 飞（找不到 → 回退默认视角并 warn） */
function flyToPreset(presetId: string): boolean {
  const preset = findPresetById(cameraPresetList.value, presetId)
  if (!preset) {
    console.warn(
      `[cameraPreset] 未找到 preset「${presetId}」，回退默认视角（catalog=${cameraPresetList.value.length} 项）`,
    )
    return resetDefaultView()
  }
  return applyPresetFlight(preset, presetId)
}

/** 单一入口 2：点/选楼栋 → preset_bldg_<id>_overview；无 preset 回退楼栋锚点视角（原 flyTo） */
function flyToBuilding(buildingId: string): boolean {
  if (!buildingId) return false
  const preset = findBuildingPreset(cameraPresetList.value, buildingId)
  if (preset) return applyPresetFlight(preset, preset.id)
  console.warn(
    `[cameraPreset] 楼栋「${buildingId}」无 overview preset（${presetIdForBuilding(buildingId)}），回退楼栋锚点视角`,
  )
  const a = anchorFor(buildingId)
  if (a) {
    flyTo(a)
    return true
  }
  return resetDefaultView()
}

/** 单一入口 3：楼层钻取/选楼层 → preset_floor_<id>_<floor>；无 preset 相机保持现状并 warn */
function flyToFloor(buildingId: string, floor: number): boolean {
  if (!buildingId || typeof floor !== 'number' || !Number.isFinite(floor)) return false
  const preset = findFloorPreset(cameraPresetList.value, buildingId, floor)
  if (preset) return applyPresetFlight(preset, preset.id)
  console.warn(
    `[cameraPreset] 楼层「${buildingId}/${floor}」无 floor preset（${presetIdForFloor(buildingId, floor)}），相机保持现状`,
  )
  return false
}

function anchorFor(buildingId: string): [number, number, number] | null {
  return sceneStore.anchorByBuilding[buildingId] || getBuildingMeta(buildingId)?.anchor || null
}

function currentCameraPose(): CameraPose | null {
  if (!camera) return null
  const t = controls?.target
  return {
    position: [camera.position.x, camera.position.y, camera.position.z],
    lookAt: t ? [t.x, t.y, t.z] : [0, 0, 0],
    fov: camera.fov,
  }
}

function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const w = el.clientWidth || 960
  const h = el.clientHeight || 540
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function dispose() {
  disposed = true
  cancelCameraTween()
  cancelAnimationFrame(raf)
  disposeMedia()
  if (renderer) {
    renderer.domElement.style.cursor = ''
    renderer.dispose()
  }
  scene?.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}

// ---------- 联动 watch ----------
// 楼栋变化（含 sceneSchema 派生 driving，sceneSchema 数据源变化 → 重建）
watch(
  () => [
    buildingNodes.value.map((n) => n.buildingId).join(','),
    JSON.stringify(sceneStore.anchorByBuilding),
  ],
  () => buildMarkers(),
)
// 选中楼栋联动（含 GK-08：选楼/3D 点楼 → 飞 schema 楼栋 overview preset；无 preset 回退锚点）
watch(() => sceneStore.selectedBuilding, (id) => {
  buildMarkers()
  buildHighlight()
  if (id) flyToBuilding(id)
})
// 设备点位变化（sceneSchema 投影 / sceneStore.devicePoints 任一变化）
watch(
  () => [
    deviceNodes.value.map((n) => n.id).join(','),
    sceneStore.devicePoints.map((p) => p.id).join(','),
    // GK-19：配额 / 视图态（全景→选楼→钻层）变化需重建设备点
    sceneStore.devicePointQuota,
    sceneStore.deviceViewMode,
  ],
  () => buildPoints(),
)
// 区域热点变化
watch(
  () => [
    areaNodes.value.map((n) => n.id).join(','),
    sceneStore.markers.map((m) => `${m.id}:${m.shape || ''}:${m.visible ? 1 : 0}`).join(','),
  ],
  buildAreaMarkers,
)
// 选中区域变化时重渲染高亮
watch(() => selectedAreaId.value, buildAreaMarkers)
// 标注开关变化时
watch(() => JSON.stringify(sceneStore.markerSwitch), () => {
  buildMarkers()
  buildPoints()
})
// 楼栋显示 DIY 变化
watch(() => JSON.stringify(sceneStore.buildingDisplay), () => {
  buildMarkers()
  buildHighlight()
})
// 楼层标签实时数值/越阈变色
watch(() => sceneStore.liveMetrics, refreshFloorLabelValues, { deep: true })
watch(() => sceneStore.activeSubsystem, buildHighlight)
// GK-08：楼层钻取（3D 楼层标签 / 大屏楼层钻取入口 openFloorDrill）→ 飞 schema 楼层 preset
watch(
  () => [sceneStore.floorDrill.buildingId, sceneStore.floorDrill.floor] as const,
  ([bid, floor]) => {
    // GK-19：钻层的进入与退出都要重建设备点（退出时回到抽稀态，可逆）
    buildPoints()
    if (!bid || typeof floor !== 'number') return
    flyToFloor(bid, floor)
  },
)

// GK-30 / GK-30b：楼层真实模型 / 整栋建筑真实模型 进入/退出（floorDrill 命中配置中的 {buildingId, floor}
// 时加载单层分割模型；选中楼栋（未钻取）且命中 BUILDING_MODELS 时加载整栋模型；否则卸载恢复盒体）。
// 钻取态优先于整栋态（activeFloorModel || activeBuildingModel）。
watch(
  [activeFloorModel, activeBuildingModel],
  async ([floorAsset, bldgAsset]) => {
    const asset = floorAsset || bldgAsset
    if (asset) {
      floorModelReady.value = false
      activeModelBuildingId.value = asset.buildingId
      try {
        // GK-30b：真实模型按楼栋实时锚点对齐 x/z（后台「楼栋锚点」可拖动，盒体与模型始终同步；
        // 锚点 y 被盒体放置忽略，模型同样只取 x/z，竖直方向沿用配置里的楼层堆叠偏移）。
        let loadAsset = asset
        if (String(asset.buildingId) === '6') {
          const a = anchorOf('6')
          const pos: [number, number, number] = [a[0], asset.mapping.position[1], a[2]]
          loadAsset = { ...asset, mapping: { ...asset.mapping, position: pos } }
        }
        await loadFloorModel(loadAsset)
        floorModelReady.value = true
        buildMarkers() // 隐藏该楼程序盒体，露出真实模型
      } catch (e) {
        // 加载失败：保持盒体渲染，不崩溃
        floorModelReady.value = false
        activeModelBuildingId.value = null
        console.warn('[SceneRenderer][GK-30b] 真实模型加载失败，保持盒体：', (asset as any).url, e)
      }
    } else {
      unloadFloorModel()
      floorModelReady.value = false
      activeModelBuildingId.value = null
      buildMarkers() // 恢复程序盒体
    }
  },
)
// 后台上传新场景模型（或切换模型类型）后自动重载
watch(
  () => [sceneStore.sceneConfig?.model_url, sceneStore.sceneConfig?.model_type],
  () => {
    if (ready) reloadScene()
  },
)

// 媒体场景切换时动态增删地面
watch(isMediaScene, (media) => {
  if (!scene) return
  if (media) {
    if (ground) {
      scene.remove(ground)
      ground.geometry.dispose()
      ;(ground.material as THREE.Material).dispose()
      ground = null
    }
  } else if (!ground) {
    const groundGeo = new THREE.PlaneGeometry(320, 220)
    const groundMat = new THREE.MeshStandardMaterial({ color: KP_GROUND, metalness: 0.1, roughness: 0.9 })
    ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(30, -0.2, 0)
    scene.add(ground)
  }
})

// 等待 sceneConfig（含 model_url）就绪 + sceneSchema（props）就绪，避免重建时缺数据
async function ensureSceneConfig() {
  if (sceneStore.sceneConfig && props.sceneSchema) return
  await new Promise<void>((resolve) => {
    const stop = watch(
      () => [sceneStore.sceneConfig, props.sceneSchema],
      ([cfg, sch]) => {
        if (cfg && sch) {
          stop()
          resolve()
        }
      },
      { immediate: true },
    )
    setTimeout(resolve, 3000)
  })
}

onMounted(async () => {
  initThree()
  window.addEventListener('resize', onResize)
  if (import.meta.env.DEV) installFloorModelDebugHook()
  // 6 号楼点击跳楼层：生产/QA 可用诊断句柄（始终注入，安全只读 + 触发整栋→楼层钻取）
  installBld6JumpHook()
  await ensureSceneConfig()
  reloadScene()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  if (import.meta.env.DEV) uninstallFloorModelDebugHook()
  dispose()
})

// GK-30：dev-only 调试/QA 句柄（生产构建不含）。供 CDP/e2e 直接判定楼层真实模型加载态，
// 与 gk17 的 __kpSceneCamera 同范式。expose 的是运行时真实状态，避免 e2e 依赖魔法坐标。
function countMeshesInGroup(g: THREE.Object3D): number {
  let n = 0
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++
  })
  return n
}
function installFloorModelDebugHook() {
  if (!import.meta.env.DEV) return
  ;(window as unknown as { __kpFloorModel: unknown }).__kpFloorModel = {
    active: () => (activeFloorModel.value ? { ...activeFloorModel.value.mapping, id: activeFloorModel.value.id, buildingId: activeFloorModel.value.buildingId, floor: activeFloorModel.value.floor } : null),
    isVisible: () => floorModelGroup.children.length > 0,
    meshCount: () => countMeshesInGroup(floorModelGroup),
    groupChildCount: () => floorModelGroup.children.length,
    // 6 号楼整栋世界包围盒（点击跳楼层 Y 映射真值；null = 未加载整栋）
    bld6WholeBox: () =>
      bld6WholeWorldBox
        ? {
            minY: +bld6WholeWorldBox.min.y.toFixed(3),
            maxY: +bld6WholeWorldBox.max.y.toFixed(3),
            childCount: floorModelGroup.children.length,
          }
        : null,
    // 6 号楼：给定世界 Y 计算楼层（1/2/3）并触发整栋→楼层钻取（QA 验证 Y→floor 映射 + 联动，无需依赖画布点击坐标）
    bld6JumpFromY: (y: number) => {
      if (!bld6WholeWorldBox) return null
      const f = bld6FloorFromWorldY(y, bld6WholeWorldBox.min.y, bld6WholeWorldBox.max.y)
      useSceneStore().openFloorDrill('6', f)
      return f
    },
    // 异常路径自测：用任意 url 尝试加载并立即释放，返回值 'ok'/'fail'，不污染当前场景
    loadUrl: async (url: string) => {
      try {
        const obj = await loadObject(url)
        obj.traverse((o: any) => {
          if (o.geometry) o.geometry.dispose?.()
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material]
            ms.forEach((m: any) => m.dispose?.())
          }
        })
        return 'ok'
      } catch {
        return 'fail'
      }
    },
  }
}
function uninstallFloorModelDebugHook() {
  const w = window as unknown as { __kpFloorModel?: unknown }
  if (w.__kpFloorModel) delete w.__kpFloorModel
}

// 6 号楼整栋点击跳楼层：生产/QA 可用诊断句柄（始终注入，安全只读 + 触发整栋→楼层钻取）。
// 与 InteractionController 内「命中 bldg6whole 代理 → 按世界 Y 映射楼层 → openFloorDrill('6',f)」同一公式，
// 供 e2e 在无需依赖画布像素坐标的前提下验证算法逻辑与联动。
function installBld6JumpHook() {
  const w = window as unknown as { __kpB6Jump: unknown }
  w.__kpB6Jump = {
    // 整栋世界包围盒（null = 整栋 6 号楼模型尚未加载）
    wholeBox: () =>
      bld6WholeWorldBox
        ? {
            minY: +bld6WholeWorldBox.min.y.toFixed(3),
            maxY: +bld6WholeWorldBox.max.y.toFixed(3),
          }
        : null,
    // 给定世界 Y 计算楼层（1/2/3），纯算法（与 bld6FloorFromWorldY 一致）
    floorFromY: (y: number) =>
      bld6WholeWorldBox ? bld6FloorFromWorldY(y, bld6WholeWorldBox.min.y, bld6WholeWorldBox.max.y) : null,
    // 触发整栋→楼层钻取（与点击整栋模型走同一 openFloorDrill 入口），返回目标楼层
    jumpFromY: (y: number) => {
      if (!bld6WholeWorldBox) return null
      const f = bld6FloorFromWorldY(y, bld6WholeWorldBox.min.y, bld6WholeWorldBox.max.y)
      useSceneStore().openFloorDrill('6', f)
      return f
    },
    // 当前楼层钻取态（store 真相源，同步生效，不依赖 el-dialog 关闭过渡动画），供 QA 验证整楼 Tab→closeFloorDrill
    floorDrill: () => {
      const fd = useSceneStore().floorDrill
      return { buildingId: fd.buildingId, floor: fd.floor }
    },
  }
}

// 暴露给 ThreeViewer facade / InteractionController 用
defineExpose({
  loadModel: (url: string) => loadModel().then(() => undefined),
  flyTo,
  // GK-08：schema cameraPresets 单一入口
  flyToPreset: (presetId: string) => flyToPreset(presetId),
  flyToBuilding: (buildingId: string) => flyToBuilding(buildingId),
  flyToFloor: (buildingId: string, floor: number) => flyToFloor(buildingId, floor),
  resetDefaultView,
  getActivePresetId: () => activePresetId.value,
  getCameraPose: () => currentCameraPose(),
  getScene: () => scene,
  getCamera: () => camera,
  getRenderer: () => renderer,
  getControls: () => controls,
  getContainer: () => container.value,
  getSelectables: () => selectables,
  // hover/选中态维持（InteractionController 命中后回调）
  setHoveredArea: (id: string | null) => {
    hoveredAreaId.value = id
    buildAreaMarkers()
  },
  setHoveredBuilding: (id: string | null) => {
    hoveredBuildingId.value = id
    applyBuildingHoverColors()
  },
  setSelectedArea: (id: string | null) => {
    selectedAreaId.value = id
    buildAreaMarkers()
  },
  getSelectedAreaId: () => selectedAreaId.value,
  // 内部 RAF 状态供 pointer 处理使用
  isReady: () => ready,
})
</script>

<template>
  <div ref="container" class="three-viewer">
    <!-- 操作提示（功能引导，非装饰） -->
    <div class="viewer-hint">
      <span>{{ t('拖拽旋转 · 滚轮缩放 · 点击楼栋/设备聚焦', 'Drag to rotate · Scroll to zoom · Click building/device to focus') }}</span>
    </div>

    <!-- 初始化 / 模型加载遮罩 -->
    <div v-if="sceneStore.modelLoading" class="viewer-loading">
      <div class="viewer-loading__ring" />
      <div class="viewer-loading__text">{{ sceneStore.modelLoadingHint || t('模型加载中…', 'Loading model…') }}</div>
    </div>
    <div v-else-if="sceneStore.modelError" class="viewer-fallback">
      <span>{{ t('模型加载失败 · 已切换占位楼栋', 'Model load failed · Fallback placeholders used') }}</span>
    </div>
  </div>
</template>

<style scoped>
.three-viewer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 50% 40%, rgba(var(--kp-accent-rgb), 0.06), transparent 40%),
    var(--kp-bg);
}

.viewer-hint {
  position: absolute;
  right: 18px;
  bottom: 14px;
  z-index: 10;
  font-size: var(--kp-text-xs);
  letter-spacing: var(--kp-tracking-label);
  color: var(--kp-fg-muted);
  background: rgba(var(--kp-bg-rgb), 0.55);
  border: 1px solid var(--kp-border);
  border-radius: var(--kp-radius-sm);
  padding: 4px 10px;
  pointer-events: none;
}

.viewer-loading {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  background: rgba(var(--kp-bg-rgb), 0.82);
}

.viewer-loading__ring {
  width: 54px;
  height: 54px;
  border-radius: 50%;
  border: 3px solid transparent;
  border-top-color: var(--kp-accent);
  border-right-color: var(--kp-border);
  animation: kp-ring-spin 1s linear infinite;
  box-shadow: 0 0 20px var(--kp-glow);
}

.viewer-loading__text {
  color: var(--kp-fg);
  font-size: var(--kp-text-sm);
  letter-spacing: var(--kp-tracking-label);
}

.viewer-fallback {
  position: absolute;
  left: 18px;
  bottom: 14px;
  z-index: 15;
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: var(--kp-text-xs);
  letter-spacing: 0.5px;
  color: var(--kp-warn);
  background: rgba(var(--kp-warn-rgb), 0.12);
  border: 1px solid rgba(var(--kp-warn-rgb), 0.4);
  border-radius: var(--kp-radius-sm);
  pointer-events: none;
}
</style>
