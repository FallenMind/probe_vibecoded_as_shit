import type { BreachState } from '../../game/breachTypes';

export type BreachChallengeId = 1 | 2 | 3 | 4;
export interface BreachChallengeReward {
  id: BreachChallengeId;
  message: string;
  grant(state: BreachState): void;
}

/** Награды принадлежат испытаниям; завершение и визуальный переход остаются раздельными. */
export class BreachChallengeRewards {
  private readonly definitions = new Map<BreachChallengeId, BreachChallengeReward>();
  constructor(rewards: readonly BreachChallengeReward[]) {
    for (const reward of rewards) {
      if (this.definitions.has(reward.id)) throw new Error(`Повторная награда испытания: ${reward.id}`);
      this.definitions.set(reward.id, reward);
    }
  }
  complete(state: BreachState, id: BreachChallengeId): boolean {
    const reward = this.definitions.get(id);
    if (state.challengeWon || !reward) return false;
    state.challengeWon = true;
    state.challengeFailed = false;
    state.challengeRemaining = 0;
    reward.grant(state);
    state.message = reward.message;
    return true;
  }
}

export const BREACH_CHALLENGE_REWARDS: readonly BreachChallengeReward[] = [
  { id: 1, message: 'Challenge 1 пройден: открыт Воздух и уникальные улучшения.', grant: s => { s.challenge1Completed = true; } },
  { id: 2, message: 'Challenge 2 пройден.', grant: s => { s.challenge2Completed = true; } },
  { id: 3, message: 'Тепловой шифр разгадан: открыт Огонь.', grant: s => {
    s.challenge3Completed = true;
    s.alchemy.earthEnabled = true;
    s.alchemy.waterEnabled = true;
    s.alchemy.airProductionEnabled = true;
    s.alchemy.elementalizationEnabled = true;
  } },
  { id: 4, message: 'Теорема существования доказана. Награда: ???', grant: s => { s.challenge4Completed = true; } },
];
