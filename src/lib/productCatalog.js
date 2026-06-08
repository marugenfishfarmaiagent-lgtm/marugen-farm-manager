/** Products with trackStock=false are invoice price-list only — no stock deduction. */
export function isStockTracked(product) {
  return product?.trackStock !== false
}

export function stockProducts(all) {
  return (all || []).filter(isStockTracked)
}

export function priceListProducts(all) {
  return (all || []).filter((p) => !isStockTracked(p))
}
