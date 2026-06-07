/** Look up Singapore street address from a 6-digit postal code. */
export async function lookupSingaporePostalAddress(postalCode) {
  const code = String(postalCode || '').replace(/\D/g, '')
  if (code.length !== 6) return null

  try {
    const res = await fetch(`https://geocode.xyz/${code}?region=SG&json=1`)
    if (!res.ok) return null
    const data = await res.json()
    if (data?.error) return null

    const standard = data.standard || {}
    const address = standard.addresst
      || [standard.stnumber, standard.addresst || standard.city].filter(Boolean).join(' ').trim()

    if (!address) return null

    return { address, postalCode: code }
  } catch {
    return null
  }
}
