const BAR_HEIGHTS = [6, 12, 18, 10, 20, 14, 8, 16, 11, 19, 7, 13]

/**
 * Animated audio bars (static under prefers-reduced-motion). Decorative unless given a `label`,
 * e.g. as a loading indicator.
 */
export default function Waveform({ className, label }: { className?: string; label?: string }) {
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true }
  return (
    <svg className={`bds-wave ${className ?? ''}`} width="60" height="22" viewBox="0 0 60 22" {...a11y}>
      {BAR_HEIGHTS.map((height, i) => (
        <rect key={i} x={i * 5} y={(22 - height) / 2} width="3" height={height} fill="currentColor" style={{ '--i': i } as React.CSSProperties} />
      ))}
    </svg>
  )
}
