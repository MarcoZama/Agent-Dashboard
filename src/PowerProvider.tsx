import { useEffect, useState, type ReactNode } from 'react'
import { getContext } from '@microsoft/power-apps/app'

interface PowerProviderProps {
  children: ReactNode
}

export default function PowerProvider({ children }: PowerProviderProps) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (import.meta.env.VITE_DATA_SOURCE === 'mock') {
      setReady(true)
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const init = async () => {
      try {
        await Promise.race([
          getContext(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Power Apps host did not respond within 15 seconds.')), 15_000)
          }),
        ])
        if (!cancelled) setReady(true)
      } catch (error) {
        console.error('Power Apps initialization failed.', error)
        if (!cancelled) setError(error instanceof Error ? error.message : String(error))
      } finally {
        clearTimeout(timer)
      }
    }
    void init()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  if (error) {
    return <div className="app-loading" role="alert">
      <strong>Power Apps connection unavailable</strong>
      <span>{error}</span>
      <span>Open this dashboard in the authenticated Power Apps player. Plain Vite cannot access connector APIs.</span>
      <button className="btn" onClick={() => window.location.reload()}>Retry</button>
    </div>
  }

  if (!ready) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <span>Loading Agents Dashboard…</span>
      </div>
    )
  }

  return <>{children}</>
}
