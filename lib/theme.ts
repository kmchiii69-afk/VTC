// VTC theme tokens — keyed to the "Waves" background (plum → rose → blush →
// cream). Content sits on translucent dark glass so text stays readable over
// both the bright cream and dark plum regions of the shader.

export const THEME = {
  // Base / shell
  bg: '#1A1423',            // plum — body background behind the shader
  // Text
  ink: '#FFF5EB',           // cream — primary text on dark glass
  inkDim: 'rgba(255,245,235,0.62)',
  inkFaint: 'rgba(255,245,235,0.38)',
  inkOnLight: '#1A1423',    // plum — text on a cream/blush surface
  // Accents
  accent: '#B75D69',        // rose — primary buttons, active states
  accentInk: '#FFF5EB',     // text on a rose button
  accentSoft: '#EACDC2',    // blush — secondary/hover, subtle highlights
  // Surfaces (glass)
  card: 'rgba(26,20,35,0.55)',
  cardHover: 'rgba(26,20,35,0.68)',
  border: 'rgba(234,205,194,0.18)',   // blush at low alpha
  borderStrong: 'rgba(234,205,194,0.34)',
  // Status
  ok: '#8FD19E',
  warn: '#EACDC2',
  danger: '#B75D69',
} as const;

export type Theme = typeof THEME;
