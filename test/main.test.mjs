import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../dist/main.mjs',import.meta.url),'utf8');
test('address-bound USDC.e and Legacy Frax Dollar retain historical identities',async()=>{
 const p={...row(1,'USDC','Polygon','0x2791bca1f2de4661ed88a30c99a7a9449aa84174'),name:'USD Coin (PoS)'};
 const x=await load(fixture([p],'137')),a=(await x.run('137','key'))[0];
 assert.equal(a['Public Name Tag'],'V2 Polygon USDC.e '+label);assert(a['Public Note'].includes('Circle; Polygon PoS Bridge'));
 assert(a['Public Note'].includes('Historical indexed identity: USD Coin (PoS) (USDC)'));
 const e={...row(2,'FRAX','Core','0x853d955acef822db058eb8505911ed77f175b99e'),name:'Frax'};
 const y=await load(fixture([e])),b=(await y.run('1','key'))[0];
 assert.equal(b['Public Name Tag'],'V2 Core Legacy FRAX '+label);assert(b['Public Note'].includes('Legacy Frax Dollar (FRAX)'));
 assert(b['Public Note'].includes('Historical indexed identity: Frax (FRAX)'));assert(b['Public Note'].includes('Frax Finance'));
});
test('exact historical G-UNI assets use Arrakis V1 without changing constituent identity',async()=>{
 const rows=sorted([
  {...row(1,'AmmGUniDAIUSDC','AMM','0x50379f632ca68d36e50cfbc8f78fe16bd1499d1e'),name:'Gelato Uniswap LP'},
  {...row(2,'AmmGUniUSDCUSDT','AMM','0xd2eec91055f07fe24c9ccb25828ecfefd4be0c41'),name:'Gelato Uniswap LP'},
 ]);
 const x=await load(fixture(rows)),tags=await x.run('1','key');
 assert(tags.some(t=>t['Public Name Tag']==='V2 AMM ArrakisV1DAIUSDC '+label));assert(tags.some(t=>t['Public Name Tag']==='V2 AMM ArrakisV1USDCUSDT '+label));
 assert(tags.every(t=>t['Public Note'].includes('Arrakis V1 (formerly G-UNI); Gelato; Uniswap V3.')));
 assert(tags.every(t=>t['Public Note'].includes('Historical indexed identity: Gelato Uniswap LP (AmmGUni')));
 assert(!tags.some(t=>t['Public Name Tag'].includes('USDT0')));
});

const field='vToken', label='Variable Debt';
const deployments={1:'QmdEuhCPTFx5q1Vf7jPQDVGQDpC34KYry82yb3NPc9sK6a',137:'QmNfojj4Wu1DErB9iC6epPZc4K2zQCrm4KJUra3DMQqSNm'};
const markets={
 Core:{provider:'0xb53c1a33016b2dc2ff3653530bff1848a515c8c5',pool:'0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9'},
 AMM:{provider:'0xacc030ef66f9dfeae9cbb0cd1b25654b82cfa8d5',pool:'0x7937d4799803fbbe595ed57278bc4ca21f3bffcb'},
 Polygon:{provider:'0xd05e3e715d945b59290df0ae8ef85c1bdb684744',pool:'0x8dff5e27ea6b7ac08ebfdf9eb090f32ee9a30fcf'},
};
const hash='0x'+'ab'.repeat(32),addr=n=>'0x'+n.toString(16).padStart(40,'0');
const meta=(chain='1')=>({deployment:deployments[chain],hasIndexingErrors:false,block:{number:1000,hash}});
function row(i=1,symbol='WETH',market='Core',asset=addr(i)){
 const m=markets[market];return{id:asset+m.provider,name:'Wrapped Ether',symbol,underlyingAsset:asset,isFrozen:true,borrowingEnabled:false,stableBorrowRateEnabled:false,[field]:{id:addr(i+10000)},pool:{id:m.provider,lendingPool:m.pool}};
}
async function load(handler){
 const calls=[];
 const mock=async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return handler(body,calls.length);};
 const context=vm.createContext({AbortController,setTimeout,clearTimeout});
 const dependency=new vm.SyntheticModule(['default'],function(){this.setExport('default',mock);},{context});
 const module=new vm.SourceTextModule(code,{context});
 await module.link(specifier=>{assert.equal(specifier,'node-fetch');return dependency;});await module.evaluate();
 return{run:module.namespace.returnTags,calls,exports:Object.keys(module.namespace)};
}
const response=data=>({ok:true,json:async()=>({data})});
const fixture=(rows,chain='1',extra={})=>async(body,n)=>response(n===1?{_meta:meta(chain)}:{_meta:meta(chain),reserves:rows,...extra});
const sorted=rows=>rows.sort((a,b)=>a.id.localeCompare(b.id));
test('exactly one exported async function with two arguments',async()=>{
 const x=await load(fixture([row()]));assert.deepEqual(x.exports,['returnTags']);assert.equal(x.run.length,2);assert.equal(x.run.constructor.name,'AsyncFunction');
});
test('unsupported chains and invalid keys fail before any retrieval',async()=>{
 for(const chain of ['56','01','0x1','__proto__',1,null]){const x=await load(fixture([row()]));await assert.rejects(x.run(chain,'key'),/Unsupported/);assert.equal(x.calls.length,0);}
 for(const key of ['',null,' white space ','line\nbreak']){const x=await load(fixture([row()]));await assert.rejects(x.run('1',key),/API key/);assert.equal(x.calls.length,0);}
});
test('selected role and only selected role comes dynamically from Graph',async()=>{
 const x=await load(fixture([row()])),[tag]=await x.run('1','test-key');
 assert.equal(tag['Contract Address'],'eip155:1:'+addr(10001));assert.equal(tag['Public Name Tag'],'V2 Core WETH '+label);
 assert.equal(tag['Project Name'],'Aave');assert.equal(tag['UI/Website Link'],'https://app.aave.com/');assert.match(tag['Public Note'],/token/);
 const query=x.calls[1].body.query;assert(query.includes(field+' { id }'));
 for(const f of ['aToken','vToken','sToken'].filter(f=>f!==field))assert(!query.includes(f+' {'));
 assert(!query.includes('skip:'));assert(!query.includes('isActive:'));assert(!query.includes('isFrozen:'));assert(!query.includes('totalSupply'));
 assert.equal(x.calls[0].url,'https://gateway.thegraph.com/api/deployments/id/'+deployments[1]);
 assert.equal(x.calls[0].options.headers.authorization,'Bearer test-key');assert(!x.calls[0].url.includes('test-key'));assert.equal(x.calls[1].body.variables.block.hash,hash);
 assert.equal(x.calls[0].options.redirect,'error');assert.equal(x.calls[0].options.size,16000000);
});
test('Core and AMM identical underlyings are distinct contracts and names',async()=>{
 const rows=sorted([row(1,'WETH','Core'),row(2,'AmmWETH','AMM',addr(1))]),x=await load(fixture(rows)),tags=await x.run('1','key');
 assert.equal(tags.length,2);assert.equal(new Set(tags.map(t=>t['Contract Address'])).size,2);
 assert.deepEqual(new Set(tags.map(t=>t['Public Name Tag'])),new Set(['V2 Core WETH '+label,'V2 AMM WETH '+label]));
 assert(tags.every(t=>t['Public Note'].includes('underlying '+addr(1))));
});
test('Polygon uses its own deployment/provider and EVM namespace',async()=>{
 const x=await load(fixture([row(1,'USDC','Polygon')],'137')),[tag]=await x.run('137','key');
 assert.equal(tag['Contract Address'],'eip155:137:'+addr(10001));assert.equal(tag['Public Name Tag'],'V2 Polygon USDC '+label);assert(x.calls.every(c=>c.url.endsWith(deployments[137])));
});
test('cursor pagination beyond 1000 reserves is complete and hash-pinned',async()=>{
 const first=Array.from({length:1000},(_,i)=>row(i+1,'ASSET'+(i+1)));
 const x=await load(async(body,n)=>response(n===1?{_meta:meta()}:{_meta:meta(),reserves:n===2?first:[row(1001,'ASSET1001')]}));
 assert.equal((await x.run('1','key')).length,1001);assert.equal(x.calls[2].body.variables.last,first.at(-1).id);assert.equal(x.calls[2].body.variables.block.hash,hash);
});
test('null historical metadata hash is permitted only with a hash-pinned page',async()=>{
 const x=await load(fixture([row()],'1',{_meta:{...meta(),block:{number:1000,hash:null}}}));
 assert.equal((await x.run('1','key')).length,1);assert.equal(x.calls[1].body.variables.block.hash,hash);
 const y=await load(async()=>response({_meta:{...meta(),block:{number:1000,hash:null}}}));await assert.rejects(y.run('1','key'),/snapshot hash/);
});
test('frozen, inactive and zero-supply accounting roles are not excluded',async()=>{
 const r={...row(),isActive:false,totalSupply:'0'},x=await load(fixture([r]));const [tag]=await x.run('1','key');
 assert.match(tag['Public Note'],/Legacy frozen reserve/);assert.match(tag['Public Note'],/Does not imply new borrowing is enabled or a balance is outstanding/);
 assert.match(tag['Public Note'],/non-transferable variable-debt accounting token/);
});
test('nonfrozen future metadata does not make a borrowing or balance claim',async()=>{
 const x=await load(fixture([{...row(),isFrozen:false,borrowingEnabled:true}]));assert.match((await x.run('1','key'))[0]['Public Note'],/Legacy Aave V2 reserve/);
});
test('empty, malformed and zero-address output fails closed',async()=>{
 for(const rows of [[],null,[{...row(),[field]:null}],[{...row(),[field]:{id:addr(0)}}],[{...row(),underlyingAsset:addr(0)}],[{...row(),isFrozen:'true'}],[{...row(),symbol:''}],[{...row(),name:null}]]){
  const x=await load(fixture(rows));await assert.rejects(x.run('1','key'));
 }
});
test('unknown/mismatched market and composite reserve identity fail closed',async()=>{
 for(const r of [{...row(),pool:{id:addr(9000),lendingPool:addr(9001)}},{...row(),pool:{id:markets.Core.provider,lendingPool:addr(9001)}},{...row(),id:addr(1)},{...row(),id:addr(2)+markets.Core.provider}]){
  const x=await load(fixture([r]));await assert.rejects(x.run('1','key'),/reserve-market/);
 }
 const x=await load(fixture([row(1,'A','Polygon')]));await assert.rejects(x.run('1','key'),/reserve-market/);
});
test('strict cursor order and conflicting same-role associations fail',async()=>{
 for(const rows of [[row(),row()],[row(2,'B'),row(1,'A')],[row(1,'A'),{...row(2,'B'),[field]:{id:addr(10001)}}]]){
  const x=await load(fixture(rows));await assert.rejects(x.run('1','key'));
 }
});
test('wrong deployment, indexing errors and changed snapshot never return partial output',async()=>{
 for(const change of [{deployment:'wrong'},{hasIndexingErrors:true},{block:{number:999,hash}},{block:{number:1000,hash:'0x'+'cd'.repeat(32)}},{block:{number:1000,hash:'bad'}}]){
  const x=await load(fixture([row()],'1',{_meta:{...meta(),...change}}));await assert.rejects(x.run('1','key'));
 }
});
test('HTTP, query and malformed retrieval errors never echo provider credential data',async()=>{
 for(const payload of [
  async()=>({ok:false,status:403,json:async()=>({secret:'private-key'})}),
  async()=>({ok:true,json:async()=>({data:{reserves:[row()]},errors:[{message:'private-key'}]})}),
  async()=>({ok:true,json:async()=>({errors:'private-key'})}),
  async()=>{throw Error('private-key');},
  async()=>({ok:true,json:async()=>({})}),
 ]){
  const x=await load(payload);await assert.rejects(x.run('1','private-key'),e=>!e.message.includes('private-key'));
 }
});
test('plain-text names are <=50 and post-format collisions throw',async()=>{
 const x=await load(fixture([{...row(1,'THISISAREALLYLONGASSETNAME123456789012345678901234567890'),name:'<b>Wrapped `Ether`</b>'}]));
 const [tag]=await x.run('1','key');assert(tag['Public Name Tag'].length<=50);assert(!/[<>`]/.test(tag['Public Note']));assert(!/[<>`]/.test(tag['Public Name Tag']));
 for(const rows of [[row(1,'SAME*'),row(2,'SAME_')],[row(1,'Case'),row(2,'CASE')],[row(1,'Long'.repeat(30)+'A'),row(2,'Long'.repeat(30)+'B')]]){
  const y=await load(fixture(rows));await assert.rejects(y.run('1','key'),/Ambiguous/);
 }
});
test('USDP, KNCL and wrapped USTC are bound to exact Ethereum assets',async()=>{
 const rows=sorted([
  {...row(1,'PAX','Core','0x8e870d67f660d95d5be530380d0ec0bd388289e1'),name:'Paxos Standard'},
  {...row(2,'KNC','Core','0xdd974d5c2e2928dea5f71b9825b8b646686bd200'),name:'Kyber Network Crystal'},
  {...row(3,'UST','Core','0xa693b19d2931d498c5b318df961919bb4aee87a5'),name:'UST (Wormhole)'},
 ]);
 const x=await load(fixture(rows)),tags=await x.run('1','key');
 for(const symbol of ['USDP','KNCL','USTC'])assert(tags.some(t=>t['Public Name Tag']==='V2 Core '+symbol+' '+label));
 assert(tags.every(t=>t['Public Note'].includes('Historical indexed identity:')));
 assert(tags.find(t=>t['Public Name Tag'].includes('USTC'))['Public Note'].includes('Terra Classic; Wormhole.'));
});
test('Polygon WPOL/USDT0 keep historical names without changing accounting addresses',async()=>{
 const rows=sorted([
  {...row(1,'WMATIC','Polygon','0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'),name:'Wrapped Matic'},
  {...row(2,'USDT','Polygon','0xc2132d05d31c914a87c6611c10748aeb04b58e8f'),name:'(PoS) Tether USD'},
 ]);
 const x=await load(fixture(rows,'137')),tags=await x.run('137','key');
 assert.equal(tags.length,2);assert(tags.some(t=>t['Public Name Tag']==='V2 Polygon WPOL '+label));assert(tags.some(t=>t['Public Name Tag']==='V2 Polygon USDT0 '+label));
 const usdt0=tags.find(t=>t['Public Name Tag'].includes('USDT0'));assert.match(usdt0['Public Note'],/Tether; USDT0; LayerZero/);assert(!usdt0['Public Note'].includes('Polygon PoS'));assert.match(usdt0['Public Note'],/Historical indexed identity: \(PoS\) Tether USD \(USDT\)/);
 assert.equal(usdt0['Contract Address'],'eip155:137:'+addr(10002));
});
test('rebrands are never inferred from a ticker or wrong chain',async()=>{
 const x=await load(fixture([row(1,'PAX'),row(2,'KNC'),row(3,'UST'),row(4,'WMATIC'),row(5,'USDT')]));
 const tags=await x.run('1','key');assert(!tags.some(t=>/USDP|KNCL|USTC|WPOL|USDT0/.test(t['Public Name Tag'])));
 const r=row(1,'USDT','Core','0xc2132d05d31c914a87c6611c10748aeb04b58e8f');const y=await load(fixture([r]));assert(!(await y.run('1','key'))[0]['Public Note'].includes('USDT0'));
});
test('AMM LP families retain historical constituent labels and name all related protocols',async()=>{
 const x=await load(fixture([row(1,'AmmUniDAIWETH','AMM'),row(2,'AmmBptBALWETH','AMM'),row(3,'AmmGUniUSDCUSDT','AMM')]));
 const tags=await x.run('1','key');assert.match(tags[0]['Public Note'],/^Aave; Uniswap V2\./);assert.match(tags[1]['Public Note'],/^Aave; Balancer\./);assert.match(tags[2]['Public Note'],/^Aave; Gelato; Uniswap V3\./);
 assert.equal(tags[0]['Public Name Tag'],'V2 AMM UniDAIWETH '+label);assert(!tags[2]['Public Name Tag'].includes('USDT0'));
});
