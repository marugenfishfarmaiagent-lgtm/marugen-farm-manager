export default function SkeletonRow({ cols = 4 }) {
  return (
    <tr>
      {Array(cols).fill(0).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-700 rounded animate-pulse" />
        </td>
      ))}
    </tr>
  )
}
