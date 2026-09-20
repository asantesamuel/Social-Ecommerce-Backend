import { MigrationInterface, QueryRunner } from "typeorm";

export class PhaseThreeEntities1775169155586 implements MigrationInterface {
    name = 'PhaseThreeEntities1775169155586'

    /**
     * This migration was accidentally committed with the same schema changes
     * as MigrateVendorFeeToPaystack1775165017154. Keep its identity in the
     * migration history, but do not execute those changes a second time.
     */
    public async up(_queryRunner: QueryRunner): Promise<void> {
        return;
    }

    public async down(_queryRunner: QueryRunner): Promise<void> {
        return;
    }

}
