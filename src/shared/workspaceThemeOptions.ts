export const WORKSPACE_THEME_IDS = ['system', 'light', 'dark']

export const WORKSPACE_THEME_OPTIONS = [
  {
    id: 'system',
    label: 'System',
    description: 'Follow your device appearance automatically.',
    colors: {
      bgPrimary: 'linear-gradient(135deg, #1c1c1e 0%, #1c1c1e 48%, #ffffff 52%, #ffffff 100%)',
      bgSecondary: 'linear-gradient(135deg, #23211f 0%, #23211f 48%, #f6f2eb 52%, #f6f2eb 100%)',
      fgMuted: '#8e8e93',
      accent: '#111111',
      accentSecondary: '#7d756a',
      success: '#6d8c69',
      error: '#b76b5c',
    },
  },
  {
    id: 'light',
    label: 'Light',
    description: 'Bright canvas for daylight drafting.',
    colors: {
      bgPrimary: '#ffffff',
      bgSecondary: '#f2ede5',
      fgMuted: '#999999',
      accent: '#111111',
      accentSecondary: '#7b756c',
      success: '#5f8160',
      error: '#b76354',
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Low-glare canvas for focused writing.',
    colors: {
      bgPrimary: '#141311',
      bgSecondary: '#1b1917',
      fgMuted: '#8e8e93',
      accent: '#f4f4f2',
      accentSecondary: '#a79d92',
      success: '#8aa57d',
      error: '#d68a77',
    },
  },
]
