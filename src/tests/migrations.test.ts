import type { QueryRunner } from 'typeorm';
import { PhaseThreeEntities1775169155586 } from '../migrations/1775169155586-PhaseThreeEntities';

describe('migration history', () => {
  it('keeps the duplicate PhaseThreeEntities migration as a no-op', async () => {
    const query = jest.fn();
    const queryRunner = { query } as unknown as QueryRunner;
    const migration = new PhaseThreeEntities1775169155586();

    await migration.up(queryRunner);
    await migration.down(queryRunner);

    expect(query).not.toHaveBeenCalled();
  });
});
