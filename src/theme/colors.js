// Credit Stamina Brand Colors — exact match to app.creditstamina.com CSS variables

export const COLORS = {
  // Primary Brand
  staminaBlue:  '#1E40AF',
  powerPurple:  '#7C3AED',
  primary:      '#1E40AF',
  purple:       '#7C3AED',

  // Status / Semantic
  growthGreen:  '#059669',
  success:      '#10B981',   // brighter green for badges/icons
  successDark:  '#059669',
  alertAmber:   '#D97706',
  warning:      '#F59E0B',
  errorRed:     '#DC2626',
  danger:       '#EF4444',
  dangerDark:   '#DC2626',

  // Backgrounds
  background:   '#0F172A',   // app dark (was #0f172a — same)
  card:         '#1E293B',   // card dark (PWA uses #1E293B, not #111827)
  surface:      '#0D1229',   // darkest surface
  darkCharcoal: '#111827',   // kept for compatibility

  // Text
  text:          '#F1F5F9',  // PWA primary text
  textSecondary: '#64748B',  // PWA muted text
  mediumGray:    '#6B7280',

  // UI
  border:  'rgba(255,255,255,0.07)',  // PWA subtle border
  borderSolid: '#1E293B',

  // Score gauge arc colors (matches PWA exactly)
  scoreVeryPoor:  '#DC2626',
  scorePoor:      '#EF4444',
  scoreFair:      '#F59E0B',
  scoreGood:      '#84CC16',
  scoreVeryGood:  '#10B981',
  scoreExcept:    '#059669',

  // Lane Colors
  damage:    '#DC2626',
  removable: '#F97316',
  monitor:   '#059669',
  high:      '#DC2626',
  medium:    '#F97316',
  low:       '#059669',
};

export default COLORS;
