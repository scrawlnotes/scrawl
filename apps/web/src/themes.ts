// The themes: each gives every colour of the interface, once for dark and once for light. The
// names are Scrawl's own; the colours of most come from open themes (MIT licensed) or products
// people know, as their note says. A theme without a light side stays dark in Light mode.

/** One colour of the interface: the `--sl-<name>` variable of styles.css it sets. */
export type ColourName =
  | 'bg'
  | 'side'
  | 'line'
  | 'fg'
  | 'dim'
  | 'faint'
  | 'accent'
  | 'sel'
  | 'match'
  | 'code'
  | 'hl-keyword'
  | 'hl-string'
  | 'hl-number'
  | 'hl-function'
  | 'hl-type'
  | 'hl-property'
  | 'kind-active'
  | 'kind-done'
  | 'kind-dropped'
  | 'p1'
  | 'p2'
  | 'p3';

export type Palette = Record<ColourName, string>;

/** Light or dark: what is on screen, as against the mode chosen. */
export type Shade = 'light' | 'dark';

export interface Theme {
  id: string;
  name: string;
  dark: Palette;
  light?: Palette;
}

export const THEMES: Theme[] = [
  {
    id: 'scrawl',
    name: 'Scrawl',
    dark: {
      bg: '#1e2229', side: '#181b21', line: '#2b303a', fg: '#d5d9e0', dim: '#8b93a1', faint: '#5a6270',
      accent: '#e0a84a', sel: '#34435a', match: '#3d4350', code: '#171a1f',
      'hl-keyword': '#d08ae0', 'hl-string': '#9ece8a', 'hl-number': '#f0a070', 'hl-function': '#7ab0f5', 'hl-type': '#5ccfc0', 'hl-property': '#b8c4d9',
      'kind-active': '#6aa5f0', 'kind-done': '#5cb87a', 'kind-dropped': '#f0706a', p1: '#f0706a', p2: '#f0a54a', p3: '#6aa5f0',
    },
    light: {
      bg: '#fbfbfc', side: '#eff0f3', line: '#d9dce3', fg: '#22262e', dim: '#5f6775', faint: '#9aa1ad',
      accent: '#a8690c', sel: '#d6e3f6', match: '#e4e7ee', code: '#eceef2',
      'hl-keyword': '#8a3fb0', 'hl-string': '#3d7a2a', 'hl-number': '#b0531a', 'hl-function': '#2360b8', 'hl-type': '#0f7a70', 'hl-property': '#3d4656',
      'kind-active': '#2f6fc4', 'kind-done': '#2e8a55', 'kind-dropped': '#c9342c', p1: '#c9342c', p2: '#b86a0a', p3: '#2f6fc4',
    },
  },
  // After VS Code's Dark Modern and Light Modern.
  {
    id: 'harbor',
    name: 'Harbor',
    dark: {
      bg: '#1f1f1f', side: '#181818', line: '#2b2b2b', fg: '#cccccc', dim: '#9d9d9d', faint: '#6e7681',
      accent: '#4daafc', sel: '#264f78', match: '#3a3d41', code: '#181818',
      'hl-keyword': '#c586c0', 'hl-string': '#ce9178', 'hl-number': '#b5cea8', 'hl-function': '#dcdcaa', 'hl-type': '#4ec9b0', 'hl-property': '#9cdcfe',
      'kind-active': '#3794ff', 'kind-done': '#89d185', 'kind-dropped': '#f48771', p1: '#f14c4c', p2: '#cca700', p3: '#3794ff',
    },
    light: {
      bg: '#ffffff', side: '#f8f8f8', line: '#e5e5e5', fg: '#3b3b3b', dim: '#616161', faint: '#8b8b8b',
      accent: '#005fb8', sel: '#add6ff', match: '#e8e8e8', code: '#f3f3f3',
      'hl-keyword': '#af00db', 'hl-string': '#a31515', 'hl-number': '#098658', 'hl-function': '#795e26', 'hl-type': '#267f99', 'hl-property': '#001080',
      'kind-active': '#005fb8', 'kind-done': '#388a34', 'kind-dropped': '#e51400', p1: '#e51400', p2: '#bf8803', p3: '#005fb8',
    },
  },
  // After Claude: warm paper and ink, a terracotta accent.
  {
    id: 'clay',
    name: 'Clay',
    dark: {
      bg: '#262624', side: '#1f1e1d', line: '#3a3936', fg: '#f0eee6', dim: '#b7b5a9', faint: '#85837b',
      accent: '#d97757', sel: '#4a3b33', match: '#3d3b37', code: '#1f1e1d',
      'hl-keyword': '#c992d2', 'hl-string': '#a8c686', 'hl-number': '#e9a26b', 'hl-function': '#8ab4e8', 'hl-type': '#79c2b0', 'hl-property': '#d4cdbf',
      'kind-active': '#8ab4e8', 'kind-done': '#8fbf7a', 'kind-dropped': '#e07a6a', p1: '#e07a6a', p2: '#e5a54b', p3: '#8ab4e8',
    },
    light: {
      bg: '#faf9f5', side: '#f0eee6', line: '#e0ddd2', fg: '#2d2a24', dim: '#6b6658', faint: '#a39e8f',
      accent: '#b9553a', sel: '#f2dccf', match: '#ebe7dc', code: '#f0eee6',
      'hl-keyword': '#9c4f96', 'hl-string': '#4c7a32', 'hl-number': '#b5562a', 'hl-function': '#2f63a8', 'hl-type': '#2a7a6d', 'hl-property': '#4a4538',
      'kind-active': '#2f63a8', 'kind-done': '#3e7f3a', 'kind-dropped': '#b8432f', p1: '#b8432f', p2: '#b26a12', p3: '#2f63a8',
    },
  },
  // After GitHub's themes (MIT).
  {
    id: 'paper',
    name: 'Paper',
    dark: {
      bg: '#0d1117', side: '#010409', line: '#30363d', fg: '#e6edf3', dim: '#8d96a0', faint: '#6e7681',
      accent: '#4493f8', sel: '#1c2d41', match: '#21262d', code: '#161b22',
      'hl-keyword': '#ff7b72', 'hl-string': '#a5d6ff', 'hl-number': '#79c0ff', 'hl-function': '#d2a8ff', 'hl-type': '#ffa657', 'hl-property': '#7ee787',
      'kind-active': '#4493f8', 'kind-done': '#3fb950', 'kind-dropped': '#f85149', p1: '#f85149', p2: '#d29922', p3: '#4493f8',
    },
    light: {
      bg: '#ffffff', side: '#f6f8fa', line: '#d1d9e0', fg: '#1f2328', dim: '#59636e', faint: '#8c959f',
      accent: '#0969da', sel: '#ddf4ff', match: '#eff2f5', code: '#f6f8fa',
      'hl-keyword': '#cf222e', 'hl-string': '#0a3069', 'hl-number': '#0550ae', 'hl-function': '#8250df', 'hl-type': '#953800', 'hl-property': '#116329',
      'kind-active': '#0969da', 'kind-done': '#1a7f37', 'kind-dropped': '#d1242f', p1: '#d1242f', p2: '#9a6700', p3: '#0969da',
    },
  },
  // After Solarized (MIT).
  {
    id: 'sand',
    name: 'Sand',
    dark: {
      bg: '#002b36', side: '#00252f', line: '#0a3d4a', fg: '#93a1a1', dim: '#7c8f92', faint: '#586e75',
      accent: '#268bd2', sel: '#0b4a5a', match: '#073642', code: '#00212b',
      'hl-keyword': '#859900', 'hl-string': '#2aa198', 'hl-number': '#d33682', 'hl-function': '#268bd2', 'hl-type': '#b58900', 'hl-property': '#6c71c4',
      'kind-active': '#268bd2', 'kind-done': '#859900', 'kind-dropped': '#dc322f', p1: '#dc322f', p2: '#b58900', p3: '#268bd2',
    },
    light: {
      bg: '#fdf6e3', side: '#eee8d5', line: '#ddd6c1', fg: '#586e75', dim: '#6f8287', faint: '#93a1a1',
      accent: '#1e74b3', sel: '#e3dcc5', match: '#efe8d4', code: '#eee8d5',
      'hl-keyword': '#859900', 'hl-string': '#2aa198', 'hl-number': '#d33682', 'hl-function': '#268bd2', 'hl-type': '#b58900', 'hl-property': '#6c71c4',
      'kind-active': '#268bd2', 'kind-done': '#859900', 'kind-dropped': '#dc322f', p1: '#dc322f', p2: '#b58900', p3: '#268bd2',
    },
  },
  // After Catppuccin Mocha and Latte (MIT).
  {
    id: 'pastel',
    name: 'Pastel',
    dark: {
      bg: '#1e1e2e', side: '#181825', line: '#313244', fg: '#cdd6f4', dim: '#a6adc8', faint: '#6c7086',
      accent: '#cba6f7', sel: '#45475a', match: '#3a3b50', code: '#181825',
      'hl-keyword': '#cba6f7', 'hl-string': '#a6e3a1', 'hl-number': '#fab387', 'hl-function': '#89b4fa', 'hl-type': '#f9e2af', 'hl-property': '#b4befe',
      'kind-active': '#89b4fa', 'kind-done': '#a6e3a1', 'kind-dropped': '#f38ba8', p1: '#f38ba8', p2: '#fab387', p3: '#89b4fa',
    },
    light: {
      bg: '#eff1f5', side: '#e6e9ef', line: '#ccd0da', fg: '#4c4f69', dim: '#6c6f85', faint: '#9ca0b0',
      accent: '#8839ef', sel: '#dcd6f7', match: '#e2e5ec', code: '#e6e9ef',
      'hl-keyword': '#8839ef', 'hl-string': '#40a02b', 'hl-number': '#fe640b', 'hl-function': '#1e66f5', 'hl-type': '#df8e1d', 'hl-property': '#7287fd',
      'kind-active': '#1e66f5', 'kind-done': '#40a02b', 'kind-dropped': '#d20f39', p1: '#d20f39', p2: '#fe640b', p3: '#1e66f5',
    },
  },
  // After Tokyo Night and its Day (MIT).
  {
    id: 'midnight',
    name: 'Midnight',
    dark: {
      bg: '#1a1b26', side: '#16161e', line: '#292e42', fg: '#c0caf5', dim: '#a9b1d6', faint: '#565f89',
      accent: '#7aa2f7', sel: '#283457', match: '#2a2f45', code: '#16161e',
      'hl-keyword': '#bb9af7', 'hl-string': '#9ece6a', 'hl-number': '#ff9e64', 'hl-function': '#7aa2f7', 'hl-type': '#73daca', 'hl-property': '#7dcfff',
      'kind-active': '#7aa2f7', 'kind-done': '#9ece6a', 'kind-dropped': '#f7768e', p1: '#f7768e', p2: '#e0af68', p3: '#7aa2f7',
    },
    light: {
      bg: '#e1e2e7', side: '#d0d5e3', line: '#c4c8da', fg: '#3760bf', dim: '#6172b0', faint: '#848cb5',
      accent: '#1f5fbf', sel: '#b7c1e3', match: '#d5d8e4', code: '#d0d5e3',
      'hl-keyword': '#9854f1', 'hl-string': '#587539', 'hl-number': '#b15c00', 'hl-function': '#2e7de9', 'hl-type': '#118c74', 'hl-property': '#007197',
      'kind-active': '#2e7de9', 'kind-done': '#587539', 'kind-dropped': '#f52a65', p1: '#f52a65', p2: '#b15c00', p3: '#2e7de9',
    },
  },
  // After Nord (MIT); dark only.
  {
    id: 'frost',
    name: 'Frost',
    dark: {
      bg: '#2e3440', side: '#292e39', line: '#3b4252', fg: '#d8dee9', dim: '#a7b1c2', faint: '#616e88',
      accent: '#88c0d0', sel: '#434c5e', match: '#404859', code: '#292e39',
      'hl-keyword': '#81a1c1', 'hl-string': '#a3be8c', 'hl-number': '#b48ead', 'hl-function': '#88c0d0', 'hl-type': '#8fbcbb', 'hl-property': '#d8dee9',
      'kind-active': '#81a1c1', 'kind-done': '#a3be8c', 'kind-dropped': '#bf616a', p1: '#bf616a', p2: '#d08770', p3: '#81a1c1',
    },
  },
];

export const themeById = (id: string): Theme => THEMES.find((theme) => theme.id === id) ?? THEMES[0]!;

/** The shade a theme shows when `shade` is asked for: a theme without a light side stays dark. */
export const shadeOf = (theme: Theme, shade: Shade): Shade => (shade === 'light' && theme.light ? 'light' : 'dark');

export const paletteOf = (theme: Theme, shade: Shade): Palette => (shadeOf(theme, shade) === 'light' ? theme.light! : theme.dark);
