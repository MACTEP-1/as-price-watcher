/**
 * seats.aero attribution.
 *
 * This is a LICENSING REQUIREMENT, not decoration. seats.aero's terms
 * ("Usage of Data") state:
 *
 *   "All users of the APIs must reasonably and visibly attribute any
 *    reproduced data to seats.aero at the point which the data is searched
 *    and displayed. A link to the seats.aero website is required with the
 *    attribution."
 *
 * It applies regardless of commercial status, so it is required even though
 * this app generates no revenue. Two consequences for anyone editing this:
 *
 *   1. Every screen that renders a miles figure needs one of these. If you
 *      add a new surface showing award pricing, add the credit with it.
 *   2. "Reasonably and visibly" rules out hiding it — don't shrink it below
 *      readability, drop it to near-background contrast, or move it behind
 *      a toggle. The muted styling here is deliberately still legible
 *      against the #f8fafc page background.
 *
 * Rendered once per screen, positioned with the miles data rather than in a
 * global site footer, so it stays "at the point which the data is displayed".
 *
 * Shown unconditionally, including when miles come back null (no saver award
 * space, or SEATS_AERO_KEY unset). Attributing a source that returned nothing
 * is harmless; failing to attribute one that did is the breach.
 */

export default function SeatsAeroCredit({
  style,
}: {
  /** Spacing overrides for the surrounding layout. Not for hiding it. */
  style?: React.CSSProperties
}) {
  return (
    <p
      style={{
        margin: '12px 0 0',
        fontSize: 12,
        lineHeight: 1.5,
        color: '#64748b',
        textAlign: 'center',
        ...style,
      }}
    >
      Award availability and miles pricing via{' '}
      <a
        href="https://seats.aero"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          color: '#0060ac',
          fontWeight: 600,
          textDecoration: 'underline',
        }}
      >
        seats.aero
      </a>
    </p>
  )
}
