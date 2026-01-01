export interface ReaderThemeColors {
  background: string;
  text: string;
  textSecondary: string;
  accent: string;
  border: string;
  panel: string;
  panelBorder: string;
  wordHover: string;
  wordSelected: string;
  shadow: string;
}

export interface ReaderTheme {
  id: string;
  name: string;
  description: string;
  light: ReaderThemeColors;
  dark: ReaderThemeColors;
}

export const readerThemes: Record<string, ReaderTheme> = {
  sepiaClassic: {
    id: 'sepiaClassic',
    name: 'Sepia Classic',
    description: 'Traditional book reading feel',
    light: {
      background: '#F4F1EA',
      text: '#3E2723',
      textSecondary: '#5D4037',
      accent: '#8B4513',
      border: '#D7CCC8',
      panel: '#EFEBE9',
      panelBorder: '#BCAAA4',
      wordHover: '#E8DCC8',
      wordSelected: '#D7CCC8',
      shadow: 'rgba(62, 39, 35, 0.1)',
    },
    dark: {
      background: '#2A2520',
      text: '#C9BDAB',
      textSecondary: '#A89F8F',
      accent: '#D4AF37',
      border: '#3A352F',
      panel: '#342F2A',
      panelBorder: '#4A453F',
      wordHover: '#3A3530',
      wordSelected: '#4A4540',
      shadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
  darkComfort: {
    id: 'darkComfort',
    name: 'Dark Comfort',
    description: 'Eye-friendly night reading',
    light: {
      background: '#E8DCC8',
      text: '#3A2F25',
      textSecondary: '#5A4F45',
      accent: '#C9A961',
      border: '#D4C4B0',
      panel: '#F0E6D8',
      panelBorder: '#C4B4A0',
      wordHover: '#DDD1BD',
      wordSelected: '#D4C8B4',
      shadow: 'rgba(58, 47, 37, 0.1)',
    },
    dark: {
      background: '#1A1A1A',
      text: '#A67C52',  // Rich dark wood - golden with warm brown tones for smooth reading
      textSecondary: '#D5CBBA',
      accent: '#D4AF37',
      border: '#2C2C2C',
      panel: '#242424',
      panelBorder: '#3A3A3A',
      wordHover: '#2A2520',
      wordSelected: '#3A3530',
      shadow: 'rgba(0, 0, 0, 0.3)',
    },
  },
  trueBlack: {
    id: 'trueBlack',
    name: 'True Black',
    description: 'Minimal eye strain with pure black',
    light: {
      background: '#FFFFFF',
      text: '#1A1A1A',
      textSecondary: '#3A3A3A',
      accent: '#5A5A5A',
      border: '#E0E0E0',
      panel: '#F5F5F5',
      panelBorder: '#D0D0D0',
      wordHover: '#F0F0F0',
      wordSelected: '#E5E5E5',
      shadow: 'rgba(0, 0, 0, 0.1)',
    },
    dark: {
      background: '#000000',
      text: '#4A4A4A',
      textSecondary: '#5C5C5C',
      accent: '#2C2C2C',
      border: '#1A1A1A',
      panel: '#0A0A0A',
      panelBorder: '#1F1F1F',
      wordHover: '#1A1A1A',
      wordSelected: '#2A2A2A',
      shadow: 'rgba(0, 0, 0, 0.5)',
    },
  },
  oceanBlue: {
    id: 'oceanBlue',
    name: 'Ocean Blue',
    description: 'Calming blue ambiance',
    light: {
      background: '#E6F2FF',
      text: '#1E3A5F',
      textSecondary: '#2C4B73',
      accent: '#4A90E2',
      border: '#B8D4F1',
      panel: '#F0F7FF',
      panelBorder: '#A0C4E8',
      wordHover: '#D8EBFF',
      wordSelected: '#C8E1FF',
      shadow: 'rgba(30, 58, 95, 0.1)',
    },
    dark: {
      background: '#1E3A5F',
      text: '#E0E7EE',
      textSecondary: '#C5D5E4',
      accent: '#4A90E2',
      border: '#2C4B73',
      panel: '#25445D',
      panelBorder: '#3A5F8A',
      wordHover: '#2A4A6F',
      wordSelected: '#3A5A7F',
      shadow: 'rgba(30, 58, 95, 0.3)',
    },
  },
  forestGreen: {
    id: 'forestGreen',
    name: 'Forest Green',
    description: 'Natural, restful reading',
    light: {
      background: '#E8F5E3',
      text: '#1A2F23',
      textSecondary: '#2A4133',
      accent: '#5FAD56',
      border: '#C0D9BB',
      panel: '#F0F8ED',
      panelBorder: '#A8C9A3',
      wordHover: '#D8EDD3',
      wordSelected: '#C8E5C3',
      shadow: 'rgba(26, 47, 35, 0.1)',
    },
    dark: {
      background: '#1A2F23',
      text: '#D8E5D3',
      textSecondary: '#C0D4BB',
      accent: '#5FAD56',
      border: '#2A4133',
      panel: '#233B2D',
      panelBorder: '#3A5543',
      wordHover: '#2A3F33',
      wordSelected: '#3A4F43',
      shadow: 'rgba(26, 47, 35, 0.3)',
    },
  },
  purpleTwilight: {
    id: 'purpleTwilight',
    name: 'Purple Twilight',
    description: 'Creative, dreamy atmosphere',
    light: {
      background: '#F5EFFA',
      text: '#2D1B3D',
      textSecondary: '#3D2B4D',
      accent: '#9B7EBD',
      border: '#E0D5EA',
      panel: '#FAF5FF',
      panelBorder: '#D0C5E0',
      wordHover: '#EDE5F5',
      wordSelected: '#E0D5F0',
      shadow: 'rgba(45, 27, 61, 0.1)',
    },
    dark: {
      background: '#2D1B3D',
      text: '#E6D9F0',
      textSecondary: '#D4C5E0',
      accent: '#9B7EBD',
      border: '#3D2B4D',
      panel: '#362847',
      panelBorder: '#4D3B5D',
      wordHover: '#3D2B4D',
      wordSelected: '#4D3B5D',
      shadow: 'rgba(45, 27, 61, 0.3)',
    },
  },
};

export const defaultReaderTheme = 'darkComfort';
