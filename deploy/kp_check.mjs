// 诊断服务器状态：端口/进程/start.sh 内容。
import { Client } from 'ssh2'
const HOST='117.21.178.39',USER='useroot',PASS='1qazxdr5'
const DIR='/home/useroot/apps/kp'
const c=new Client()
function exec(cmd){return new Promise((res,rej)=>{c.exec(`sh -lc ${JSON.stringify(cmd)}`,(e,s)=>{if(e)return rej(e);let o='',d=false;const f=(code)=>{if(!d){d=true;res({code,out:o.trim()})}};s.on('close',f);s.on('data',x=>o+=x);s.stderr.on('data',x=>o+=x);setTimeout(()=>f(-1),30000)})})}
c.on('ready',async()=>{
  try{
    console.log('=== 端口 5168 ==='); console.log((await exec(`ss -tlnp 2>/dev/null | grep -E ':5168' || echo NO_LISTEN`)).out)
    console.log('=== node 进程 ==='); console.log((await exec(`ps aux | grep -E 'node dist/main' | grep -v grep || echo NO_PROC`)).out)
    console.log('=== start.sh 内容 ==='); console.log((await exec(`cat ${DIR}/start.sh`)).out)
    console.log('=== dist/main.js 存在? ==='); console.log((await exec(`ls -la ${DIR}/dist/main.js ${DIR}/public/web/index.html`)).out)
  }catch(e){console.log('ERR',e.message)}finally{c.end()}
})
c.on('error',e=>{console.log('SSH',e.message);process.exit(1)})
c.connect({host:HOST,port:22,username:USER,password:PASS,readyTimeout:20000,algorithms:{kex:undefined,cipher:undefined,serverHostKey:undefined,hmac:undefined,compress:undefined}})
