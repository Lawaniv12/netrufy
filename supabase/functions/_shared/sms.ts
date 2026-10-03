// Termii generic SMS. Swap the endpoint/channel if you move to WhatsApp OTP.
export async function sendSms(to: string, sms: string) {
  const apiKey = Deno.env.get('TERMII_API_KEY');
  const senderId = Deno.env.get('TERMII_SENDER_ID');
  const res = await fetch('https://api.ng.termii.com/api/sms/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, to, from: senderId, sms, type: 'plain', channel: 'generic' }),
  });
  if (!res.ok) throw new Error(`SMS provider error ${res.status}`);
}
