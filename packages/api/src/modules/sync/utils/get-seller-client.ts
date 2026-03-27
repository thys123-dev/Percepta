/**
 * Utility: decrypt a seller's API key and return a ready TakealotClient.
 * Used by all sync jobs so they don't need to handle decryption themselves.
 */

import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { decrypt } from '../../../config/encryption.js';
import { env } from '../../../config/env.js';
import { TakealotClient } from '../../takealot-client/index.js';
import { DEMO_API_KEY } from '../../../db/seeds/demo-data.js';

export class SellerApiKeyError extends Error {
  constructor(sellerId: string, reason: string) {
    super(`Cannot get API client for seller ${sellerId}: ${reason}`);
    this.name = 'SellerApiKeyError';
  }
}

export async function getSellerClient(sellerId: string): Promise<TakealotClient> {
  const [seller] = await db
    .select({
      apiKeyEnc: schema.sellers.apiKeyEnc,
      apiKeyValid: schema.sellers.apiKeyValid,
    })
    .from(schema.sellers)
    .where(eq(schema.sellers.id, sellerId))
    .limit(1);

  if (!seller) {
    throw new SellerApiKeyError(sellerId, 'seller not found');
  }
  if (!seller.apiKeyEnc) {
    throw new SellerApiKeyError(sellerId, 'no API key stored');
  }
  if (!seller.apiKeyValid) {
    throw new SellerApiKeyError(sellerId, 'API key marked as invalid');
  }

  const apiKey = decrypt(seller.apiKeyEnc);

  // In demo mode, return the mock client instead of hitting the real Takealot API
  if (env.DEMO_MODE && apiKey === DEMO_API_KEY) {
    const { MockTakealotClient } = await import('../../takealot-client/mock-client.js');
    return new MockTakealotClient() as unknown as TakealotClient;
  }

  return new TakealotClient(apiKey);
}
