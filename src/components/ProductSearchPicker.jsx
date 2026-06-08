import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { formatSGD } from '../data/constants'
import { priceListProducts, stockProducts } from '../lib/productCatalog'

function matchesQuery(product, q) {
  if (!q) return true
  const hay = [product.name, product.sku, product.category, product.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return hay.includes(q)
}

function ProductOption({ product, onPick, disabled, hint }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(product.id)}
      className={`w-full text-left px-3 py-2 text-sm border-b border-slate-700/40 last:border-0 touch-manipulation ${
        disabled
          ? 'text-slate-600 cursor-not-allowed'
          : 'text-slate-200 hover:bg-slate-700/60 active:bg-slate-700'
      }`}
    >
      <span className="block font-medium truncate">{product.name}</span>
      <span className="block text-xs text-slate-500 truncate">
        {product.sku ? `${product.sku} · ` : ''}{formatSGD(product.price)}{hint ? ` · ${hint}` : ''}
      </span>
    </button>
  )
}

export default function ProductSearchPicker({ products, onSelect, className = '' }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  const stock = useMemo(() => stockProducts(products), [products])
  const catalog = useMemo(() => priceListProducts(products), [products])
  const q = query.trim().toLowerCase()

  const filteredStock = useMemo(() => stock.filter((p) => matchesQuery(p, q)), [stock, q])
  const filteredCatalog = useMemo(() => catalog.filter((p) => matchesQuery(p, q)), [catalog, q])
  const hasResults = filteredStock.length > 0 || filteredCatalog.length > 0

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (productId) => {
    onSelect(productId)
    setQuery('')
    setOpen(false)
  }

  const showDropdown = open && (q.length > 0 || hasResults)

  return (
    <div ref={wrapRef} className={`relative flex-1 min-w-[200px] ${className}`}>
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search product name or SKU…"
          aria-label="Search products to add to invoice"
          className="w-full bg-slate-900/50 border border-slate-600 rounded-lg pl-9 pr-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
        />
      </div>
      {showDropdown && (
        <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto overscroll-contain bg-slate-800 border border-slate-600 rounded-lg shadow-xl">
          {!hasResults && (
            <p className="px-3 py-3 text-slate-500 text-sm">No products match your search.</p>
          )}
          {filteredStock.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-cyan-400/80 bg-slate-900/50 sticky top-0">
                Inventory (stock tracked)
              </p>
              {filteredStock.map((p) => (
                <ProductOption
                  key={p.id}
                  product={p}
                  onPick={pick}
                  disabled={p.stock <= 0}
                  hint={p.stock > 0 ? `${p.stock} ${p.unit} in stock` : 'out of stock'}
                />
              ))}
            </div>
          )}
          {filteredCatalog.length > 0 && (
            <div>
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-400/80 bg-slate-900/50 sticky top-0">
                Price list (invoice only)
              </p>
              {filteredCatalog.map((p) => (
                <ProductOption
                  key={p.id}
                  product={p}
                  onPick={pick}
                  hint="price list"
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
