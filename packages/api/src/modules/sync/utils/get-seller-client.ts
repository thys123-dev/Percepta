/**
 * Utility: decrypt a seller's API key and return a ready TakealotClient.
 * Used by all sync jobs so they don't need to handle decryption themselves.
 */

import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { decrypt } from '../../../config/encryption.js';
import { TakealotClient } from '../../takealot-client/index.js';

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
  return new TakealotClient(apiKey);
}
