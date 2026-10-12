// In-memory limiter: fine for one server. On Vercel (many instances) swap for Upstash Redis.
const hits=new Map();
export function limit(key,max,windowMs){
  const now=Date.now(),a=(hits.get(key)||[]).filter(t=>now-t<windowMs);
  if(a.length>=max){hits.set(key,a);return false}
  a.push(now);hits.set(key,a);
  if(hits.size>5000)for(const[k,v]of hits)if(!v.length||now-v[v.length-1]>windowMs)hits.delete(k);
  return true;
}
export const ipOf=r=>(r.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim();
