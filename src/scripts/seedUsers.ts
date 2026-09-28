import { AppDataSource } from '../config/database';
import { User, UserRole } from '../entities/User';
import { VendorProfile, VendorStatus } from '../entities/VendorProfile';
import { hashPassword } from '../utils/hash';

const seedUsers = [
  {
    email: 'customer@gmail.com',
    firstName: 'Customer',
    lastName: 'User',
    role: UserRole.CUSTOMER,
  },
  {
    email: 'vendor@gmail.com',
    firstName: 'Vendor',
    lastName: 'User',
    role: UserRole.VENDOR,
    companyName: 'Seed Vendor Store',
  },
  {
    email: 'admin@gmail.com',
    firstName: 'Admin',
    lastName: 'User',
    role: UserRole.ADMIN,
  },
] as const;

async function seedRoleUsers(): Promise<void> {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password) {
    throw new Error(
      'SEED_USER_PASSWORD is required. Set it in the shell before running the seed command.',
    );
  }

  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const userRepository = queryRunner.manager.getRepository(User);
    const vendorRepository = queryRunner.manager.getRepository(VendorProfile);

    for (const definition of seedUsers) {
      const passwordHash = await hashPassword(password);
      let user = await userRepository.findOne({
        where: { email: definition.email },
      });

      if (!user) {
        user = userRepository.create({
          email: definition.email,
          passwordHash,
          firstName: definition.firstName,
          lastName: definition.lastName,
          role: definition.role,
          isActive: true,
        });
      } else {
        user.passwordHash = passwordHash;
        user.firstName = definition.firstName;
        user.lastName = definition.lastName;
        user.role = definition.role;
        user.isActive = true;
      }

      user = await userRepository.save(user);

      if (definition.role === UserRole.VENDOR) {
        const existingProfile = await vendorRepository.findOne({
          where: { user: { id: user.id } },
        });

        if (!existingProfile) {
          await vendorRepository.save(
            vendorRepository.create({
              user,
              companyName: definition.companyName,
              companyEstablishedDate: null,
              contactEmail: definition.email,
              country: 'US',
              status: VendorStatus.PENDING_PAYMENT,
            }),
          );
        }
      }

      console.log(`Seeded ${definition.role} user: ${definition.email}`);
    }

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await seedRoleUsers();
    console.log('Role user seeding completed successfully.');
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error('Role user seeding failed:', error);
  process.exitCode = 1;
});
