export async function gatewayMatches(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || expected.length < 32 || actual.length > 512) return false;
  const bytes = new TextEncoder();
  const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',bytes.encode(actual)),crypto.subtle.digest('SHA-256',bytes.encode(expected))]);
  const x=new Uint8Array(a),y=new Uint8Array(b);let difference=0;
  for(let i=0;i<x.length;i++)difference|=x[i]^y[i];
  return difference===0;
}

