/** Share of the context window from which the meter warns. */
export const WARNING_RATIO = 0.75;

/** Share of the context window from which the meter signals danger. */
export const CRITICAL_RATIO = 0.9;

/** Radius of the ring, in the 24-unit square the ring is drawn in. */
export const RING_RADIUS = 10;

/** Length of the ring's outline, which the filled arc is a share of. */
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
