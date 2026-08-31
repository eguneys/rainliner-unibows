import './style.css'
import * as play from './play'
import { WebGlRenderer } from './webgl/renderer'

export function Loop(update: (dt: number) => void, render: (alpha: number) => void, after_render?: () => void) {
  let is_running = true
  let animationFrameId: number
  const timestep = 1000 / 60
  let last_time = performance.now()
  let accumulator = 0

  function step(current_time: number) {
    if (!is_running) return
    animationFrameId = requestAnimationFrame(step)


    let delta_time = Math.min(current_time - last_time, 25)
    last_time = current_time

    accumulator += delta_time

    while (accumulator >= timestep) {
      update(timestep)
      accumulator -= timestep
    }

    render(accumulator / timestep)

    after_render?.()
  }
  animationFrameId = requestAnimationFrame(step)


  return () => {
    is_running = false
    cancelAnimationFrame(animationFrameId)
  }
}



export function Init_canvas(container: HTMLElement, set_viewport: (top: number, left: number, width: number, height: number, clientWidth: number, clientHeight: number) => void, set_canvas: (canvas: HTMLCanvasElement) => void, render: () => void) {

  let canvas = document.createElement('canvas')
  set_canvas(canvas)

  const resizeToContainer = () => {
    const dpr = window.devicePixelRatio || 1

    const rect = container.getBoundingClientRect()

    let targetWidth = Math.floor(rect.width * dpr)
    let targetHeight = Math.floor(rect.height * dpr)

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {

      canvas.width = targetWidth
      canvas.height = targetHeight
      set_viewport(rect.top, rect.left, canvas.width, canvas.height, rect.width, rect.height)

      //cx.imageSmoothingEnabled = false
      render()
    }
  }

  const resizeObserver = new ResizeObserver(() => resizeToContainer())
  resizeObserver.observe(container)
  container.appendChild(canvas)

  let gl = canvas.getContext('webgl2', { antialias: false, alpha: false })!

  return gl
}

async function app(el: HTMLElement) {

  let scene = play

  let initialized = false
  let gl = Init_canvas(el, scene._set_viewport, scene._set_canvas, () => {
    if (initialized) {
      scene._render()
    }
  })

  await scene._load()

  scene._set_ctx(new WebGlRenderer(gl, 640, 360))

  scene._init()
  initialized = true

  Loop(scene._update, scene._render)
}

app(document.getElementById('app')!)