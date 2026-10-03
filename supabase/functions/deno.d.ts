declare namespace Deno {
  function serve(handler: (request: Request) => Response | Promise<Response>): void;

  namespace env {
    function get(name: string): string | undefined;
  }
}

declare module 'jsr:@supabase/supabase-js@2' {
  export function createClient(...args: any[]): any;
}