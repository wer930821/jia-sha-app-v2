const https = require('https');

function send(res,status,body){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=3600, stale-while-revalidate=86400');
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
    const req=https.get(url,{headers:{'User-Agent':'Mozilla/5.0 (compatible; JiaShaMenuBot/1.0; +https://vercel.app)','Accept-Language':'zh-TW,zh;q=0.9,en;q=0.6'}},res=>{
      let data='';
      res.setEncoding('utf8');
      res.on('data',chunk=>{if(data.length<1500000)data+=chunk;});
      res.on('end',()=>res.statusCode>=200&&res.statusCode<400?resolve(data):reject(new Error(`搜尋服務 ${res.statusCode}`)));
    });
    req.setTimeout(7000,()=>req.destroy(new Error('搜尋逾時')));
    req.on('error',reject);
  });
}
function parseResults(html){
  const results=[];
  const blockRe=/<div[^>]+class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;
  let match;
  while((match=blockRe.exec(html))&&results.length<8){
    const block=match[1];
    const link=block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if(!link)continue;
    const snippet=block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)/i);
    const url=unwrapDuckUrl(decode(link[1]));
    if(!/^https?:\/\//i.test(url))continue;
    const host=(()=>{try{return new URL(url).hostname.replace(/^www\./,'')}catch{return'公開網頁'}})();
    results.push({title:decode(link[2]),url,source:host,snippet:snippet?decode(snippet[1]):''});
  }
  return results;
}
module.exports=async function handler(req,res){
  if(req.method!=='GET')return send(res,405,{error:'只接受 GET 請求'});
  const name=String(req.query?.name||'').trim().slice(0,100);
  const address=String(req.query?.address||'').trim().slice(0,120);
  if(!name)return send(res,400,{error:'缺少店家名稱'});
  const area=address.replace(/\d+號.*$/,'').slice(0,35);
  const query=`${name} ${area} 菜單 價目表 menu`;
  try{
    const html=await fetchHtml(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    let results=parseResults(html);
    const preferred=/(facebook\.com|instagram\.com|ubereats\.com|foodpanda|inline\.app|menu|官方|店家)/i;
    results=results.sort((a,b)=>Number(preferred.test(b.url+' '+b.title))-Number(preferred.test(a.url+' '+a.title))).slice(0,6);
    return send(res,200,{query,results});
  }catch(error){
    return send(res,502,{error:'目前無法自動搜尋公開菜單，請稍後再試。',detail:error.message});
  }
};
