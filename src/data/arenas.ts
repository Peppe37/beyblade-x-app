import { Arena } from '../types';

export const ARENAS: Arena[] = [
  {
    id: 'xtreme',
    name: 'Xtreme Stadium',
    description: 'L\'arena standard ufficiale per il gioco competitivo Beyblade X. Presenta il sistema di binari Xtreme Line che attiva gli scatti X-Dash, una zona Xtreme centrale e due Over Zone laterali.',
    maxPlayers: 2,
    hasXtremeLine: true,
    tags: ['Ufficiale', 'Standard', '1v1', '3v3', 'Deck'],
    color: '#00d4ff',
  },
  {
    id: 'wide-xtreme',
    name: 'Wide Xtreme Stadium',
    description: 'Una versione allargata dell\'Xtreme Stadium, progettata per sfide 3v3. L\'arena più ampia offre più spazio per le interazioni multi-Bey e percorsi X-Dash estesi.',
    maxPlayers: 2,
    hasXtremeLine: true,
    tags: ['Ufficiale', 'Wide', '3v3', 'Deck'],
    color: '#7c3aed',
  },
  {
    id: 'drop-attack',
    name: 'Drop Attack Stadium',
    description: 'Un\'arena speciale con zone di caduta e angolazioni ripide per attacchi dall\'alto verso il basso. Perfetta per massimizzare gli attacchi pesanti in picchiata.',
    maxPlayers: 2,
    hasXtremeLine: true,
    tags: ['Speciale', 'Drop Zone', 'Attacco Verticale'],
    color: '#ff3366',
  },
];
