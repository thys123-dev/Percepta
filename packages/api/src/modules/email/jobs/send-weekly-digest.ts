/**
 * Weekly Digest Job
 *
 * BullMQ job processor. Runs Sunday 8:00 AM for each seller with
 * emailWeeklyDigest enabled. Generates and sends the weekly profit report.
 */

import type { Job } from 'bullmq';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../db/index.js';
import { emailDigestQueue } from '../../sync/queues.js';
import { generateWeeklyDigest } from '../digest-generator.js';
import { renderWeeklyDigestHtml, renderWeeklyDigestText } from '../templates/weekly-digest.js';
import { sendEmail } from '../email-service.js';
import { env } from '../../../config/env.js';

export interface WeeklyDigestJobData {
  sellerId: string;
}

export interface WeeklyDigestJobResult {
  sent: boolean;
  reason?: string;
}

export async function processSendWeeklyDigest(
  job: Job<WeeklyDigestJobData>
): Promise<WeeklyDigestJobResult> {
  const { sellerId } = job.data;

  // Fan-out dispatcher: queue one job per eligible seller
  if (sellerId === '__all__') {
    const sellers = await db
      .select({ id: schema.sellers.id })
      .from(schema.sellers)
      .where(eq(schema.sellers.initialSyncStatus, 'complete'));

    for (const seller of sellers) {
      const today = new Date().toISOString().split('T')[0]!;
      await emailDigestQueue.add(
        'weekly-digest',
        { sellerId: seller.id },
        { jobId: `weekly-digest-${seller.id}-${today}` }
      );
    }

    console.info(`[email-digest] Queued weekly digest for ${sellers.length} sellers`);
    return { sent: false, reason: 'dispatched_fan_out' };
  }

  // Fetch seller + prefs
  const [seller] = await db
    .select({
      id:                  schema.sellers.id,
      email:               schema.sellers.email,
      emailWeeklyDigest:   schema.sellers.emailWeeklyDigest,
      initialSyncStatus:   schema.sellers.initialSyncStatus,
    })
    .from(schema.sellers)
    .where(eq(schema.sellers.id, sellerId));

  if (!seller) return { sent: false, reason: 'seller_not_found' };
  if (!seller.emailWeeklyDigest) return { sent: false, reason: 'opted_out' };
  if (seller.initialSyncStatus !== 'complete') return { sent: false, reason: 'sync_not_complete' };

  const dashboardUrl = env.FRONTEND_URL;
  const unsubscribeUrl = `${dashboardUrl}/dashboard/notifications?disable=emailWeeklyDigest`;

  try {
    const data = await generateWeeklyDigest(sellerId, dashboardUrl, unsubscribeUrl);

    await sendEmail({
      to: data.sellerEmail,
      subject: `Your Weekly Profit Report — ${data.periodLabel}`,
      html: renderWeeklyDigestHtml(data),
      text: renderWeeklyDigestText(data),
    });

    // Record send time only after successful send
    await db
      .update(schema.sellers)
      .set({ lastWeeklyDigestAt: new Date() })
      .where(eq(schema.sellers.id, sellerId));

    return { sent: true };
  } catch (err) {
    console.error(`[email-digest] Failed for seller ${sellerId}: ${(err as Error).message}`);
    return { sent: false, reason: 'send_failed' };
  }
}
