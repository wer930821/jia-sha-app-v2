const menus = {
  早餐: [['原味蛋餅',35],['火腿蛋吐司',45],['鮪魚蛋餅',55],['蘿蔔糕加蛋',60],['豆漿',25]],
  飯類: [['滷肉飯',45],['雞肉飯',55],['排骨便當',100],['雞腿便當',120],['燙青菜',40]],
  麵類: [['乾麵',50],['陽春麵',55],['麻醬麵',65],['餛飩麵',80],['小菜',35]],
  小吃: [['肉圓',45],['臭豆腐',65],['甜不辣',60],['滷味拼盤',100],['關東煮',80]],
  炸物: [['鹽酥雞',70],['雞排',85],['甜不辣',35],['四季豆',40],['炸物套餐',150]],
  飲料: [['紅茶',30],['珍珠奶茶',55],['水果茶',65],['鮮奶茶',70],['咖啡',75]],
  甜點: [['豆花',50],['仙草',55],['剉冰',80],['鬆餅',120],['蛋糕',130]],
  餐廳: [['經濟套餐',120],['招牌主餐',180],['雙人分享餐',399],['飲料',50],['甜點',100]]
};

const demoRestaurants = [
  demo('demo-1','阿財炒麵','麵類','正餐',.45,4.4),
  demo('demo-2','巷口雞肉飯','飯類','正餐',.7,4.6),
  demo('demo-3','晨間蛋餅研究所','早餐','早餐',1.1,4.3),
  demo('demo-4','老張滷肉飯','飯類','正餐',1.4,4.5),
  demo('demo-5','夜市鹽酥雞','炸物','小吃',.9,4.2),
  demo('demo-6','豆花伯','甜點','甜點',.3,4.7),
  demo('demo-7','清爽便當社','飯類','正餐',1,4.5)
];
function demo(id,name,type,group,distanceKm,rating){
  const menu=buildMenu(type); const bounds=menuBounds(menu);
  return {id,name,type,group,distanceKm,rating,open:true,address:'台中市南屯區',tags:['示範店家'],lat:24.145,lon:120.646,menu,priceMin:bounds.min,priceMax:bounds.max,menuSource:'示範菜單',source:'示範資料'};
}

const categories=['全部','早餐','正餐','小吃','飲料','甜點'];
const exclusions=['麵類','炸物','早餐','飲料'];
const transports=[
  {id:'walk',label:'🚶 走路',speed:4.8},
  {id:'scooter',label:'🛵 騎車',speed:25},
  {id:'car',label:'🚗 開車',speed:30}
];
const closedReports=new Set(JSON.parse(localStorage.getItem('jiaShaClosedReports')||'[]'));
const state={category:'全部',budget:null,maxDistanceKm:2,transport:'walk',excluded:[],openOnly:false,selectedId:null,restaurants:[...demoRestaurants],position:null,loading:false,isLive:false,lastFetchedRadiusKm:0,map:null,mapLoaded:false,mapMarkers:[],userMarker:null,searchStats:{rawCount:0,returnedCount:0,normalizedCount:0},menuSearches:new Map()};
const ids=['map','mapStatus','fitMapButton','categoryChips','transportChips','exclusionChips','openOnly','chooseButton','resultCount','notice','resultCard','nearbyCount','restaurantList','locationButton','locationTitle','locationText','budgetInput','unlimitedBudget','distanceInput'];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

// 結果卡會反覆重新渲染，因此用事件委派，避免手機上按鈕失去事件。
els.resultCard.addEventListener('click', event=>{
  const button=event.target.closest('[data-action]');
  if(!button||!els.resultCard.contains(button))return;
  event.preventDefault();
  event.stopPropagation();
  const selected=state.restaurants.find(item=>item.id===state.selectedId);
  if(button.dataset.action==='change')return chooseRestaurant();
  if(!selected)return;
  if(button.dataset.action==='map')return window.open(mapUrl(selected),'_blank','noopener,noreferrer');
  if(button.dataset.action==='menu-search'){
    button.disabled=true;
    button.textContent='🔎 搜尋中…';
    return searchPublicMenu(selected);
  }
  if(button.dataset.action==='report-closed'){
    const selected=state.restaurants.find(x=>x.id===state.selectedId);
    if(selected)reportClosed(selected);
    return;
  }
});

const blacklist=/(檳榔|菸酒|煙酒|彩券|投注站|藥局|診所|醫院|寵物|汽車|機車|洗衣|美容|美髮|按摩|旅館|民宿|便利商店|超商|全家|7-?ELEVEN|萊爾富|OK超商)/i;
const breakfastWords=/(早餐|早午餐|晨間|早安|美而美|美芝城|弘爺|拉亞|麥味登|Q\s*Burger|漢堡大師|豆漿|蛋餅|飯糰|燒餅|油條|吐司|饅頭|蔥抓餅|三明治|brunch|breakfast)/i;
const breakfastCuisine=/(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)/i;
const breakfastRejectWords=/(炸雞|雞排|鹽酥|剉冰|挫冰|刨冰|冰品|豆花|仙草|蛋糕|乳酪|甜點|書屋|書店|豬腳|麵線|火鍋|牛排|咖哩|便當|餐盒)/i;
const strongMealWords=/(豬腳|麵線|便當|餐盒|自助餐|食堂|火鍋|燒肉|牛排|咖哩|水餃|鍋貼|滷肉|雞肉飯|排骨|雞腿|粥|米粉|冬粉|板條|河粉|餛飩|拉麵|壽司|丼|義大利麵|披薩)/i;
const drinkWords=/(茶湯會|清心|五十嵐|50嵐|可不可|麻古|迷客夏|龜記|大苑子|茶飲|飲料|手搖|紅茶冰|juice|bubble_tea|tea_shop)/i;
const dessertWords=/(豆花|冰店|冰品|甜品|甜點|蛋糕|鬆餅|可麗餅|仙草|剉冰|挫冰|刨冰|黑砂糖冰|雪花冰|霜淇淋|冰淇淋|ice.?cream|dessert|pastry)/i;
const snackWords=/(鹽酥雞|雞排|滷味|臭豆腐|地瓜球|肉圓|蚵仔煎|甜不辣|關東煮|小吃|夜市|snack)/i;
const noodleWords=/(麵|拉麵|烏龍|意麵|米粉|冬粉|板條|河粉|noodle|ramen)/i;
const friedWords=/(炸|鹽酥|雞排|fried)/i;


const probableItems={
  早餐:['蛋餅','吐司','漢堡','蘿蔔糕','豆漿','奶茶'],
  '麵包／輕早餐':['麵包','三明治','咖啡','吐司','甜麵包'],
  飯類:['飯類主餐','便當','湯品','小菜'],
  麵類:['麵食','湯麵','乾麵','小菜'],
  小吃:['招牌小吃','湯品','滷味或小菜'],
  炸物:['炸物','雞排或鹽酥類','蔬菜炸物'],
  飲料:['茶飲','奶茶','果茶','咖啡'],
  甜點:['冰品','豆花或仙草','甜湯','配料'],
  餐廳:['主餐','套餐','湯品','飲料']
};
function probableItemsFor(x){
  const text=x.name||'';
  if(/豬腳.*麵線|麵線.*豬腳/i.test(text))return ['豬腳麵線','豬腳飯','滷蛋','油豆腐','燙青菜'];
  if(/剉冰|挫冰|刨冰|黑砂糖冰/i.test(text))return ['黑砂糖冰','剉冰','豆花','仙草','粉粿','芋圓'];
  if(/豆花/i.test(text))return ['豆花','仙草','粉圓','花生','芋圓'];
  if(/雞肉飯/i.test(text))return ['雞肉飯','滷肉飯','湯品','燙青菜','滷蛋'];
  if(/滷肉飯|魯肉飯/i.test(text))return ['滷肉飯','湯品','燙青菜','滷蛋','油豆腐'];
  if(/牛肉麵/i.test(text))return ['牛肉麵','乾麵','水餃','小菜'];
  if(/早餐|早午餐|美而美|美芝城|弘爺|拉亞|麥味登/i.test(text))return probableItems.早餐;
  return probableItems[x.type]||probableItems.餐廳;
}

function haversine(a,b,c,d){const r=6371,x=(c-a)*Math.PI/180,y=(d-b)*Math.PI/180,q=Math.sin(x/2)**2+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(y/2)**2;return r*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function buildMenu(type){return (menus[type]||menus.餐廳).map(([name,price])=>({name,price}));}
function menuBounds(menu){const prices=menu.map(x=>x.price);return {min:Math.min(...prices),max:Math.max(...prices)};}
function travelMinutes(distanceKm){const mode=transports.find(x=>x.id===state.transport)||transports[0];return Math.max(1,Math.round(distanceKm/mode.speed*60));}
function transportText(){return transports.find(x=>x.id===state.transport)?.label.replace(/^[^ ]+ /,'')||'走路';}
function budgetText(){return state.budget===null?'不限預算':`$${state.budget} 內`;}

function inferInfo(place){
  const name=place.name||'', type=place.primaryType||'', cuisine=place.cuisine||'', brand=place.brand||'', description=place.description||'';
  const text=`${name} ${brand} ${type} ${cuisine} ${description}`;
  if(blacklist.test(text)) return null;
  if(place.categoryHint){
    // 後端分類仍做最後一道防呆：明確飯麵主食不能進飲料。
    if(place.categoryHint==='飲料' && strongMealWords.test(text)) return {type:noodleWords.test(text)?'麵類':'飯類',group:'正餐',note:'餐點名稱排除飲料'};
    if(place.categoryHint==='早餐') {
      if(breakfastRejectWords.test(text) || !(breakfastWords.test(text)||breakfastCuisine.test(cuisine))) return null;
      return {type:'早餐',group:'早餐',note:place.classificationConfidence};
    }
    if(place.categoryHint==='飲料') return {type:'飲料',group:'飲料',note:place.classificationConfidence};
    if(place.categoryHint==='甜點') return {type:'甜點',group:'甜點',note:place.classificationConfidence};
    if(place.categoryHint==='小吃') return {type:friedWords.test(text)?'炸物':'小吃',group:'小吃',note:place.classificationConfidence};
    if(place.categoryHint==='正餐'){
      if(noodleWords.test(text)) return {type:'麵類',group:'正餐',note:place.classificationConfidence};
      if(/便當|飯|自助餐|餐盒|食堂|台菜|中式|火鍋|燒肉|牛排|咖哩|水餃|鍋貼/i.test(text)) return {type:'飯類',group:'正餐',note:place.classificationConfidence};
      return {type:'餐廳',group:'正餐',note:place.classificationConfidence};
    }
  }
  if(breakfastWords.test(text)||breakfastCuisine.test(cuisine)) return {type:'早餐',group:'早餐'};
  if(dessertWords.test(text)||['ice_cream_shop','confectionery'].includes(type)) return {type:'甜點',group:'甜點'};
  if(drinkWords.test(text)||['beverage_shop','juice_shop','tea_house'].includes(type)) return {type:'飲料',group:'飲料'};
  if(type==='bakery' && breakfastWords.test(text)) return {type:'早餐',group:'早餐'};
  if(noodleWords.test(text)) return {type:'麵類',group:'正餐'};
  if(friedWords.test(text)) return {type:'炸物',group:'小吃'};
  if(snackWords.test(text)||/fast_food|food_court/.test(type)) return {type:'小吃',group:'小吃'};
  return {type:'餐廳',group:'正餐'};
}

async function fetchNearbyChunk(lat,lon,radiusKm){
  const radius=Math.round(Math.min(6,Math.max(.3,radiusKm))*1000);
  const url=`/api/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}&radius=${radius}&category=${encodeURIComponent(state.category)}`;
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'附近店家搜尋失敗');
  return data;
}

function searchCenters(lat,lon,radiusKm){
  if(radiusKm<=5)return [{lat,lon,radiusKm}];
  const tileRadius=Math.min(5.5,Math.max(3.5,radiusKm*.58));
  const offset=Math.max(2.5,radiusKm*.52);
  const latStep=offset/111;
  const lonStep=offset/(111*Math.max(.25,Math.cos(lat*Math.PI/180)));
  return [
    {lat,lon,radiusKm:tileRadius},
    {lat:lat+latStep,lon,radiusKm:tileRadius},
    {lat:lat-latStep,lon,radiusKm:tileRadius},
    {lat,lon:lon+lonStep,radiusKm:tileRadius},
    {lat,lon:lon-lonStep,radiusKm:tileRadius}
  ];
}

async function fetchOsmRestaurants(lat,lon,radiusKm){
  const centers=searchCenters(lat,lon,radiusKm);
  const settled=await Promise.allSettled(centers.map(c=>fetchNearbyChunk(c.lat,c.lon,c.radiusKm)));
  const successful=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!successful.length){
    const firstError=settled.find(x=>x.status==='rejected')?.reason;
    throw firstError||new Error('附近店家搜尋失敗');
  }
  const places=successful.flatMap(x=>x.places||[]);
  const normalized=places.map(p=>normalizeOsmPlace(p,lat,lon)).filter(Boolean).filter(x=>x.distanceKm<=radiusKm);
  const unique=new Map();
  normalized.sort((a,b)=>a.distanceKm-b.distanceKm).forEach(x=>{
    const key=`${x.name.toLowerCase()}-${x.lat.toFixed(4)}-${x.lon.toFixed(4)}`;
    if(!unique.has(key))unique.set(key,x);
  });
  const rawCount=successful.reduce((sum,x)=>sum+(x.stats?.rawCount||0),0);
  const returnedCount=successful.reduce((sum,x)=>sum+(x.stats?.returnedCount||0),0);
  return {
    restaurants:[...unique.values()],
    stats:{rawCount,returnedCount,normalizedCount:unique.size,successfulTiles:successful.length,totalTiles:centers.length}
  };
}
function normalizeOsmPlace(place,userLat,userLon){
  if(!place.name||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return null;
  const info=inferInfo(place); if(!info)return null;
  const distanceKm=haversine(userLat,userLon,place.lat,place.lng);
  const tags=['OpenStreetMap 店家'];
  if(info.note)tags.push(info.note);
  return {id:place.id,name:place.name,type:info.type,group:info.group,distanceKm:+distanceKm.toFixed(2),rating:null,open:place.openNow,address:place.address||'附近店家',tags,lat:place.lat,lon:place.lng,menu:[],priceMin:null,priceMax:null,menuSource:'尚未收錄真實菜單',source:'OpenStreetMap'};
}

function initMap(){
  if(state.map||!window.maplibregl||!els.map)return;
  state.map=new maplibregl.Map({
    container:'map',
    style:'https://tiles.openfreemap.org/styles/liberty',
    center:[120.646,24.145],
    zoom:11
  });
  state.map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  state.map.on('load',()=>{state.mapLoaded=true;updateMap();});
  state.map.on('error',()=>{els.mapStatus.textContent='地圖暫時無法載入，但店家搜尋仍可使用。';});
}
function clearMapMarkers(){
  state.mapMarkers.forEach(marker=>marker.remove());
  state.mapMarkers=[];
  if(state.userMarker){state.userMarker.remove();state.userMarker=null;}
}
function scrollToResultCard(){
  // 等卡片完成排版後再捲動，避免手機因高度變化跳過頭。
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const top=els.resultCard.getBoundingClientRect().top+window.scrollY-12;
    window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  }));
}
function selectFromMap(id){
  state.selectedId=id;hideNotice();renderResult();updateSelectedMarkerClasses();
  scrollToResultCard();
}
function updateMap(){
  if(!state.mapLoaded||!state.map)return;
  clearMapMarkers();
  const filtered=getFiltered();
  if(state.position){
    const dot=document.createElement('div');dot.className='user-marker';dot.title='你的位置';
    state.userMarker=new maplibregl.Marker({element:dot}).setLngLat([state.position.lon,state.position.lat]).addTo(state.map);
  }
  filtered.slice(0,120).forEach(x=>{
    const el=document.createElement('div');el.className=`map-marker${x.id===state.selectedId?' selected':''}`;el.innerHTML='<span>🍴</span>';el.title=x.name;
    const popup=new maplibregl.Popup({offset:22,closeButton:false}).setHTML(`<div class="map-popup"><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.type)} · ${x.distanceKm} km</span><button type="button" data-id="${escapeHtml(x.id)}">選這間</button></div>`);
    const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([x.lon,x.lat]).setPopup(popup).addTo(state.map);
    el.addEventListener('click',()=>{state.selectedId=x.id;setTimeout(()=>{const b=document.querySelector('.maplibregl-popup button[data-id]');if(b)b.onclick=()=>selectFromMap(x.id);},0);updateSelectedMarkerClasses();});
    state.mapMarkers.push(marker);
  });
  els.mapStatus.textContent=state.position?`地圖顯示 ${filtered.length} 間符合條件的店家（最多顯示 120 個標記）。`:'取得定位後會顯示真實店家；目前為示範位置。';
  fitMapToResults(false);
}
function updateSelectedMarkerClasses(){
  const filtered=getFiltered();
  state.mapMarkers.forEach((marker,index)=>{const node=marker.getElement();node.classList.toggle('selected',filtered[index]?.id===state.selectedId);});
}
function fitMapToResults(force=true){
  if(!state.mapLoaded||!state.map)return;
  const points=getFiltered().slice(0,120).map(x=>[x.lon,x.lat]);
  if(state.position)points.push([state.position.lon,state.position.lat]);
  if(!points.length)return;
  if(points.length===1){state.map.easeTo({center:points[0],zoom:14});return;}
  const bounds=points.reduce((b,p)=>b.extend(p),new maplibregl.LngLatBounds(points[0],points[0]));
  state.map.fitBounds(bounds,{padding:45,maxZoom:15,duration:force?700:0});
}
function budgetMatches(x){return state.budget===null||!x.menu?.length||x.menu.some(item=>item.price<=state.budget);}
function getFiltered(){return state.restaurants.filter(x=>!closedReports.has(x.id)&&(state.category==='全部'||x.group===state.category)&&budgetMatches(x)&&x.distanceKm<=state.maxDistanceKm&&!state.excluded.includes(x.type)&&(!state.openOnly||x.open!==false));}
function makeChip(label,active,onClick,danger=false){const b=document.createElement('button');b.className=`chip${active?' active':''}${danger?' danger':''}`;b.textContent=label;b.onclick=onClick;return b;}
function renderControls(){
  els.categoryChips.innerHTML='';categories.forEach(v=>els.categoryChips.appendChild(makeChip(v,state.category===v,async()=>{
    if(state.category===v)return;
    state.category=v;state.selectedId=null;render();
    // 手機第一次直接點分類時，也要主動取得位置，不能只停在示範畫面。
    if(state.position) await searchAtPosition();
    else useLocation();
  })));
  els.transportChips.innerHTML='';transports.forEach(v=>els.transportChips.appendChild(makeChip(v.label,state.transport===v.id,()=>{state.transport=v.id;render()})));
  els.exclusionChips.innerHTML='';exclusions.forEach(v=>els.exclusionChips.appendChild(makeChip(v,state.excluded.includes(v),()=>{state.excluded=state.excluded.includes(v)?state.excluded.filter(x=>x!==v):[...state.excluded,v];render()},state.excluded.includes(v))));
  els.openOnly.checked=state.openOnly; els.unlimitedBudget.checked=state.budget===null; els.budgetInput.disabled=state.budget===null; els.budgetInput.value=state.budget??''; els.distanceInput.value=state.maxDistanceKm;
}
function chooseRestaurant(){
  const f=getFiltered();
  if(!f.length)return showNotice(`目前沒有符合條件的店。可增加距離、切到「全部」，或關閉「只看營業中」。`);
  if(els.chooseButton.disabled)return;
  els.chooseButton.disabled=true;
  const p=f.length>1?f.filter(x=>x.id!==state.selectedId):f;
  state.selectedId=p[Math.floor(Math.random()*p.length)].id;
  hideNotice();renderResult();updateSelectedMarkerClasses();scrollToResultCard();
  setTimeout(()=>{els.chooseButton.disabled=false;},450);
}
function showNotice(m){els.notice.textContent=m;els.notice.classList.remove('hidden');els.resultCard.classList.add('hidden');}
function hideNotice(){els.notice.classList.add('hidden');}
function mapUrl(x){
  const usableAddress=x.address&&x.address!=='附近店家'?x.address:'';
  // 店名＋地址可避免同名分店；座標放在查詢尾端作為第二層校正。
  const query=[x.name,usableAddress,`${x.lat},${x.lon}`].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function menuHtml(x){
  const search=state.menuSearches.get(x.id);
  const likely=probableItemsFor(x).map(item=>`<span class="likely-item">${escapeHtml(item)}</span>`).join('');
  let resultHtml='';
  if(search?.loading){
    resultHtml='<div class="menu-search-status">正在搜尋公開菜單…</div>';
  }else if(search?.error){
    resultHtml=`<div class="menu-search-status error">${escapeHtml(search.error)}</div>`;
  }else if(search?.businessStatus?.closed){
    resultHtml='<div class="closed-warning"><strong>⚠️ 網路資料顯示這間店可能已歇業</strong><span>已停止找菜單，建議不要前往。</span></div>';
  }else if(search?.results?.length){
    const title=search.fallback?'可直接開啟的菜單搜尋':'找到的公開來源';
    const notice=search.notice?`<div class="menu-search-status">${escapeHtml(search.notice)}</div>`:'';
    resultHtml=`${notice}<div class="menu-search-results"><strong>${title}</strong>${search.results.map(r=>`<a class="menu-source-link" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(r.title)}</span><small>${escapeHtml(r.source||'公開網頁')}</small>${r.snippet?`<em>${escapeHtml(r.snippet)}</em>`:''}</a>`).join('')}</div>`;
  }
  return `<div class="menu-box"><div class="menu-head"><strong>品項資訊</strong><span>真實來源優先</span></div><div class="likely-title">依店名與類型推測可能有：</div><div class="likely-items">${likely}</div><small>以上不是官方菜單，只是幫你先判斷店家大概賣什麼。</small><div class="menu-actions"><button class="menu-search-button" data-action="menu-search" type="button">🔎 自動找公開菜單</button><button class="report-closed-button" data-action="report-closed" type="button">回報已歇業</button></div>${resultHtml}</div>`;
}
async function searchPublicMenu(x){
  state.menuSearches.set(x.id,{loading:true,results:[]});renderResult();
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),9000);
  try{
    const url=`/api/menu-search?name=${encodeURIComponent(x.name)}&address=${encodeURIComponent(x.address||'')}`;
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'菜單搜尋失敗');
    state.menuSearches.set(x.id,{loading:false,results:data.results||[],query:data.query||'',notice:data.notice||'',fallback:Boolean(data.fallback),businessStatus:data.businessStatus||{}});
    if(data.businessStatus?.closed){
      closedReports.add(x.id);
      localStorage.setItem('jiaShaClosedReports',JSON.stringify([...closedReports]));
    }
  }catch(error){
    const query=encodeURIComponent(`${x.name} ${x.address||''} 菜單 價目表`);
    state.menuSearches.set(x.id,{loading:false,fallback:true,notice:'自動搜尋逾時，先提供可直接開啟的搜尋。',results:[
      {title:`Google 搜尋「${x.name} 菜單」`,url:`https://www.google.com/search?q=${query}`,source:'Google 搜尋',snippet:'搜尋官方菜單、價目表與菜單照片'},
      {title:`Bing 搜尋「${x.name} 菜單」`,url:`https://www.bing.com/search?q=${query}`,source:'Bing 搜尋',snippet:'查看公開網站與菜單圖片'}
    ]});
  }finally{clearTimeout(timer)}
  renderResult();
}

function reportClosed(x){
  closedReports.add(x.id);
  localStorage.setItem('jiaShaClosedReports',JSON.stringify([...closedReports]));
  state.selectedId=null;
  showNotice(`已將「${x.name}」標記為可能歇業，之後不再推薦。`);
  render();
}

function renderResult(){
  const x=state.restaurants.find(i=>i.id===state.selectedId);if(!x)return els.resultCard.classList.add('hidden');
  const within=x.menu?.length?(state.budget===null?x.menu.length:x.menu.filter(i=>i.price<=state.budget).length):0;
  els.resultCard.innerHTML=`<div class="result-eyebrow">今天就吃這間</div><div class="result-heading"><div><h2>${escapeHtml(x.name)}</h2><p>${escapeHtml(x.type)} · ${x.distanceKm} km</p></div><div class="rating">附近</div></div><div class="price-line">${x.menu?.length?(state.budget===null?'已有菜單資料':`${within} 項真實餐點在 $${state.budget} 內`):'真實價格尚未收錄'}</div><div class="meta-grid"><div>🧭 ${transportText()}約 ${travelMinutes(x.distanceKm)} 分鐘</div><div>🕒 ${x.open===true?'目前營業':x.open===false?'目前休息':'營業時間未確認'}</div></div><div class="address">${escapeHtml(x.address)}</div><div class="tag-row">${x.tags.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div>${menuHtml(x)}<div class="action-row"><button class="secondary-button" data-action="change" type="button">🔄 換一家</button><button class="map-button" data-action="map" type="button">🧭 確認店家定位</button></div>`;
  els.resultCard.classList.remove('hidden');updateSelectedMarkerClasses();
}
function renderList(){
  const f=getFiltered();els.nearbyCount.textContent=`${f.length} 間`;const st=state.searchStats;els.resultCount.textContent=state.isLive?`分區 ${st.successfulTiles||1}/${st.totalTiles||1} 成功 · 資料源 ${st.rawCount} 筆 → 可用 ${st.normalizedCount} 間 → 最後符合 ${f.length} 間`:'尚未取得真實店家資料';els.restaurantList.innerHTML='';
  if(!f.length)els.restaurantList.innerHTML='<div class="empty-list">目前沒有取得符合條件的真實店家。請查看上方搜尋狀態或稍後重新搜尋。</div>';
  f.forEach(x=>{const b=document.createElement('button');b.className='restaurant-item';b.innerHTML=`<div><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.type)} · ${x.menu?.length?'已有菜單':'可自動找菜單'}</span><small>${transportText()}約 ${travelMinutes(x.distanceKm)} 分鐘 · ${x.distanceKm} km</small></div><b>查看</b>`;b.onclick=()=>{state.selectedId=x.id;hideNotice();renderResult();updateSelectedMarkerClasses();scrollToResultCard();};els.restaurantList.appendChild(b);});
}
function render(){
  renderControls();
  if(state.selectedId&&!getFiltered().some(x=>x.id===state.selectedId))state.selectedId=null;
  renderList();renderResult();updateMap();
}

async function searchAtPosition(){
  if(!state.position)return useLocation();
  state.loading=true;els.locationButton.disabled=true;els.locationButton.textContent='搜尋中…';els.locationText.textContent=`搜尋 ${state.maxDistanceKm} 公里內店家`;
  try{const result=await fetchOsmRestaurants(state.position.lat,state.position.lon,state.maxDistanceKm);state.restaurants=result.restaurants;state.searchStats=result.stats;state.lastFetchedRadiusKm=state.maxDistanceKm;state.isLive=true;state.selectedId=null;if(result.restaurants.length){els.locationText.textContent=`${state.category}：找到 ${result.restaurants.length} 間候選`;hideNotice();}else{els.locationText.textContent=`${state.category}：目前沒有找到符合店家`;showNotice(`已成功搜尋附近資料，但 ${state.maxDistanceKm} 公里內沒有找到明確標示為「${state.category}」的店家。可以增加距離後再搜尋。`);}}
  catch(e){state.restaurants=[];state.searchStats={rawCount:0,returnedCount:0,normalizedCount:0,successfulTiles:0,totalTiles:0};state.isLive=false;state.selectedId=null;els.locationText.textContent='真實店家搜尋失敗';showNotice(`${e.message}。沒有使用示範店家，請稍後重新搜尋。`);}
  finally{state.loading=false;els.locationButton.disabled=false;els.locationButton.textContent='重新搜尋';render();}
}
function useLocation(){
  if(!navigator.geolocation)return showNotice('這個瀏覽器不支援定位。請改用 Chrome 或 Safari 開啟。');
  if(!window.isSecureContext)return showNotice('定位需要 HTTPS 安全連線，請從正式網站網址開啟。');
  if(state.loading)return;
  state.loading=true;els.locationButton.disabled=true;els.locationButton.textContent='定位中…';

  const success=p=>{
    state.position={lat:p.coords.latitude,lon:p.coords.longitude};
    els.locationTitle.textContent='已取得目前位置';
    els.locationText.textContent='正在搜尋附近店家';
    searchAtPosition();
  };
  const fail=e=>{
    state.loading=false;els.locationButton.disabled=false;els.locationButton.textContent='再試一次';
    const m={1:'定位權限被關閉。請到瀏覽器的網站設定，將「位置」改為允許後再試一次。',2:'手機目前無法取得位置，請先開啟系統定位服務。',3:'定位逾時，請移到訊號較好的地方再試一次。'};
    showNotice(m[e.code]||'定位失敗，請稍後再試一次。');
  };

  // 先用高精度；Android 某些瀏覽器若逾時，再自動改用一般定位。
  navigator.geolocation.getCurrentPosition(success,e=>{
    if(e.code===1)return fail(e);
    els.locationText.textContent='高精度定位較慢，正在改用一般定位…';
    navigator.geolocation.getCurrentPosition(success,fail,{enableHighAccuracy:false,timeout:15000,maximumAge:600000});
  },{enableHighAccuracy:true,timeout:8000,maximumAge:300000});
}

els.budgetInput.onchange=e=>{state.budget=Math.max(0,Number(e.target.value)||0);render();};
els.unlimitedBudget.onchange=e=>{state.budget=e.target.checked?null:500;render();};
els.distanceInput.onchange=async e=>{state.maxDistanceKm=Math.min(20,Math.max(.3,Number(e.target.value)||2));render();if(state.position)await searchAtPosition();};
els.openOnly.onchange=e=>{state.openOnly=e.target.checked;render();};els.chooseButton.onclick=chooseRestaurant;els.locationButton.onclick=()=>state.position?searchAtPosition():useLocation();els.fitMapButton.onclick=()=>fitMapToResults(true);initMap();render();
