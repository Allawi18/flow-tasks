import express from 'express';
import webpush from 'web-push';
import cors from 'cors';

const PUBLIC_KEY = 'BJtLYIFh3zdZdi23L3h0ZdMN4nEh8m0wmTWT8zrX0RfMTUA9XSk718tp972Nwomk8ty2McuOTNdCytfc1b9J7vU';
const PRIVATE_KEY = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgBHqbqimGJ_S234mpXJAUufhhEewf1LFcU23gpY8YvRahRANCAASbS2CBYd83WXYtty94dGXTDeJxIfJtMJk1k_M619EXzE1APV0pO9fLafe9jcKJpPLctjHLjkzXQsrX3NW_Se71';

webpush.setVapidDetails('mailto:3laa337@gmail.com', PUBLIC_KEY, PRIVATE_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// Store subscriptions with their tasks
const clients = new Map();

// ===== API =====
app.get('/', (req, res) => res.send('Flow Push Server OK'));

app.post('/subscribe', (req, res) => {
  const { subscription, deviceId } = req.body;
  if (!subscription) return res.status(400).json({ error: 'missing subscription' });
  const id = deviceId || Date.now().toString();
  clients.set(id, { subscription, tasks: [], notified30: new Set(), notified10: new Set() });
  console.log(`Subscribed: ${id}`);
  res.json({ ok: true, deviceId: id });
});

app.post('/sync', (req, res) => {
  const { deviceId, tasks } = req.body;
  if (!deviceId || !clients.has(deviceId)) return res.status(400).json({ error: 'unknown device' });
  const client = clients.get(deviceId);
  client.tasks = tasks.filter(t => t.dueDateTime && !t.done);
  client.notified30 = new Set();
  client.notified10 = new Set();
  res.json({ ok: true });
});

app.post('/unsubscribe', (req, res) => {
  const { deviceId } = req.body;
  clients.delete(deviceId);
  res.json({ ok: true });
});

// ===== NOTIFICATION CHECKER (every 30s) =====
function sendPush(subscription, title, body) {
  webpush.sendNotification(subscription, JSON.stringify({ title, body }))
    .catch(err => console.error('Push failed:', err.message));
}

function checkTasks() {
  const now = Date.now();
  for (const [id, client] of clients) {
    for (const task of client.tasks) {
      const dueMs = new Date(task.dueDateTime).getTime();
      if (isNaN(dueMs)) continue;

      const diff30 = dueMs - 30 * 60 * 1000;
      const diff10 = dueMs - 10 * 60 * 1000;

      if (!client.notified30.has(task.id) && now >= diff30 && now < dueMs) {
        client.notified30.add(task.id);
        sendPush(client.subscription, '⏰ تذكير بقرب المهمة', `متبقي ٣٠ دقيقة: "${task.text}"`);
      }
      if (!client.notified10.has(task.id) && now >= diff10 && now < dueMs) {
        client.notified10.add(task.id);
        sendPush(client.subscription, '⏰ تذكير أخير', `متبقي ١٠ دقائق: "${task.text}"`);
      }
    }
  }
}

setInterval(checkTasks, 30000);

// ===== START =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Flow server on port ${PORT}`));
