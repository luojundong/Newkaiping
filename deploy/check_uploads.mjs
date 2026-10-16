import { Client } from 'ssh2'

const HOST = '117.21.178.39', USER = 'useroot', PASS = '1qazxdr5'
const client = new Client()

function exec(cmd) {
  return new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream.on('close', (code) => resolve({ code, out: out.trim() }))
      stream.on('data', (d) => (out += d.toString()))
      stream.stderr.on('data', (d) => (out += d.toString()))
    })
  })
}

client.on('ready', async () => {
  try {
    const r = await exec('ls -la /home/useroot/apps/kp/uploads/ | tail -20')
    console.log(r.out)
    const r2 = await exec('find /home/useroot/apps/kp/uploads -name "*msh8*" -o -name "*panorama*" 2>/dev/null | head')
    console.log('find:', r2.out)
  } catch (e) {
    console.error(e)
  } finally {
    client.end()
  }
})
client.connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 })
