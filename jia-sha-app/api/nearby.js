const CACHE_TTL_MS=20*60*1000,RATE_WINDOW_MS=10*60*1000,RATE_LIMIT=20;
const cache=globalThis.__jiaShaCache||new Map(),rateBuckets=globalThis.__jiaShaRateBuckets||new Map();globalThis.__jiaShaCache=cache;globalThis.__jiaShaRateBuckets=rateBuckets;
function json(res,status,body){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, max-age=0, must-revalidate');res.end(JSON.stringify(body));}
function ip(req){return String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();}
function allowed(req){const now=Date.now(),key=ip(req),v=rateBuckets.get(key);if(!v||now-v.startedAt>RATE_WINDOW_MS){rateBuckets.set(key,{startedAt:now,count:1});return true}v.count++;return v.count<=RATE_LIMIT;}
function num(v,min,max){const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
function address(t={}){return t['addr:full']||[t['addr:city'],t['addr:district'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join('')||t['addr:place']||'附近店家';}
function primary(t={}){if(t.shop==='bakery')return'bakery';if(t.shop==='confectionery')return'confectionery';if(t.amenity==='cafe')return'cafe';if(t.amenity==='fast_food')return'fast_food_restaurant';if(t.amenity==='ice_cream')return'ice_cream_shop';if(t.amenity==='food_court')return'food_court';return'restaurant';}
async function requestOverpass(endpoint,query){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7500);
 try{
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Accept':'application/json','User-Agent':'JiaShaApp/1.3'},body:new URLSearchParams({data:query}),signal:controller.signal});
  if(!response.ok)throw new Error(`Overpass ${response.status}`);
  const data=await response.json();
  if(!data||!Array.isArray(data.elements))throw new Error('Overpass 回傳格式不正確');
  return data;
 }finally{clearTimeout(timer)}
}
async function overpass(query){
 const endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass-api.de/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
 try{return await Promise.any(endpoints.map(endpoint=>requestOverpass(endpoint,query)))}
 catch(error){throw new Error('所有免費店家資料服務暫時無法連線',{cause:error})}
}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return json(res,405,{error:'只接受 GET 請求。'});if(!allowed(req))return json(res,429,{error:'搜尋太頻繁，請稍後再試。'});
 const lat=num(req.query?.lat,-90,90),lng=num(req.query?.lng,-180,180),radius=Math.min(20000,Math.max(300,Number(req.query?.radius)||2000));if(lat===null||lng===null)return json(res,400,{error:'定位座標不正確。'});
 const key=`${lat.toFixed(3)}:${lng.toFixed(3)}:${Math.round(radius/500)*500}:v2`,hit=cache.get(key);if(hit&&Date.now()-hit.savedAt<CACHE_TTL_MS)return json(res,200,hit.payload);
 const breakfastNamePattern='早餐|早午餐|晨間|早安|美而美|美芝城|弘爺|拉亞|麥味登|Q[ _-]?Burger|漢堡大師|豆漿|蛋餅|飯糰|燒餅|油條|吐司|饅頭|蔥抓餅|三明治|brunch|breakfast';
 const q=`[out:json][timeout:7];
(
 nwr["amenity"~"^(restaurant|cafe|fast_food)$"]["name"~"${breakfastNamePattern}",i](around:${radius},${lat},${lng});
 nwr["amenity"~"^(restaurant|cafe|fast_food)$"]["cuisine"~"(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)",i](around:${radius},${lat},${lng});
 nwr["shop"="bakery"](around:${radius},${lat},${lng});
);out center tags 300;
(
 nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"](around:${radius},${lat},${lng});
 nwr["shop"~"^(bakery|confectionery|deli)$"](around:${radius},${lat},${lng});
);out center tags 300;`;
 let data;try{data=await overpass(q)}catch(e){console.error(e);return json(res,502,{error:'免費店家服務目前忙碌，請稍後再搜尋一次。'});}
 const places=(data.elements||[]).map(el=>{const t=el.tags||{},plat=el.lat??el.center?.lat,plng=el.lon??el.center?.lon,name=t['name:zh']||t.name||t.brand||'';if(!name||!Number.isFinite(plat)||!Number.isFinite(plng))return null;return{id:`osm-${el.type}-${el.id}`,name,brand:t.brand||'',lat:plat,lng:plng,address:address(t),primaryType:primary(t),cuisine:t.cuisine||'',description:t.description||'',openingHours:t.opening_hours||'',openNow:true,source:'OpenStreetMap'};}).filter(Boolean);
 const payload={places,cachedAt:new Date().toISOString(),source:'OpenStreetMap'};cache.set(key,{savedAt:Date.now(),payload});return json(res,200,payload);
};
