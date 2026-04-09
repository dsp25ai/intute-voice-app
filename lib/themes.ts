/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Theme {
  name: string;
  colors: string[]; // [bg, surface, accent, text, documentBg]
}

export const themes: Theme[] = [
  {
    name: 'Dark Theme',
    colors: ['#1a1a2e', '#16213e', '#0f3460', '#e0e0e0', '#0d1117'],
  },
  {
    name: 'Light Theme',
    colors: ['#f5f5f5', '#ffffff', '#4a90d9', '#1a1a1a', '#ffffff'],
  },
  {
    name: 'Solarized',
    colors: ['#002b36', '#073642', '#268bd2', '#839496', '#00212b'],
  },
  {
    name: 'High Contrast',
    colors: ['#000000', '#1a1a1a', '#ffdd00', '#ffffff', '#000000'],
  },
];
