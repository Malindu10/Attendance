import { useRef, useState, useCallback, useEffect } from 'react'

const COOLDOWN_MS = 3000  // mirrors backend SCAN_COOLDOWN_SECONDS

export function useCamera() {
  const videoRef      = useRef(null)
  const streamRef     = useRef(null)
  const lastScanRef   = useRef(0)
  const [active, setActive]     = useState(false)
  const [cooldown, setCooldown] = useState(0)  // seconds remaining

  // Countdown ticker
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lastScanRef.current + COOLDOWN_MS - Date.now()) / 1000))
      setCooldown(remaining)
    }, 200)
    return () => clearInterval(interval)
  }, [])

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',          // front camera
          width:  { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setActive(true)
    } catch (err) {
      console.error('Camera error:', err)
      throw new Error(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Please allow camera access in your browser settings.'
          : 'Could not start camera. Please try again.'
      )
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setActive(false)
  }, [])

  const captureFrame = useCallback(() => {
    const now = Date.now()
    if (now - lastScanRef.current < COOLDOWN_MS) {
      const wait = Math.ceil((lastScanRef.current + COOLDOWN_MS - now) / 1000)
      throw new Error(`Wait ${wait}s before scanning again.`)
    }
    if (!videoRef.current) throw new Error('Camera not ready.')

    const video  = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    const ctx = canvas.getContext('2d')

    // Un-mirror the canvas so AWS gets the real face (not flipped)
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0)

    lastScanRef.current = now
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  }, [])

  return { videoRef, active, cooldown, startCamera, stopCamera, captureFrame }
}
