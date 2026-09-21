// Each palette defines the paper/background color, an ink (dark
// neutral, currently unused but reserved for outline/line-work later)
// and a set of accent colors shapes are drawn from.
export const palettes = {
  'Proun — classic': {
    paper: '#e9e4d8',
    ink: '#201d18',
    accents: ['#c1362b', '#8f8a7c', '#3a3a38', '#b7bcb9', '#d8d3c4']
  },
  'Proun — warm ochre': {
    paper: '#e7dcb8',
    ink: '#241f16',
    accents: ['#a8321f', '#7c7365', '#e3e0d4', '#33302a', '#c98f3b']
  },
  'Proun — cool grey': {
    paper: '#e3e6e4',
    ink: '#14181c',
    accents: ['#405266', '#8b93a0', '#c7cdd1', '#20242a', '#9c3428']
  }
};

export const DEFAULT_PALETTE = 'Proun — classic';
