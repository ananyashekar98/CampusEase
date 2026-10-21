
 // Central design tokens so every screen stays visually consistent.
 // Each role gets its own accent color to make it instantly clear which
 // dashboard you're in (Student / Faculty / Admin).
 //
 // colors is exported for any code that hasn't migrated to the theme hook
 // yet, and defaults to the light palette. Screens that support dark mode
 // pull their palette from useTheme() (see context/ThemeContext.js) instead.

export const lightColors = {
  background: '#F4F6FB',
  surface: '#FFFFFF',
  border: '#E4E8F1',
  textPrimary: '#1B1F2E',
  textSecondary: '#6B7280',
  textOnDark: '#FFFFFF',
  danger: '#E1523D',
  success: '#22A06B',

  // Brand
  primary: '#4F5DFF',
  primaryDark: '#3B46D6',

  // Role accents — all GAT navy now, matching the login page branding
  student: '#251973',
  faculty: '#251973',
  admin: '#251973',

  // Card icon backgrounds (soft tints)
  tint1: '#EEF0FF',
  tint2: '#E7F8F4',
  tint3: '#FDF0E3',
  tint4: '#FCEAEA',
  tint5: '#F3EEFF',
};

export const darkColors = {
  background: '#0F1117',
  surface: '#1A1D29',
  border: '#2A2F42',
  textPrimary: '#F4F6FB',
  textSecondary: '#9AA3B8',
  textOnDark: '#FFFFFF',
  danger: '#FF6B5B',
  success: '#3FCB8C',

  // Brand
  primary: '#6672FF',
  primaryDark: '#4F5DFF',

  // Role accents — all GAT navy now, matching the login page branding
  student: '#251973',
  faculty: '#251973',
  admin: '#251973',

  // Card icon backgrounds (muted dark tints — still read as tinted, not flat)
  tint1: '#242A47',
  tint2: '#1B3B36',
  tint3: '#3A2E1C',
  tint4: '#3A2424',
  tint5: '#2E2647',
};

// GAT (Global Academy of Technology) brand colors — fixed, not theme-aware.
// navy is sampled DIRECTLY from the actual GAT logo file (the dominant
// indigo-blue in the globe/emblem artwork, #251973) — not an approximation,
// the real pixel value — so the login hero and dashboard top bar always
// match the logo exactly instead of reading as a generic charcoal or blue.
export const gatColors = {
  navy: '#251973',
  navyDeep: '#18104B',
  gold: '#F2C230',
  goldDark: '#D9A720',
  white: '#FFFFFF',
};

// Backward-compatible static default (light) — used only by files not yet
// converted to useTheme().
export const colors = lightColors;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 26, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
};

export const lightShadow = {
  shadowColor: '#1B1F2E',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
  elevation: 3,
};

export const darkShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 12,
  elevation: 3,
};

// Backward-compatible static default (light).
export const shadow = lightShadow;