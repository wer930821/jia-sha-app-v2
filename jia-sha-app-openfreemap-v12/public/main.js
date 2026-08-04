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
const state={category:'全部',budget:null,maxDistanceKm:2,transport:'walk',excluded:[],openOnly:true,selectedId:null,restaurants:[...demoRestaurants],position:null,loading:false,isLive:false,lastFetchedRadiusKm:0,map:null,mapLoaded:false,mapMarkers:[],userMarker:null};
const ids=['map','mapStatus','fitMapButton','categoryChips','transportChips','exclusionChips','openOnly','chooseButton','resultCount','notice','resultCard','nearbyCount','restaurantList','locationButton','locationTitle','locationText','budgetInput','unlimitedBudget','distanceInput'];
const els=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));

const blacklist=/(檳榔|菸酒|煙酒|彩券|投注站|藥局|診所|醫院|寵物|汽車|機車|洗衣|美容|美髮|按摩|旅館|民宿|便利商店|超商|全家|7-?ELEVEN|萊爾富|OK超商)/i;
const breakfastWords=/(早餐|早午餐|晨間|早安|美而美|美芝城|弘爺|拉亞|麥味登|Q\s*Burger|漢堡大師|豆漿|蛋餅|飯糰|燒餅|油條|吐司|饅頭|蔥抓餅|三明治|brunch|breakfast)/i;
const breakfastCuisine=/(breakfast|brunch|sandwich|bagel|toast|taiwanese_breakfast)/i;
const drinkWords=/(茶湯會|清心|五十嵐|50嵐|可不可|麻古|迷客夏|龜記|大苑子|茶飲|飲料|手搖|紅茶冰|juice|bubble_tea|tea_shop)/i;
const dessertWords=/(豆花|冰店|冰品|甜品|甜點|蛋糕|鬆餅|可麗餅|仙草|剉冰|雪花冰|霜淇淋|ice.?cream|dessert|pastry)/i;
const snackWords=/(鹽酥雞|雞排|滷味|臭豆腐|地瓜球|肉圓|蚵仔煎|甜不辣|關東煮|小吃|夜市|snack)/i;
const noodleWords=/(麵|拉麵|烏龍|意麵|米粉|冬粉|板條|河粉|noodle|ramen)/i;
const friedWords=/(炸|鹽酥|雞排|fried)/i;

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
  if(place.breakfastCandidate||breakfastWords.test(text)||breakfastCuisine.test(cuisine)||type==='breakfast_restaurant'||type==='brunch_restaurant') return {type:'早餐',group:'早餐'};
  if(drinkWords.test(text)||['juice_shop','tea_house'].includes(type)) return {type:'飲料',group:'飲料'};
  if(dessertWords.test(text)||['dessert_shop','ice_cream_shop','confectionery'].includes(type)) return {type:'甜點',group:'甜點'};
  if(type==='bakery') return {type:'早餐',group:'早餐',softBreakfast:true};
  if(noodleWords.test(text)||type==='ramen_restaurant') return {type:'麵類',group:'正餐'};
  if(friedWords.test(text)) return {type:'炸物',group:'小吃'};
  if(snackWords.test(text)||/fast_food|food_court/.test(type)) return {type:'小吃',group:'小吃'};
  if(/便當|飯|自助餐|餐盒|食堂|台菜|中式|火鍋|燒肉|牛排|咖哩|水餃|鍋貼/i.test(text)) return {type:'飯類',group:'正餐'};
  return {type:'餐廳',group:'正餐'};
}

async function fetchOsmRestaurants(lat,lon,radiusKm){
  const radius=Math.round(Math.min(20,Math.max(.3,radiusKm))*1000);
  const response=await fetch(`/api/nearby?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lon)}&radius=${radius}&category=${encodeURIComponent(state.category)}`,{headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'附近店家搜尋失敗');
  const normalized=(data.places||[]).map(p=>normalizeOsmPlace(p,lat,lon)).filter(Boolean);
  const unique=new Map(); normalized.sort((a,b)=>a.distanceKm-b.distanceKm).forEach(x=>{const key=x.name.toLowerCase();if(!unique.has(key))unique.set(key,x)});
  return [...unique.values()];
}
function normalizeOsmPlace(place,userLat,userLon){
  if(!place.name||!Number.isFinite(place.lat)||!Number.isFinite(place.lng))return null;
  const info=inferInfo(place); if(!info)return null;
  const distanceKm=haversine(userLat,userLon,place.lat,place.lng),menu=buildMenu(info.type),bounds=menuBounds(menu);
  return {id:place.id,name:place.name,type:info.type,group:info.group,distanceKm:+distanceKm.toFixed(2),rating:null,open:place.openNow!==false,address:place.address||'附近店家',tags:[info.softBreakfast?'麵包／輕早餐':'OpenStreetMap 店家'],lat:place.lat,lon:place.lng,menu,priceMin:bounds.min,priceMax:bounds.max,menuSource:'系統估算菜單',source:'OpenStreetMap'};
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
function selectFromMap(id){
  state.selectedId=id;hideNotice();renderResult();updateMap();
  els.resultCard.scrollIntoView({behavior:'smooth',block:'center'});
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
function budgetMatches(x){return state.budget===null||x.menu.some(item=>item.price<=state.budget);}
function getFiltered(){return state.restaurants.filter(x=>(state.category==='全部'||x.group===state.category)&&budgetMatches(x)&&x.distanceKm<=state.maxDistanceKm&&!state.excluded.includes(x.type)&&(!state.openOnly||x.open));}
function makeChip(label,active,onClick,danger=false){const b=document.createElement('button');b.className=`chip${active?' active':''}${danger?' danger':''}`;b.textContent=label;b.onclick=onClick;return b;}
function renderControls(){
  els.categoryChips.innerHTML='';categories.forEach(v=>els.categoryChips.appendChild(makeChip(v,state.category===v,()=>{state.category=v;state.selectedId=null;render()})));
  els.transportChips.innerHTML='';transports.forEach(v=>els.transportChips.appendChild(makeChip(v.label,state.transport===v.id,()=>{state.transport=v.id;render()})));
  els.exclusionChips.innerHTML='';exclusions.forEach(v=>els.exclusionChips.appendChild(makeChip(v,state.excluded.includes(v),()=>{state.excluded=state.excluded.includes(v)?state.excluded.filter(x=>x!==v):[...state.excluded,v];render()},state.excluded.includes(v))));
  els.openOnly.checked=state.openOnly; els.unlimitedBudget.checked=state.budget===null; els.budgetInput.disabled=state.budget===null; els.budgetInput.value=state.budget??''; els.distanceInput.value=state.maxDistanceKm;
}
function chooseRestaurant(){const f=getFiltered();if(!f.length)return showNotice(`目前沒有符合條件的店。可增加距離、切到「全部」，或關閉「只看營業中」。`);const p=f.length>1?f.filter(x=>x.id!==state.selectedId):f;state.selectedId=p[Math.floor(Math.random()*p.length)].id;hideNotice();renderResult();els.resultCard.scrollIntoView({behavior:'smooth',block:'center'});}
function showNotice(m){els.notice.textContent=m;els.notice.classList.remove('hidden');els.resultCard.classList.add('hidden');}
function hideNotice(){els.notice.classList.add('hidden');}
function mapUrl(x){return `https://www.google.com/maps/dir/?api=1&destination=${x.lat},${x.lon}`;}
function menuHtml(x){const rows=x.menu.map(item=>`<div class="menu-row"><span>${escapeHtml(item.name)}</span><b class="${state.budget===null||item.price<=state.budget?'within':''}">$${item.price}</b></div>`).join('');return `<div class="menu-box"><div class="menu-head"><strong>參考菜單</strong><span>${escapeHtml(x.menuSource)}</span></div>${rows}<small>非官方價格，實際價格請以店家現場為準。</small></div>`;}
function renderResult(){
  const x=state.restaurants.find(i=>i.id===state.selectedId);if(!x)return els.resultCard.classList.add('hidden');
  const within=state.budget===null?x.menu.length:x.menu.filter(i=>i.price<=state.budget).length;
  els.resultCard.innerHTML=`<div class="result-eyebrow">今天就吃這間</div><div class="result-heading"><div><h2>${escapeHtml(x.name)}</h2><p>${escapeHtml(x.type)} · ${x.distanceKm} km</p></div><div class="rating">附近</div></div><div class="price-line">${state.budget===null?'預算不限':`${within} 項估算餐點在 $${state.budget} 內`}</div><div class="meta-grid"><div>🧭 ${transportText()}約 ${travelMinutes(x.distanceKm)} 分鐘</div><div>🕒 ${x.open?'營業資訊可用':'目前可能休息'}</div></div><div class="address">${escapeHtml(x.address)}</div><div class="tag-row">${x.tags.map(t=>`<span>${escapeHtml(t)}</span>`).join('')}</div>${menuHtml(x)}<div class="action-row"><button class="secondary-button" id="changeButton">🔄 換一家</button><button class="map-button" id="mapButton">🧭 Google 地圖</button></div>`;
  els.resultCard.classList.remove('hidden');document.getElementById('changeButton').onclick=chooseRestaurant;document.getElementById('mapButton').onclick=()=>window.open(mapUrl(x),'_blank','noopener,noreferrer');updateSelectedMarkerClasses();
}
function renderList(){
  const f=getFiltered();els.nearbyCount.textContent=`${f.length} 間`;els.resultCount.textContent=state.isLive?`${f.length} 間符合：${budgetText()}・${state.maxDistanceKm} km 內`:'目前使用示範店家';els.restaurantList.innerHTML='';
  if(!f.length)els.restaurantList.innerHTML='<div class="empty-list">沒有符合條件的店。早餐可先把距離調到 3～5 公里，再按「重新搜尋」。</div>';
  f.forEach(x=>{const within=state.budget===null?x.menu.length:x.menu.filter(i=>i.price<=state.budget).length,b=document.createElement('button');b.className='restaurant-item';b.innerHTML=`<div><strong>${escapeHtml(x.name)}</strong><span>${escapeHtml(x.type)} · ${state.budget===null?'不限預算':`${within} 項符合預算`}</span><small>${transportText()}約 ${travelMinutes(x.distanceKm)} 分鐘 · ${x.distanceKm} km</small></div><b>${state.budget===null?'查看':`$${x.priceMin}+`}</b>`;b.onclick=()=>{state.selectedId=x.id;hideNotice();renderResult();els.resultCard.scrollIntoView({behavior:'smooth',block:'center'});};els.restaurantList.appendChild(b);});
}
function render(){renderControls();renderList();if(state.selectedId&&!getFiltered().some(x=>x.id===state.selectedId))state.selectedId=null;renderResult();updateMap();}

async function searchAtPosition(){
  if(!state.position)return useLocation();
  state.loading=true;els.locationButton.disabled=true;els.locationButton.textContent='搜尋中…';els.locationText.textContent=`搜尋 ${state.maxDistanceKm} 公里內店家`;
  try{const found=await fetchOsmRestaurants(state.position.lat,state.position.lon,state.maxDistanceKm);if(!found.length)throw new Error('附近找不到已收錄的餐飲店家');state.restaurants=found;state.lastFetchedRadiusKm=state.maxDistanceKm;state.isLive=true;state.selectedId=null;els.locationText.textContent=`找到 ${found.length} 間店家`;hideNotice();}
  catch(e){showNotice(`${e.message}。免費資料服務偶爾忙碌，稍後再試。`);}
  finally{state.loading=false;els.locationButton.disabled=false;els.locationButton.textContent='重新搜尋';render();}
}
function useLocation(){
  if(!navigator.geolocation)return showNotice('這個瀏覽器不支援定位，先使用示範資料。');
  state.loading=true;els.locationButton.disabled=true;els.locationButton.textContent='定位中…';
  navigator.geolocation.getCurrentPosition(p=>{state.position={lat:p.coords.latitude,lon:p.coords.longitude};els.locationTitle.textContent='已取得目前位置';searchAtPosition();},e=>{state.loading=false;els.locationButton.disabled=false;els.locationButton.textContent='再試一次';const m={1:'你拒絕了定位權限，請在瀏覽器設定中允許位置存取。',2:'目前無法取得位置。',3:'定位逾時，請再試一次。'};showNotice(m[e.code]||'定位失敗，先使用示範資料。');},{enableHighAccuracy:true,timeout:12000,maximumAge:300000});
}

els.budgetInput.onchange=e=>{state.budget=Math.max(0,Number(e.target.value)||0);render();};
els.unlimitedBudget.onchange=e=>{state.budget=e.target.checked?null:500;render();};
els.distanceInput.onchange=e=>{state.maxDistanceKm=Math.min(20,Math.max(.3,Number(e.target.value)||2));render();if(state.position&&state.maxDistanceKm>state.lastFetchedRadiusKm)els.locationText.textContent='距離已增加，請按重新搜尋';};
els.openOnly.onchange=e=>{state.openOnly=e.target.checked;render();};els.chooseButton.onclick=chooseRestaurant;els.locationButton.onclick=()=>state.position?searchAtPosition():useLocation();els.fitMapButton.onclick=()=>fitMapToResults(true);initMap();render();
