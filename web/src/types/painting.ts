export interface Painting {
  id: string | number;
  title: string;
  artist: string;
  year: string | number;
  style: string;
  genre: string;
  medium: string;
  description: string;
  authors_intention: string;
  context: string;
  imagePath: string;
  imageData?: string;
}