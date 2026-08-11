// Lightweight Slack notifier for VTC — mirrors the Discord outbound webhook.
// Posts to SLACK_WEBHOOK_URL (an Incoming Webhook). If the env var isn't set
// yet, this is a no-op so the app keeps working before Slack is wired up.

export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    /* notifications are best-effort — never fail the request over Slack */
  }
}
