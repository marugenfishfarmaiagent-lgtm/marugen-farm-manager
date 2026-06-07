/** Match inventory products from short nicknames or long spoken descriptions. */

const BRANDS = ['shori', 'jpd', 'akafuji', 'saki', 'hikari', 'tosai', 'yamato', 'ocean', 'saki-hikari']
const TYPES = ['sinking', 'floating', 'growth', 'wheatgerm', 'colour', 'color', 'staple', 'baby', 'jumbo', 'pellet']

export function normalizeProductText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[()[\]/,]/g, ' ')
    .replace(/\bl\s*\/\s*m\b/g, ' l m ')
    .replace(/\b(\d+(?:\.\d+)?)\s*kgs?\b/g, '$1kg')
    .replace(/\b(l|m|s)\s*-?\s*size\b/g, '$1size')
    .replace(/\bpellets?\b/g, 'pellet')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeProduct(text) {
  return normalizeProductText(text).split(/\s+/).filter((w) => w.length > 1)
}

function extractSignals(text) {
  const t = normalizeProductText(text)
  const tokens = tokenizeProduct(t)
  const signals = new Set(tokens)

  const weightMatch = t.match(/(\d+(?:\.\d+)?)kg/)
  const weight = weightMatch ? `${weightMatch[1]}kg` : null

  const sizes = new Set()
  if (/\blsize\b|\blarge\b|\bsize l\b/.test(t) || (/\bl\b/.test(t) && !/\bl\s+m\b/.test(t))) sizes.add('l')
  if (/\bmsize\b|\bmedium\b|\bsize m\b/.test(t)) sizes.add('m')
  if (/\bssize\b|\bsmall\b|\bsize s\b/.test(t)) sizes.add('s')
  if (/\bl\s+m\b/.test(t)) {
    sizes.add('l')
    sizes.add('m')
  }

  for (const b of BRANDS) if (t.includes(b)) signals.add(b)
  for (const ty of TYPES) if (t.includes(ty)) signals.add(ty)

  return { tokens, signals, weight, sizes, text: t }
}

export function productSearchCorpus(product) {
  return normalizeProductText([
    product?.name,
    product?.description,
    product?.sku,
    product?.category,
  ].filter(Boolean).join(' '))
}

export function scoreProductMatch(query, product) {
  const q = extractSignals(query)
  const corpus = productSearchCorpus(product)
  const p = extractSignals(corpus)

  if (!q.text) return 0
  if (normalizeProductText(product.name) === q.text) return 100
  if (corpus === q.text) return 95
  if (corpus.includes(q.text) || q.text.includes(corpus)) return 88

  let score = 0
  for (const t of q.tokens) {
    if (p.tokens.includes(t)) score += 4
    else if (corpus.includes(t)) score += 2
  }

  const qBrands = BRANDS.filter((b) => q.signals.has(b))
  const pBrands = BRANDS.filter((b) => p.signals.has(b))
  if (qBrands.length && pBrands.length) {
    if (qBrands.some((b) => pBrands.includes(b))) score += 18
    else return 0
  } else if (qBrands.length) {
    score -= 4
  }

  const qSink = q.signals.has('sinking')
  const qFloat = q.signals.has('floating')
  const pSink = p.signals.has('sinking')
  const pFloat = p.signals.has('floating')
  if (qSink && pFloat && !pSink) return Math.max(0, score - 25)
  if (qFloat && pSink && !pFloat) return Math.max(0, score - 25)
  if (qSink && pSink) score += 12
  if (qFloat && pFloat) score += 12

  if (q.signals.has('growth') && p.signals.has('growth')) score += 10
  if (q.signals.has('growth') && p.signals.has('floating') && !p.signals.has('growth')) score += 4

  if (q.weight && p.weight) {
    score += q.weight === p.weight ? 14 : -6
  }

  if (q.sizes.size && p.sizes.size) {
    const overlap = [...q.sizes].some((s) => p.sizes.has(s))
    if (overlap) score += 10
    else if (p.sizes.has('l') && p.sizes.has('m') && (q.sizes.has('l') || q.sizes.has('m'))) score += 8
    else score -= 4
  }

  if (q.signals.has('pellet') && (p.signals.has('pellet') || p.signals.has('food'))) score += 4

  return score
}

const MIN_MATCH_SCORE = 10

export function findProductInList(products, query) {
  if (!query || !products?.length) return null
  let best = null
  let bestScore = 0
  for (const p of products) {
    const s = scoreProductMatch(query, p)
    if (s > bestScore) {
      bestScore = s
      best = p
    }
  }
  return bestScore >= MIN_MATCH_SCORE ? best : null
}

export function findProductCandidates(products, query, limit = 3) {
  if (!query || !products?.length) return []
  return [...products]
    .map((p) => ({ product: p, score: scoreProductMatch(query, p) }))
    .filter((x) => x.score >= MIN_MATCH_SCORE - 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.product)
}

export function formatProductCatalogEntry(product) {
  const stock = `${product.stock} ${product.unit || ''}`.trim()
  const bits = [`${product.name} S$${product.price} ×${stock}`]
  if (product.sku) bits.push(`sku:${product.sku}`)
  const desc = product.description?.trim()
  if (desc) bits.push(`desc:${desc.length > 100 ? `${desc.slice(0, 97)}…` : desc}`)
  return bits.join(' | ')
}

export function productMatchHint(query, product) {
  if (!product) return null
  const q = normalizeProductText(query)
  const name = normalizeProductText(product.name)
  if (name === q || name.includes(q) || q.includes(name)) return product.name
  return `${product.name}${product.description ? ` (${product.description.slice(0, 60)})` : ''}`
}
