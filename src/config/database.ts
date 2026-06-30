import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Cart } from '../entities/Cart';
import { CartItem } from '../entities/CartItem';
import { Category } from '../entities/Category';
import { Friendship } from '../entities/Friendship';
import { Order } from '../entities/Order';
import { OrderItem } from '../entities/OrderItem';
import { Product } from '../entities/Product';
import { RefreshToken } from '../entities/RefreshToken';
import { SharedCart } from '../entities/SharedCart';
import { User } from '../entities/User';
import { VendorDocument } from '../entities/VendorDocument';
import { VendorOnboardingFee } from '../entities/VendorOnboardingFee';
import { VendorProfile } from '../entities/VendorProfile';
dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const databaseUrl = isTest
  ? process.env.DATABASE_URL_TEST
  : process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `${isTest ? 'DATABASE_URL_TEST' : 'DATABASE_URL'} is required`
  );
}

const entities = [
  Cart,
  CartItem,
  Category,
  Friendship,
  Order,
  OrderItem,
  Product,
  RefreshToken,
  SharedCart,
  User,
  VendorDocument,
  VendorOnboardingFee,
  VendorProfile,
];

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities,
  migrations: [__dirname + '/../migrations/*.{ts,js}'],
  // Keep local development convenient while tests use an isolated database.
  // Production must always use migrations.
  synchronize: isTest || process.env.NODE_ENV === 'development',
  logging: process.env.TYPEORM_LOGGING === 'true'
    ? ['query', 'error', 'schema', 'warn', 'info', 'log']
    : ['error', 'warn'],
});
