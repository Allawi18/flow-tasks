var VAPID_PUBLIC = 'BJtLYIFh3zdZdi23L3h0ZdMN4nEh8m0wmTWT8zrX0RfMTUA9XSk718tp972Nwomk8ty2McuOTNdCytfc1b9J7vU';
var VAPID_PRIVATE = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgBHqbqimGJ_S234mpXJAUufhhEewf1LFcU23gpY8YvRahRANCAASbS2CBYd83WXYtty94dGXTDeJxIfJtMJk1k_M619EXzE1APV0pO9fLafe9jcKJpPLctjHLjkzXQsrX3NW_Se71';

function hash(str) {
  var h = 0;
  for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

async function handleRequest(request) {
  var url = new URL(request.url);
  var cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Content-Type' };
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  var kv = FLOW_KV;

  try {
    if (url.pathname === '/') {
      var count = (await kv.list({ prefix: 'sub:' })).keys.length;
      return new Response('Flow Push OK | ' + count + ' devices', { headers: cors });
    }

    if (url.pathname === '/subscribe' && request.method === 'POST') {
      var body = await request.json();
      var subscription = body.subscription;
      var deviceId = body.deviceId;
      if (!subscription) return new Response('no sub', { status: 400, headers: cors });
      var id = deviceId || crypto.randomUUID();
      var subHash = hash(subscription.endpoint);
      await kv.put('sub:' + subHash, JSON.stringify(subscription));
      await kv.put('id:' + subHash, id);
      await kv.put('tasks:' + subHash, '[]');
      return new Response(JSON.stringify({ ok: true, deviceId: id }), { headers: cors });
    }

    if (url.pathname === '/sync' && request.method === 'POST') {
      var body = await request.json();
      var deviceId = body.deviceId;
      var tasks = body.tasks;
      if (!deviceId) return new Response('no id', { status: 400, headers: cors });
      var list = await kv.list({ prefix: 'id:' });
      var subHash = null;
      for (var i = 0; i < list.keys.length; i++) {
        var val = await kv.get(list.keys[i].name);
        if (val === deviceId) { subHash = list.keys[i].name.replace('id:', ''); break; }
      }
      if (!subHash) return new Response('device not found', { status: 404, headers: cors });
      var dueTasks = [];
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i].dueDateTime) dueTasks.push(tasks[i]);
      }
      await kv.put('tasks:' + subHash, JSON.stringify(dueTasks));
      return new Response(JSON.stringify({ ok: true }), { headers: cors });
    }

    if (url.pathname === '/pending' && request.method === 'GET') {
      var ep = url.searchParams.get('ep');
      if (!ep) return new Response('{}', { headers: cors });
      var subHash = hash(decodeURIComponent(ep));
      var pend = await kv.get('pend:' + subHash);
      if (pend) {
        await kv.delete('pend:' + subHash);
        return new Response(pend, { headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { headers: cors });
    }

    if (url.pathname === '/check') {
      var list = await kv.list({ prefix: 'sub:' });
      var checked = 0;

      for (var i = 0; i < list.keys.length; i++) {
        var key = list.keys[i];
        var subHash = key.name.replace('sub:', '');
        var subRaw = await kv.get(key.name);
        if (!subRaw) continue;
        var tasksRaw = await kv.get('tasks:' + subHash);
        var tasks = JSON.parse(tasksRaw || '[]');
        var sub = JSON.parse(subRaw);
        var now = Date.now();
        var notification = null;

        for (var j = 0; j < tasks.length; j++) {
          var t = tasks[j];
          var dueMs = new Date(t.dueDateTime).getTime();
          if (isNaN(dueMs)) continue;
          if (!t._n30 && now >= dueMs - 1800000 && now < dueMs) {
            t._n30 = true; notification = { title: 'تذكير بقرب المهمة', body: 'متبقي 30 دقيقة: "' + t.text + '"' };
          }
          if (!notification && !t._n10 && now >= dueMs - 600000 && now < dueMs) {
            t._n10 = true; notification = { title: 'تذكير أخير', body: 'متبقي 10 دقائق فقط: "' + t.text + '"' };
          }
        }

        if (notification) {
          await kv.put('pend:' + subHash, JSON.stringify(notification));
          await kv.put('tasks:' + subHash, JSON.stringify(tasks));
          sendWakeup(sub);
        }
        checked++;
      }
      return new Response(JSON.stringify({ ok: true, checked: checked }), { headers: cors });
    }

    return new Response('Not found', { status: 404, headers: cors });
  } catch (e) {
    return new Response(e.message, { status: 500, headers: cors });
  }
}

async function sendWakeup(sub) {
  try {
    var now = Math.floor(Date.now() / 1000);
    var origin = new URL(sub.endpoint).origin;
    function b64(s) { return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
    var header = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    var payload = b64(JSON.stringify({ aud: origin, exp: now + 86400, sub: 'mailto:3laa337@gmail.com' }));
    var keyStr = VAPID_PRIVATE.replace(/_/g,'/').replace(/-/g,'+');
    var keyBytes = Uint8Array.from(atob(keyStr), function(c) { return c.charCodeAt(0); });
    var key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    var sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(header + '.' + payload));
    var sigStr = '';
    var u8 = new Uint8Array(sig);
    for (var i = 0; i < u8.length; i++) { sigStr += String.fromCharCode(u8[i]); }
    var sigB64 = b64(sigStr);
    var token = header + '.' + payload + '.' + sigB64;

    await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'vapid t=' + token + ', k=' + VAPID_PUBLIC,
        'TTL': '86400',
        'Urgency': 'normal'
      }
    });
  } catch(e) {}
}

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});
