import type { StateAccess } from './contracts';
import type { CharacterState } from './model';

export function addCharacter(bus: StateAccess, character: CharacterState, maxCount: number, primary = false): boolean {
  const state = bus.read();
  if (!character.id || state.characters[character.id] || Object.keys(state.characters).length >= maxCount) return false;
  if (primary && state.primaryCharacterId !== null) return false;
  bus.update(next => {
    next.characters[character.id] = structuredClone(character);
    if (primary || next.primaryCharacterId === null) next.primaryCharacterId = character.id;
  });
  return true;
}
