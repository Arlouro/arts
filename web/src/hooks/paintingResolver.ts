import type { Painting } from '../types/painting.ts';
import paintingsData from '../../public/assets/json/paintings.json';

export function resolvePainting(id: string | number, imageData?: string): Painting | null {
  const idStr = id.toString();

  if (idStr.startsWith('unknown')) {
    return {
      id: idStr,
      title: 'Desconhecido',
      artist: 'Desconhecido',
      year: 'Desconhecido',
      style: 'Desconhecido',
      genre: 'Desconhecido',
      medium: 'Desconhecido',
      description: 'Quadro não identificado na base de dados.',
      authors_intention: 'Desconhecido',
      context: 'Desconhecido',
      imagePath: '',
      imageData,
    };
  }

  const matched = paintingsData.paintings.find(p => String(p.$id) === String(id));
  if (!matched) return null;

  return {
    id: matched.$id,
    title: matched.title,
    artist: matched.artist,
    year: matched.year,
    style: matched.style,
    genre: matched.genre,
    medium: matched.medium,
    description: matched.description,
    authors_intention: matched.authors_intention,
    authors_intention_simulated:
      (matched as { authors_intention_simulated?: boolean }).authors_intention_simulated === true,
    context: matched.context,
    imagePath: matched.imagePath,
  };
}
