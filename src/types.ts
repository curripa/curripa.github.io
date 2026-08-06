export interface Band {
  id: string;
  name: string;
  yearsActive: string;
  description: string;
  history: string;
  historyEn?: string;
  bandcampUrl: string;
  logoSvg: string;
  logoSvgNegro: string;
}

export interface Track {
  trackNum: number;
  title: string;
  trackId: number | null;
  duration: number | null;
  audioUrl: string | null;
}

export interface Album {
  albumId: string;
  title: string;
  year: number | null;
  coverArt: string | null;
  bandcampUrl: string;
  numericId?: number | null;
  tracks: Track[];
}
