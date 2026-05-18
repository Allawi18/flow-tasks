// Flow Push Worker — Cloudflare Workers (free, no card)
// 1. Create KV namespace named FLOW_KV
// 2. Deploy to Cloudflare Workers
// 3. Set cron-job.org → /check every 30s

const VAPID_PUBLIC = 'BJtLYIFh3zdZdi23L3h0ZdMN4nEh8m0wmTWT8zrX0RfMTUA9XSk718tp972Nwomk8ty2McuOTNdCytfc1b9J7vU';
const VAPID_PRIVATE = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgBHqbqimGJ_S234mpXJAUufhhEewf1LFcU23gpY8YvRahRANCAASbS2CBYd83WXYtty94dGXTDeJxIfJtMJk1k_M619EXzE1APV0pO9fLafe9jcKJpPLctjHLjkzXQsrX3NW_Se71';

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    const kv = env.FLOW_KV;

    try {
      if (url.pathname === '/') {
        const count = (await kv.list({ prefix: 'sub:' })).keys.length;
        return new Response(`Flow Push OK | ${count} devices`, { headers: cors });
      }

      // Register device
      if (url.pathname === '/subscribe' && request.method === 'POST') {
        const { subscription, deviceId } = await request.json();
        if (!subscription) return new Response('no sub', { status: 400, headers: cors });
        const id = deviceId || crypto.randomUUID();
        const subHash = hash(subscription.endpoint);
        await kv.put(`sub:${subHash}`, JSON.stringify(subscription));
        await kv.put(`id:${subHash}`, id);
        await kv.put(`tasks:${subHash}`, '[]');
        return new Response(JSON.stringify({ ok: true, deviceId: id }), { headers: cors });
      }

      // Sync tasks
      if (url.pathname === '/sync' && request.method === 'POST') {
        const { deviceId, tasks } = await request.json();
        if (!deviceId) return new Response('no id', { status: 400, headers: cors });
        // Find subHash by deviceId
        const list = await kv.list({ prefix: 'id:' });
        let subHash = null;
        for (const k of list.keys) {
          if (await kv.get(k.name) === deviceId) { subHash = k.name.replace('id:', ''); break; }
        }
        if (!subHash) return new Response('device not found', { status: 404, headers: cors });
        await kv.put(`tasks:${subHash}`, JSON.stringify(tasks.filter(t => t.dueDateTime)));
        return new Response(JSON.stringify({ ok: true }), { headers: cors });
      }

      // SW fetches pending notif by endpoint hash
      if (url.pathname === '/pending' && request.method === 'GET') {
        const ep = url.searchParams.get('ep');
        if (!ep) return new Response('{}', { headers: cors });
        const subHash = hash(decodeURIComponent(ep));
        const pend = await kv.get(`pend:${subHash}`);
        if (pend) {
          await kv.delete(`pend:${subHash}`);
          return new Response(pend, { headers: { ...cors, 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { headers: cors });
      }

      // Cron check every 30s
      if (url.pathname === '/check') {
        const list = await kv.list({ prefix: 'sub:' });
        let checked = 0;

        for (const key of list.keys) {
          const subHash = key.name.replace('sub:', '');
          const [subRaw, tasksRaw] = await Promise.all([kv.get(key.name), kv.get(`tasks:${subHash}`)]);
          if (!subRaw) continue;

          const tasks = JSON.parse(tasksRaw || '[]');
          const sub = JSON.parse(subRaw);
          const now = Date.now();
          let notification = null;

          for (const t of tasks) {
            const dueMs = new Date(t.dueDateTime).getTime();
            if (isNaN(dueMs)) continue;
            if (!t._n30 && now >= dueMs - 1800000 && now < dueMs) {
              t._n30 = true; notification = { title: '⏰ تذكير بقرب المهمة', body: `متبقي ٣٠ دقيقة: "${t.text}"` };
            }
            if (!notification && !t._n10 && now >= dueMs - 600000 && now < dueMs) {
              t._n10 = true; notification = { title: '⏰ تذكير أخير', body: `متبقي ١٠ دقائق فقط: "${t.text}"` };
            }
          }

          if (notification) {
            await kv.put(`pend:${subHash}`, JSON.stringify(notification));
            await kv.put(`tasks:${subHash}`, JSON.stringify(tasks));
            this.sendWakeup(sub);
          }
          checked++;
        }
        return new Response(JSON.stringify({ ok: true, checked }), { headers: cors });
      }

      return new Response('Not found', { status: 404, headers: cors });
    } catch (e) {
      return new Response(e.message, { status: 500, headers: cors });
    }
  },

  async sendWakeup(sub) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const origin = new URL(sub.endpoint).origin;
      const b64 = s => btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
      const header = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
      const payload = b64(JSON.stringify({ aud: origin, exp: now + 86400, sub: 'mailto:3laa337@gmail.com' }));
      const keyBytes = Uint8Array.from(atob(VAPID_PRIVATE.replace(/_/g,'/').replace(/-/g,'+')), c => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
      const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(header + '.' + payload));
      const sigB64 = b64(String.fromCharCode(...new Uint8Array(sig)));
      const token = `${header}.${payload}.${sigB64}`;

      await fetch(sub.endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `vapid t=${token}, k=${VAPID_PUBLIC}`,
          'TTL': '86400', 'Urgency': 'normal',
        },
      });
    } catch(e) {}
  },
};
