import { describe, expect, it } from 'vitest';

import { getMatchDestination } from '../home.js';

describe('home match navigation', () => {
  it('routes analyzed matches to dashboard and unfinished matches to tagging', () => {
    expect(getMatchDestination({ id: 'match-1', status: 'analyzed' })).toEqual({
      route: 'dashboard',
      params: { matchId: 'match-1' },
    });
    expect(getMatchDestination({ id: 'match-2', status: 'created' })).toEqual({
      route: 'tagging',
      params: { matchId: 'match-2' },
    });
  });
});
