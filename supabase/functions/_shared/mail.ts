export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

interface ResendConfig {
  apiKey: string;
  from: string;
  replyTo: string | null;
}

function getResendConfig(): ResendConfig | null {
  const apiKey = Deno.env.get('RESEND_API_KEY')?.trim();
  const from = Deno.env.get('MAIL_FROM')?.trim() ?? Deno.env.get('SMTP_FROM')?.trim();

  if (!apiKey || !from) {
    return null;
  }

  return {
    apiKey,
    from,
    replyTo:
      Deno.env.get('MAIL_REPLY_TO')?.trim() ??
      Deno.env.get('SMTP_REPLY_TO')?.trim() ??
      null,
  };
}

export function isMailConfigured(): boolean {
  return getResendConfig() !== null;
}

export async function sendEmail(email: OutboundEmail): Promise<void> {
  const resendConfig = getResendConfig();

  if (!resendConfig) {
    console.warn('talk-review-email skipped: Resend is not configured');
    return;
  }

  const replyTo = email.replyTo ?? resendConfig.replyTo ?? undefined;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendConfig.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: resendConfig.from,
      to: [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`resend_send_failed:${response.status}:${errorBody}`);
  }
}
