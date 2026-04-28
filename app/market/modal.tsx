'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { upsertPrice, createItem, updateItem, createMarket, createCounty, createCountry } from './actions'
import type { ItemInfo, CountyInfo, CountryInfo, PriceRow } from './actions'

export type ModalMode =
  | { type: 'add-price'; marketId: string; marketName: string }
  | { type: 'edit-price'; price: PriceRow }
  | { type: 'add-item' }
  | { type: 'edit-item'; item: ItemInfo }
  | { type: 'add-market' }
  | { type: 'add-county' }
  | { type: 'add-country' }

type Props = {
  mode: ModalMode
  items: ItemInfo[]
  counties: CountyInfo[]
  countries: CountryInfo[]
  userCountyId?: string | null
  onClose: () => void
}

/* ── Searchable item select (for forms) ──────────────────────────── */

function ItemSearchSelect({ items, name, required }: {
  items: ItemInfo[]
  name: string
  required?: boolean
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<ItemInfo | null>(null)
  const [open, setOpen] = useState(false)

  const matches = items
    .filter((i) => !query || i.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 10)

  const total = items.filter(
    (i) => !query || i.name.toLowerCase().includes(query.toLowerCase())
  ).length

  const displayValue = selected ? `${selected.name} (${selected.unitMeasure})` : query

  return (
    <div className="relative">
      {/* Hidden input carries the real ID for FormData */}
      <input type="hidden" name={name} value={selected?.id ?? ''} />
      <input
        type="text"
        autoComplete="off"
        value={displayValue}
        placeholder="Search commodity…"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setSelected(null); setOpen(true) }}
        className={inputClass}
        aria-required={required}
      />
      {selected && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setSelected(null); setQuery('') }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Clear selection"
        >
          ×
        </button>
      )}
      {open && !selected && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No matches</p>
          ) : (
            <>
              {matches.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setSelected(item); setQuery(''); setOpen(false) }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                >
                  <span className="font-medium">{item.name}</span>
                  <span className="text-xs text-gray-400 ml-3">{item.unitMeasure}</span>
                </button>
              ))}
              {total > 10 && (
                <p className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
                  +{total - 10} more — type to filter
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Modal ───────────────────────────────────────────────────────── */

export function MarketModal({ mode, items, counties, countries, userCountyId, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
    return () => dialogRef.current?.close()
  }, [])

  const close = () => {
    dialogRef.current?.close()
    onClose()
  }

  const handleSubmit = (e: { preventDefault(): void; currentTarget: HTMLFormElement }) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    // Validate that a commodity was actually selected (not just typed)
    if (mode.type === 'add-price' && !formData.get('itemId')) {
      setError('Please select a commodity from the list.')
      return
    }

    startTransition(async () => {
      let result
      if (mode.type === 'add-price') {
        result = await upsertPrice(formData)
      } else if (mode.type === 'edit-price') {
        formData.set('marketId', mode.price.market.id)
        formData.set('itemId', mode.price.item.id)
        result = await upsertPrice(formData)
      } else if (mode.type === 'add-item') {
        result = await createItem(formData)
      } else if (mode.type === 'edit-item') {
        formData.set('id', mode.item.id)
        result = await updateItem(formData)
      } else if (mode.type === 'add-market') {
        result = await createMarket(formData)
      } else if (mode.type === 'add-county') {
        result = await createCounty(formData)
      } else {
        result = await createCountry(formData)
      }

      if (result.success) {
        router.refresh()
        close()
      } else {
        setError(result.error)
      }
    })
  }

  const titles: Record<ModalMode['type'], string> = {
    'add-price':   'Add / Update Price',
    'edit-price':  'Edit Price',
    'add-item':    'Add Commodity',
    'edit-item':   'Edit Commodity',
    'add-market':  'Add Market',
    'add-county':  'Add County / Region',
    'add-country': 'Add Country',
  }

  const icons: Record<ModalMode['type'], string> = {
    'add-price':   '💰',
    'edit-price':  '✏️',
    'add-item':    '🌾',
    'edit-item':   '✏️',
    'add-market':  '🏪',
    'add-county':  '📍',
    'add-country': '🌍',
  }

  // The county this user is locked to (for add-market)
  const lockedCounty = userCountyId
    ? counties.find((c) => c.id === userCountyId)
    : null

  return (
    <dialog
      ref={dialogRef}
      onCancel={close}
      className="m-auto w-full max-w-md rounded-3xl border border-violet-100 bg-white p-0 text-gray-800 shadow-2xl shadow-violet-100 backdrop:bg-black/40 backdrop:backdrop-blur-sm open:flex open:flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-linear-to-r from-indigo-800 to-violet-800 px-6 py-4 rounded-t-3xl">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icons[mode.type]}</span>
          <h2 className="text-base font-bold text-white">{titles[mode.type]}</h2>
        </div>
        <button
          type="button"
          onClick={close}
          className="grid h-7 w-7 place-items-center rounded-lg text-white/60 hover:bg-white/20 hover:text-white transition-colors text-sm"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 px-6 py-5">

        {/* ── Add price ── */}
        {mode.type === 'add-price' && (
          <>
            <input type="hidden" name="marketId" value={mode.marketId} />
            <Field label="Market">
              <div className={displayClass}>{mode.marketName}</div>
            </Field>
            <Field label="Commodity" required>
              <ItemSearchSelect items={items} name="itemId" required />
            </Field>
            <Field label="Price (KSh)" required>
              <input type="number" name="price" min={1} required placeholder="e.g. 120" className={inputClass} />
            </Field>
          </>
        )}

        {/* ── Edit price ── */}
        {mode.type === 'edit-price' && (
          <>
            <Field label="Commodity">
              <div className={displayClass}>
                {mode.price.item.name}{' '}
                <span className="text-gray-400 text-xs">({mode.price.item.unitMeasure})</span>
              </div>
            </Field>
            <Field label="Market">
              <div className={displayClass}>{mode.price.market.name}</div>
            </Field>
            <Field label="Current Price">
              <div className={displayClass}>KSh {mode.price.price.toLocaleString()}</div>
            </Field>
            <Field label="New Price (KSh)" required>
              <input
                type="number" name="price" min={1} required
                defaultValue={mode.price.price} className={inputClass}
              />
            </Field>
          </>
        )}

        {/* ── Add commodity ── */}
        {mode.type === 'add-item' && (
          <>
            <Field label="Commodity Name" required>
              <input type="text" name="name" required placeholder="e.g. Sweet Potatoes" className={inputClass} />
            </Field>
            <Field label="Unit of Measure">
              <input type="text" name="unitMeasure" placeholder="kg, bunch, head, bag…" defaultValue="kg" className={inputClass} />
            </Field>
          </>
        )}

        {/* ── Edit commodity ── */}
        {mode.type === 'edit-item' && (
          <>
            <Field label="Commodity Name" required>
              <input type="text" name="name" required defaultValue={mode.item.name} className={inputClass} />
            </Field>
            <Field label="Unit of Measure">
              <input type="text" name="unitMeasure" defaultValue={mode.item.unitMeasure} className={inputClass} />
            </Field>
            <p className="text-xs text-gray-400 -mt-2">
              Changing the name here updates it everywhere (all market prices).
            </p>
          </>
        )}

        {/* ── Add market ── */}
        {mode.type === 'add-market' && (
          <>
            <Field label="County / Region" required>
              {lockedCounty ? (
                <>
                  <input type="hidden" name="countyId" value={lockedCounty.id} />
                  <div className={displayClass}>{lockedCounty.name}</div>
                </>
              ) : (
                <>
                  <select name="countyId" required className={selectClass}>
                    <option value="">— select county —</option>
                    {counties.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {counties.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">No counties yet — add one first.</p>
                  )}
                </>
              )}
            </Field>
            <Field label="Market Name" required>
              <input type="text" name="marketName" required placeholder="e.g. MERU MARKET" className={inputClass} />
            </Field>
          </>
        )}

        {/* ── Add county ── */}
        {mode.type === 'add-county' && (
          <>
            <Field label="Country (optional)">
              <select name="countryId" className={selectClass}>
                <option value="">— no country —</option>
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="County / Region Name" required>
              <input type="text" name="countyName" required placeholder="e.g. Meru" className={inputClass} />
            </Field>
          </>
        )}

        {/* ── Add country ── */}
        {mode.type === 'add-country' && (
          <Field label="Country Name" required>
            <input type="text" name="countryName" required placeholder="e.g. Uganda" className={inputClass} />
          </Field>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={close} disabled={isPending} className={cancelClass}>Cancel</button>
          <button type="submit" disabled={isPending} className={submitClass}>
            {isPending ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                Saving…
              </span>
            ) : 'Save'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-gray-700">
        {label}{required && <span className="ml-1 text-violet-500">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputClass   = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all'
const selectClass  = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-100 transition-all'
const displayClass = 'w-full rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-600'
const submitClass  = 'flex-1 rounded-xl bg-linear-to-r from-violet-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 transition-all'
const cancelClass  = 'flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-60 transition-colors'
