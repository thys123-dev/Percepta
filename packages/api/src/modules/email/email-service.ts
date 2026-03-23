/**
 * Email Service — Resend integration
 *
 * Thin wrapper around the Resend SDK. All email sending goes through here
 * so the API key and from-address are configured in one place.
 *
 * If RESEND_API_KEY is not set (local dev without credentials), emails are
 * logged to console instead of sent.
 */

import { Resend } from 'resend';
import { env } from '../../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!resend) {
    console.info(`[email] (no RESEND_API_KEY) Would send to ${params.to}: "${params.subject}"`);
    return;
  }

  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }
}
