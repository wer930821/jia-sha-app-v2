const https = require('https');

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=86400');
  res.end(JSON.stringify(body));
}
function decode(value=''){
  return value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#x27;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
}
function unwrapDuckUrl(url=''){
  try{
    if(url.startsWith('//'))url='https:'+url;
    const parsed=new URL(url);
    const uddg=parsed.searchParams.get('uddg');
    return uddg?decodeURIComponent(uddg):url;
  }catch{return url;}
}
function fetchHtml(url){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; JiaShaMenuBot/1.1)','Accept-Language':'zh-TW,zh;q=0.9,en;q=0.6'}},res=>{
      let data='';
      res.setEncoding('utf8');
      res.on('data',chunk=>{if(data.length<900000)data+=chunk;});
      res.on('end',()=>res.statusCode>=200&&res.statusCode<400?resolve(data):reject(new Error(`搜尋服務 ${res.statusCode}`)));
    });
    req.setTimeout(5500,()=>req.destroy(new Error('搜尋逾時')));
    req.on('error',reject);
  });
}
function parseResults(html){
  const results=[];
  const blockRe=/<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let block;
  while((block=blockRe.exec(html))&&results.length<8){
    const body=block[1];
    const link=body.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if(!link)continue;
    const url=unwrapDuckUrl(decode(link[1]));
    if(!/^https?:\/\//i.test(url))continue;
    const snippetMatch=body.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\//i);
    const host=(()=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return'公開網頁'}})();
    results.push({title:decode(link[2]),url,source:host,snippet:decode(snippetMatch?.[1]||'')});
  }
  if(results.length)return results;
  const linkRe=/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while((match=linkRe.exec(html))&&results.length<6){
    const url=unwrapDuckUrl(decode(match[1]));
    if(!/^https?:\/\//i.test(url))continue;
    const host=(()=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return'公開網頁'}})();
    results.push({title:decode(match[2]),url,source:host,snippet:''});
  }
  return results;
}
function detectClosed(results,html=''){
  const text=[...results.map(r=>`${r.title} ${r.snippet}`),decode(html.slice(0,250000))].join(' ');
  const closed=/(永久歇業|已歇業|停止營業|結束營業|已關閉|永久關閉|歇業多年|closed permanently|permanently closed)/i.test(text);
  const uncertain=/(疑似歇業|可能歇業|暫停營業|暫時停業|搬遷|已搬家)/i.test(text);
  return {closed,uncertain};
}
function fallbackLinks(name,area){
  const query=`${name} ${area} 菜單 價目表`;
  const encoded=encodeURIComponent(query);
  const fb=encodeURIComponent(`${name} ${area} 菜單`);
  const delivery=encodeURIComponent(`${name} ${area}`);
  return [
    {title:`Google 搜尋「${name} 菜單」`,url:`https://www.google.com/search?q=${encoded}`,source:'Google 搜尋',snippet:'搜尋官方菜單、價目表與菜單照片'},
    {title:`Bing 搜尋「${name} 菜單」`,url:`https://www.bing.com/search?q=${encoded}`,source:'Bing 搜尋',snippet:'查看公開網站與菜單圖片'},
    {title:`Facebook 搜尋店家菜單`,url:`https://www.facebook.com/search/top?q=${fb}`,source:'Facebook',snippet:'店家粉專常會放菜單照片'},
    {title:`Uber Eats 搜尋店家`,url:`https://www.ubereats.com/tw/search?q=${delivery}`,source:'Uber Eats',snippet:'有上架時可查看品項與價格'},
    {title:`foodpanda 搜尋店家`,url:`https://www.foodpanda.com.tw/restaurants/new?query=${delivery}`,source:'foodpanda',snippet:'有上架時可查看品項與價格'}
  ];
}
module.exports=async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'只接受 GET 請求'});
  const name=String(req.query?.name||'').trim().slice(0,100);
  const address=String(req.query?.address||'').trim().slice(0,120);
  if(!name)return send(res,400,{error:'缺少店家名稱'});
  const area=address.replace(/\d+號.*$/,'').slice(0,35);
  const query=`${name} ${area} 菜單 價目表 menu`;
  const fallbacks=fallbackLinks(name,area);
  try{
    const html=await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    const parsed=parseResults(html);
    const preferred=/(facebook\.com|instagram\.com|ubereats\.com|foodpanda|inline\.app|menu|菜單|價目表|官方)/i;
    const results=parsed.sort((a,b)=>Number(preferred.test(b.url+' '+b.title))-Number(preferred.test(a.url+' '+a.title))).slice(0,5);
    const businessStatus=detectClosed(parsed,html);
    return send(res,200,{query,results:results.length?results:fallbacks,fallback:results.length===0,businessStatus});
  }catch(error){
    return send(res,200,{query,results:fallbacks,fallback:true,notice:'自動擷取暫時失敗，已改提供可直接開啟的菜單搜尋。'});
  }
};
