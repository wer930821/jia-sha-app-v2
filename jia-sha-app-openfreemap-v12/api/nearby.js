const CACHE_TTL_MS = 15 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 40;
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
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}
function validNumber(value, min, max) { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null; }
function getAddress(t = {}) { return t['addr:full'] || [t['addr:city'],t['addr:district'],t['addr:street'],t['addr:housenumber']].filter(Boolean).join('') || t['addr:place'] || '附近店家'; }
function getPrimaryType(t = {}) {
  if (t.shop === 'bakery') return 'bakery';
  if (t.shop === 'confectionery') return 'confectionery';
  if (t.shop === 'beverages') return 'beverage_shop';
  if (t.shop === 'deli') return 'deli';
  if (t.amenity === 'cafe') return 'cafe';
  if (t.amenity === 'fast_food') return 'fast_food_restaurant';
  if (t.amenity === 'ice_cream') return 'ice_cream_shop';
  if (t.amenity === 'food_court') return 'food_court';
  return 'restaurant';
}

const strongMealPattern = '豬腳|麵線|麵|飯|便當|餐盒|自助餐|食堂|火鍋|燒肉|牛排|咖哩|水餃|鍋貼|滷肉|雞肉飯|排骨|雞腿|粥|米粉|冬粉|板條|河粉|餛飩|拉麵|壽司|丼|義大利麵|披薩|漢堡|炸雞';

const patterns = {
  breakfast: '早餐|早午餐|晨間|早安|美而美|美芝城|弘爺|拉亞|麥味登|Q[ _-]?Burger|漢堡大師|豆漿|蛋餅|飯糰|燒餅|油條|吐司|饅頭|蔥抓餅|三明治|brunch|breakfast',
  drink: '茶湯會|清心|五十嵐|50嵐|可不可|麻古|迷客夏|龜記|大苑子|茶飲|飲料|手搖|紅茶冰|果汁|咖啡|coffee|juice|bubble.?tea|tea',
  dessert: '豆花|冰店|冰品|甜品|甜點|蛋糕|鬆餅|可麗餅|仙草|剉冰|挫冰|刨冰|黑砂糖冰|雪花冰|霜淇淋|冰淇淋|甜甜圈|布丁|dessert|pastry|ice.?cream|cake',
  snack: '鹽酥雞|雞排|滷味|臭豆腐|地瓜球|肉圓|蚵仔煎|甜不辣|關東煮|小吃|夜市|蔥油餅|水煎包|車輪餅|雞蛋糕|snack|street.?food',
};

function queryFor(category, radius, lat, lng) {
  const around = `(around:${radius},${lat},${lng})`;
  const head = '[out:json][timeout:18];(';
  const tail = ');out center tags 700;';
  if (category === '早餐') return `${head}
    nwr["amenity"~"^(restaurant|cafe|fast_food)$"]["name"~"${patterns.breakfast}",i]${around};
    nwr["amenity"~"^(restaurant|cafe|fast_food)$"]["cuisine"~"(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)",i]${around};
    nwr["shop"="bakery"]["name"~"${patterns.breakfast}",i]${around};
  ${tail}`;
  if (category === '正餐') return `${head}
    nwr["amenity"="restaurant"]${around};
    nwr["amenity"="food_court"]${around};
    nwr["amenity"="fast_food"]${around};
    nwr["shop"="deli"]${around};
  ${tail}`;
  if (category === '小吃') return `${head}
    nwr["amenity"="fast_food"]${around};
    nwr["amenity"="food_court"]${around};
    nwr["amenity"~"^(restaurant|cafe)$"]["name"~"${patterns.snack}",i]${around};
    nwr["amenity"~"^(restaurant|fast_food)$"]["cuisine"~"(snack|street_food|taiwanese|fried_food)",i]${around};
  ${tail}`;
  if (category === '飲料') return `${head}
    nwr["amenity"="cafe"]${around};
    nwr["shop"="beverages"]${around};
    nwr["amenity"~"^(restaurant|fast_food)$"]["name"~"${patterns.drink}",i]${around};
  ${tail}`;
  if (category === '甜點') return `${head}
    nwr["amenity"="ice_cream"]${around};
    nwr["shop"~"^(confectionery|bakery)$"]${around};
    nwr["amenity"~"^(cafe|restaurant)$"]["name"~"${patterns.dessert}",i]${around};
  ${tail}`;
  return `${head}
    nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"]${around};
    nwr["shop"~"^(bakery|confectionery|deli|beverages)$"]${around};
  ${tail}`;
}

function classify(tags, requestedCategory) {
  const text = `${tags.name || ''} ${tags.brand || ''} ${tags.cuisine || ''} ${tags.description || ''}`;

  // 分類專屬搜尋仍要做交叉驗證，避免 OSM 誤標的 cafe／beverages
  // 把豬腳麵線、便當、飯麵類店家錯塞進「飲料」。
  if (requestedCategory === '飲料' && new RegExp(strongMealPattern, 'i').test(text)) {
    return { categoryHint: '正餐', confidence: '餐點名稱排除飲料' };
  }
  if (requestedCategory === '甜點' && new RegExp('豬腳|麵線|便當|餐盒|自助餐|火鍋|燒肉|牛排|咖哩|水餃|鍋貼|滷肉|雞肉飯', 'i').test(text)) {
    return { categoryHint: '正餐', confidence: '餐點名稱排除甜點' };
  }
  if (requestedCategory === '早餐') {
    const isBreakfast = new RegExp(patterns.breakfast, 'i').test(text) ||
      /(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)/i.test(tags.cuisine || '');
    const obviousNotBreakfast = new RegExp(`${strongMealPattern}|剉冰|挫冰|刨冰|冰品|豆花|仙草|蛋糕|乳酪|甜點|書屋|書店|炸雞|雞排|鹽酥`, 'i').test(text);
    if (!isBreakfast || obviousNotBreakfast) return null;
    return { categoryHint: '早餐', confidence: '明確早餐名稱／料理' };
  }
  if (requestedCategory !== '全部') {
    return { categoryHint: requestedCategory, confidence: '一般候選' };
  }
  if (new RegExp(patterns.breakfast, 'i').test(text) || /(breakfast|brunch|taiwanese_breakfast)/i.test(tags.cuisine || '')) return {categoryHint:'早餐',confidence:'名稱／料理判斷'};
  // 冰品與甜點要先於飲料判斷，避免『黑砂糖挫冰』因糖／茶相關字樣被歸到飲料。
  if (new RegExp(patterns.dessert, 'i').test(text) || tags.amenity === 'ice_cream' || tags.shop === 'confectionery') return {categoryHint:'甜點',confidence:'名稱／類型判斷'};
  if (new RegExp(patterns.drink, 'i').test(text) || tags.shop === 'beverages') return {categoryHint:'飲料',confidence:'名稱／類型判斷'};
  if (new RegExp(patterns.snack, 'i').test(text) || tags.amenity === 'fast_food') return {categoryHint:'小吃',confidence:'名稱／類型判斷'};
  if (tags.shop === 'bakery') return {categoryHint:'早餐',confidence:'麵包／輕早餐'};
  return {categoryHint:'正餐',confidence:'餐飲類型判斷'};
}

async function requestOverpass(endpoint, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 19000);
  try {
    const response = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',Accept:'application/json','User-Agent':'JiaShaApp/1.6'},
      body:new URLSearchParams({data:query}),
      signal:controller.signal
    });
    if (!response.ok) throw new Error(`Overpass HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data?.elements)) throw new Error('Overpass response is invalid');
    return data;
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
    const radius=Math.min(6000,Math.max(300,Number(req.query?.radius)||2000));
    const allowedCategories=['全部','早餐','正餐','小吃','飲料','甜點'];
    const category=allowedCategories.includes(String(req.query?.category)) ? String(req.query.category) : '全部';
    if (lat===null||lng===null) return sendJson(res,400,{error:'定位座標不正確。'});
    const cacheKey=`${lat.toFixed(3)}:${lng.toFixed(3)}:${Math.round(radius/500)*500}:${category}:v22`;
    const cached=cache.get(cacheKey);
    if(cached&&Date.now()-cached.savedAt<CACHE_TTL_MS) return sendJson(res,200,cached.payload);

    const data=await fetchOverpass(queryFor(category,radius,lat,lng));
    const rawCount=data.elements.length;
    const unique=new Map();
    for(const element of data.elements){
      const tags=element.tags??{}, placeLat=element.lat??element.center?.lat, placeLng=element.lon??element.center?.lon;
      const name=tags['name:zh']||tags.name||tags.brand||'';
      if(!name||!Number.isFinite(placeLat)||!Number.isFinite(placeLng)) continue;
      const id=`osm-${element.type}-${element.id}`;
      if(unique.has(id)) continue;
      const classification=classify(tags,category);
      if(!classification) continue;
      unique.set(id,{
        id,name,brand:tags.brand||'',lat:placeLat,lng:placeLng,address:getAddress(tags),primaryType:getPrimaryType(tags),
        cuisine:tags.cuisine||'',description:tags.description||'',openingHours:tags.opening_hours||'',openNow:null,
        categoryHint:classification.categoryHint,classificationConfidence:classification.confidence,source:'OpenStreetMap'
      });
    }
    const places=[...unique.values()];
    const payload={places,cachedAt:new Date().toISOString(),source:'OpenStreetMap',category,stats:{rawCount,returnedCount:places.length}};
    cache.set(cacheKey,{savedAt:Date.now(),payload});
    return sendJson(res,200,payload);
  } catch(error) {
    console.error('nearby function failed',error);
    return sendJson(res,502,{error:'免費店家服務目前忙碌，請稍後再試一次。'});
  }
};
