/** Binds browser mutations to the two local principals rendered in that tab. */
export async function actorView(origin: string, staff: { userId: number; role: string; permissions?: unknown; mustChangePassword?: boolean } | null,
  member: { id: number } | null) {
  const secret=process.env.ADMIN_COOKIE_SECRET;
  if(!secret || secret.length<16)throw new Error("Sessão indisponível.");
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const data=JSON.stringify(["barbacue/view/v1",origin,staff?.userId,staff?.role,staff?.permissions,staff?.mustChangePassword,member?.id]);
  const mac=new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(data)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
