// Bahari — canonical health-status colors (Dovetail functional data colors).
// Single source of truth so both UI and pure logic (map, charts) agree.

export const HEALTH_COLORS = {
  natural: '#3ecf8e',
  good: '#3ecf8e',
  fair: '#f5c451',
  poor: '#ff9d5c',
  very_poor: '#ff6b6b',
};

export const NEUTRAL = '#a7a7a7';

/** Color for an ecological class key, neutral if unknown/absent. */
export function healthColorForClass(classKey) {
  return HEALTH_COLORS[classKey] || NEUTRAL;
}
