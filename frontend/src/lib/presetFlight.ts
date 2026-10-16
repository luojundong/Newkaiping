/**
 * presetFlight.ts — GK-08 相机姿态过渡（仅依赖 THREE 相机 + 一个可补间的 controls 形状）
 *
 * 由 SceneRenderer.vue 持有 camera/controls 实例调用；纯逻辑抽到 lib 便于与 preset 解析分离、
 * 保持 SceneRenderer 薄、并可独立复测。控制点语义与既有 SceneRenderer.flyTo 一致：
 *   - 相机 position 补间到 pose.position
 *   - OrbitControls.target 补间到 pose.lookAt
 *   - fov 补间到 pose.fov（结束 updateProjectionMatrix）
 */
import * as THREE from 'three'
import type { CameraPose } from '@/lib/cameraPreset'

// 只需 controls 上与补间相关的形状，避免 lib 强依赖 OrbitControls 具体类
export interface TweenableControls {
  target: THREE.Vector3
  update: () => void
}

export interface CameraTweenHandle {
  cancel: () => void
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 直接落到目标姿态（无动画；用于补间收尾兜底，保证 position/lookAt/fov 精确生效） */
export function applyCameraPose(
  camera: THREE.PerspectiveCamera,
  controls: TweenableControls | null,
  pose: CameraPose,
): void {
  camera.position.set(pose.position[0], pose.position[1], pose.position[2])
  if (typeof pose.fov === 'number' && Number.isFinite(pose.fov) && Math.abs(pose.fov - camera.fov) > 0.0001) {
    camera.fov = pose.fov
    camera.updateProjectionMatrix()
  }
  if (controls) {
    controls.target.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2])
    controls.update()
  }
}

/** 从当前姿态平滑飞到目标姿态（默认 easeInOutCubic；时长下限 300ms 避免"跳一下"） */
export function tweenCameraTo(opts: {
  camera: THREE.PerspectiveCamera
  controls: TweenableControls | null
  pose: CameraPose
  durationMs: number
  onDone?: () => void
}): CameraTweenHandle {
  const { camera, controls, pose, onDone } = opts
  const durationMs = Math.max(300, Number.isFinite(opts.durationMs) ? opts.durationMs : 800)
  const fromPos = camera.position.clone()
  const fromTarget = controls ? controls.target.clone() : new THREE.Vector3()
  const fromFov = camera.fov
  const toPos = new THREE.Vector3(pose.position[0], pose.position[1], pose.position[2])
  const toTarget = new THREE.Vector3(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2])
  const start = performance.now()
  let raf = 0
  let cancelled = false

  const step = (now: number) => {
    if (cancelled) return
    const t = Math.min(1, (now - start) / durationMs)
    const e = easeInOutCubic(t)
    camera.position.lerpVectors(fromPos, toPos, e)
    if (controls) {
      controls.target.copy(fromTarget).lerp(toTarget, e)
      controls.update()
    }
    if (Number.isFinite(pose.fov)) {
      camera.fov = fromFov + (pose.fov - fromFov) * e
      camera.updateProjectionMatrix()
    }
    if (t < 1) {
      raf = requestAnimationFrame(step)
    } else {
      applyCameraPose(camera, controls, pose)
      onDone?.()
    }
  }
  raf = requestAnimationFrame(step)

  return {
    cancel() {
      cancelled = true
      cancelAnimationFrame(raf)
    },
  }
}
