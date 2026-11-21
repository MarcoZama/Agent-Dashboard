import { useEffect, useMemo, useRef, useState } from 'react'

export interface MultiSelectOption {
  value: string
  label: string
  /** Optional secondary text shown next to the label. */
  hint?: string
}

interface MultiSelectProps {
  label: string
  options: MultiSelectOption[]
  /** Selected values — an empty array means "all". */
  selected: string[]
  onChange: (values: string[]) => void
  /** Caption shown when nothing is selected. */
  allLabel: string
  /** Show the filter box once the list is longer than this. */
  searchThreshold?: number
}

/**
 * Combobox with checkboxes: every dimension can be narrowed to an arbitrary
 * subset, and the dashboard aggregates over the union of the selection.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  allLabel,
  searchThreshold = 8,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  const toggle = (value: string) => {
    const set = new Set(selected)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    onChange([...set])
  }

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? '1 selected')
        : `${selected.length} selected`

  return (
    <div className="field multiselect" ref={root}>
      <label>
        {label}
        {selected.length > 0 && (
          <button className="link-btn" onClick={() => onChange([])} style={{ marginLeft: 8 }}>
            clear
          </button>
        )}
      </label>
      <button
        type="button"
        className={`ms-trigger ${selected.length > 0 ? 'has-value' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={summary}
      >
        <span className="ms-summary">{summary}</span>
        {selected.length > 1 && <span className="ms-badge">{selected.length}</span>}
        <span className="ms-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className="ms-panel">
          {options.length > searchThreshold && (
            <input
              className="ms-search"
              placeholder={`Search ${label.toLowerCase()}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          )}
          <div className="ms-actions">
            <button className="link-btn" onClick={() => onChange(visible.map((o) => o.value))}>
              Select all
            </button>
            <button className="link-btn" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          <div className="ms-list">
            {visible.length === 0 && <div className="ms-empty">No match</div>}
            {visible.map((o) => (
              <label key={o.value} className="ms-option">
                <input
                  type="checkbox"
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                />
                <span className="ms-option-label">{o.label}</span>
                {o.hint && <span className="ms-option-hint">{o.hint}</span>}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
