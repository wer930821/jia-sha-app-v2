const CACHE_TTL_MS = 20 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 30;
const cache = globalThis.__jiaShaCache ?? new Map();
const rateBuckets = globalThis.__jiaShaRateBuckets ?? new Map();
globalThis.__jiaShaCache = cache;
globalThis.__jiaShaRateBuckets = rateBuckets;

function sendJson(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.end(JSON.stringify(body));
}
function getIp(req) { return String(req.headers['x-forwarded-for'] ?? req.socket?.remoteAddress ?? 'unknown').split(',')[0].trim(); }
function isAllowed(req) {
  const now = Date.now(), key = getIp(req), bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > RATE_WINDOW_MS) { rateBuckets.set(key, { startedAt: now, count: 1 }); return true; }
  bucket.count += 1; return bucket.count <= RATE_LIMIT;
}
function validNumber(value, min, max) { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function getAddress(t = {}) { return t['addr:full'] || [t['addr:city'],t['addr:district'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join('') || t['addr:place'] || '附近店家'; }
function getPrimaryType(t = {}) {
  if (t.shop === 'bakery') return 'bakery';
  if (t.shop === 'confectionery') return 'confectionery';
  if (t.amenity === 'cafe') return 'cafe';
  if (t.amenity === 'fast_food') return 'fast_food_restaurant';
  if (t.amenity === 'ice_cream') return 'ice_cream_shop';
  if (t.amenity === 'food_court') return 'food_court';
  return 'restaurant';
}
async function requestOverpass(endpoint, query) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',Accept:'application/json'}, body:new URLSearchParams({data:query}), signal:controller.signal });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const data = await response.json(); if (!Array.isArray(data?.elements)) throw new Error('Overpass response is invalid'); return data;
  } finally { clearTimeout(timer); }
}
async function fetchOverpass(query) {
  const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
  try { return await Promise.any(endpoints.map(e => requestOverpass(e, query))); }
  catch (error) { throw new Error('No Overpass endpoint available', {cause:error}); }
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'GET') return sendJson(res,405,{error:'只接受 GET 請求。'});
    if (!isAllowed(req)) return sendJson(res,429,{error:'搜尋太頻繁，請稍後再試。'});
    const lat=validNumber(req.query?.lat,-90,90), lng=validNumber(req.query?.lng,-180,180);
    const radius=Math.min(20000,Math.max(300,Number(req.query?.radius)||2000));
    const category=String(req.query?.category||'全部');
    if (lat===null||lng===null) return sendJson(res,400,{error:'定位座標不正確。'});
    const cacheKey=`${lat.toFixed(3)}:${lng.toFixed(3)}:${Math.round(radius/500)*500}:${category}:v11`;
    const cached=cache.get(cacheKey); if(cached&&Date.now()-cached.savedAt<CACHE_TTL_MS) return sendJson(res,200,cached.payload);

    const breakfastPattern='早餐|早午餐|晨間|早安|美而美|美芝城|弘爺|拉亞|麥味登|Q[ _-]?Burger|漢堡大師|豆漿|蛋餅|飯糰|燒餅|油條|吐司|饅頭|蔥抓餅|三明治|brunch|breakfast';
    let query;
    if(category==='早餐') {
      query=`[out:json][timeout:9];(
        nwr["amenity"~"^(restaurant|cafe|fast_food)$"]["name"~"${breakfastPattern}",i](around:${radius},${lat},${lng});
        nwr["amenity"~"^(restaurant|cafe|fast_food)$"]["cuisine"~"(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)",i](around:${radius},${lat},${lng});
        nwr["shop"="bakery"](around:${radius},${lat},${lng});
        nwr["amenity"~"^(cafe|fast_food)$"](around:${radius},${lat},${lng});
      );out center tags 800;`;
    } else {
      query=`[out:json][timeout:9];(
        nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"](around:${radius},${lat},${lng});
        nwr["shop"~"^(bakery|confectionery|deli)$"](around:${radius},${lat},${lng});
      );out center tags 700;`;
    }

    const data=await fetchOverpass(query); const unique=new Map();
    for(const element of data.elements){
      const tags=element.tags??{}, placeLat=element.lat??element.center?.lat, placeLng=element.lon??element.center?.lon;
      const name=tags['name:zh']||tags.name||tags.brand||''; if(!name||!Number.isFinite(placeLat)||!Number.isFinite(placeLng)) continue;
      const id=`osm-${element.type}-${element.id}`; if(unique.has(id)) continue;
      const primaryType=getPrimaryType(tags);
      const breakfastCandidate=category==='早餐' && (primaryType==='bakery'||primaryType==='cafe'||primaryType==='fast_food_restaurant'||new RegExp(breakfastPattern,'i').test(`${name} ${tags.brand||''}`)||/(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)/i.test(tags.cuisine||''));
      unique.set(id,{id,name,brand:tags.brand||'',lat:placeLat,lng:placeLng,address:getAddress(tags),primaryType,cuisine:tags.cuisine||'',description:tags.description||'',openingHours:tags.opening_hours||'',openNow:true,breakfastCandidate,source:'OpenStreetMap'});
    }
    const payload={places:[...unique.values()],cachedAt:new Date().toISOString(),source:'OpenStreetMap',category};
    cache.set(cacheKey,{savedAt:Date.now(),payload}); return sendJson(res,200,payload);
  } catch(error) {
    console.error('nearby function failed',error);
    return sendJson(res,502,{error:'免費店家服務目前忙碌，請稍後再試一次。'});
  }
};
