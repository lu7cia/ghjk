import type { Profile, AppState } from '../lib/types';
import { defaultCharacter, SKIN_TONES, HAIR_COLORS, FABRIC_COLORS } from '../character/rig';
import { defaultHabitat } from '../character/habitat';
import { uid } from '../lib/db';

/** Other inhabitants, so the feed is not an empty room on first run. */
function make(
  handle: string,
  displayName: string,
  age: string,
  location: string,
  status: string,
  bio: string,
  hobbies: string[],
  character: Partial<ReturnType<typeof defaultCharacter>>,
  habitat: Partial<ReturnType<typeof defaultHabitat>>,
): Profile {
  return {
    id: uid('u_'),
    handle,
    displayName,
    age,
    location,
    status,
    bio,
    hobbies,
    avatarAsset: null,
    character: { ...defaultCharacter(), ...character },
    habitat: { ...defaultHabitat(), ...habitat },
    favouriteTracks: [null, null, null],
    ownTracks: [],
    createdAt: Date.now() - Math.floor(Math.random() * 9e8),
  };
}

export function seedOthers(): Profile[] {
  return [
    make(
      'wound_response', 'ANEMONE', '22', 'sublevel 3',
      'the lights went out again and nobody came',
      'i keep a log of every noise the building makes. tape trades welcome. do not message me about the thing in the stairwell.',
      ['field recording', 'tape loops', 'urbex', 'insomnia'],
      {
        skinTone: SKIN_TONES[9], hairId: 4, hairColor: HAIR_COLORS[8],
        topId: 4, topColor: FABRIC_COLORS[6], bottomId: 2, bottomColor: FABRIC_COLORS[0],
        accessoryId: 6, accessoryColor: FABRIC_COLORS[3], faceId: 6, colorDepth: 4,
      },
      { presetId: 3, fogColor: '#2a0a12', lightColor: '#ff5a5a', label: 'SUBLEVEL 3 / PLANT ROOM' },
    ),
    make(
      'kbps', 'K/BPS', '19', 'orbital',
      'rendering. do not perceive me',
      'i make breakcore on a thinkpad. everything here is exported at 96kbps because that is how it is supposed to sound.',
      ['breakcore', 'demoscene', 'thrifting', 'modding'],
      {
        skinTone: SKIN_TONES[4], hairId: 6, hairColor: HAIR_COLORS[15],
        topId: 3, topColor: FABRIC_COLORS[17], bottomId: 2, bottomColor: FABRIC_COLORS[1],
        accessoryId: 2, accessoryColor: FABRIC_COLORS[2], faceId: 4, build: 0.3,
      },
      { presetId: 0, fogColor: '#101a2a', lightColor: '#9ad8ff', label: 'DEAD ORBIT / RELAY 12' },
    ),
    make(
      'greenhouse_effect', 'MOTH', '27', 'the greenhouse',
      'everything i grow is slightly wrong and i love them',
      'botanist. i photograph things that should not be flowering. the camera is a 2003 digital and i will not be upgrading it.',
      ['botany', 'macro photography', 'fermenting', 'birds'],
      {
        skinTone: SKIN_TONES[2], hairId: 2, hairColor: HAIR_COLORS[3],
        topId: 1, topColor: FABRIC_COLORS[14], bottomId: 3, bottomColor: FABRIC_COLORS[12],
        accessoryId: 1, accessoryColor: FABRIC_COLORS[13], faceId: 3, build: 0.55,
      },
      { presetId: 4, fogColor: '#0a1a12', lightColor: '#a8ffc4', label: 'GREENHOUSE / ROW 9' },
    ),
    make(
      'nulltape', 'NULLTAPE', '31', 'wet market',
      'buying: any tape labelled in handwriting',
      'i run a stall that sells things nobody made on purpose. mostly here for the trades.',
      ['tape trading', 'noise', 'cooking', 'archiving'],
      {
        skinTone: SKIN_TONES[6], hairId: 0, hairColor: HAIR_COLORS[0],
        topId: 5, topColor: FABRIC_COLORS[3], bottomId: 4, bottomColor: FABRIC_COLORS[2],
        accessoryId: 3, accessoryColor: FABRIC_COLORS[16], faceId: 5, build: 0.7, height: 0.7,
      },
      { presetId: 2, fogColor: '#1a0f24', lightColor: '#ffb0e8', label: 'WET MARKET / STALL 41' },
    ),
  ];
}

export function seedState(): AppState {
  const me: Profile = {
    id: uid('u_'),
    handle: 'new_user',
    displayName: 'UNNAMED',
    age: '',
    location: '',
    status: 'just got here',
    bio: '',
    hobbies: [],
    avatarAsset: null,
    character: defaultCharacter(),
    habitat: defaultHabitat(),
    favouriteTracks: [null, null, null],
    ownTracks: [],
    createdAt: Date.now(),
  };

  return { me, others: seedOthers(), posts: [] };
}
