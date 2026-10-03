// Restrict this to your real app origin(s) in production.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function withCors(res: Response) {
  for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
  return res;
}

export function json(body: unknown, status = 200) {
  return withCors(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}
