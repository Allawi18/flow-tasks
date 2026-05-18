import json, os, time, threading
from flask import Flask, request, jsonify
from flask_cors import CORS
from pywebpush import webpush, WebPushException

PUBLIC_KEY = 'BJtLYIFh3zdZdi23L3h0ZdMN4nEh8m0wmTWT8zrX0RfMTUA9XSk718tp972Nwomk8ty2McuOTNdCytfc1b9J7vU'
PRIVATE_KEY = 'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgBHqbqimGJ_S234mpXJAUufhhEewf1LFcU23gpY8YvRahRANCAASbS2CBYd83WXYtty94dGXTDeJxIfJtMJk1k_M619EXzE1APV0pO9fLafe9jcKJpPLctjHLjkzXQsrX3NW_Se71'

app = Flask(__name__)
CORS(app)

clients = {}
last_active = time.time()

@app.route('/')
def index():
    return f'Flow Push OK | Clients: {len(clients)} | Active: {int(time.time() - last_active)}s ago'

@app.route('/subscribe', methods=['POST'])
def subscribe():
    data = request.get_json()
    sub = data.get('subscription')
    if not sub: return jsonify({'error': 'missing subscription'}), 400
    import uuid
    did = data.get('deviceId') or str(uuid.uuid4())
    clients[did] = {'subscription': sub, 'tasks': [], 'notified30': set(), 'notified10': set()}
    return jsonify({'ok': True, 'deviceId': did})

@app.route('/sync', methods=['POST'])
def sync():
    data = request.get_json()
    did = data.get('deviceId')
    if not did or did not in clients: return jsonify({'error': 'unknown device'}), 400
    clients[did]['tasks'] = [t for t in data.get('tasks', []) if t.get('dueDateTime')]
    clients[did]['notified30'] = set()
    clients[did]['notified10'] = set()
    return jsonify({'ok': True})

@app.route('/ping', methods=['GET'])
def ping():
    global last_active
    last_active = time.time()
    return 'pong'

def send_push(sub, title, body):
    try:
        webpush(
            subscription_info=sub,
            data=json.dumps({'title': title, 'body': body}),
            vapid_private_key=PRIVATE_KEY,
            vapid_claims={'sub': 'mailto:3laa337@gmail.com'}
        )
    except Exception as e:
        print(f'Push failed: {e}')

def checker():
    while True:
        time.sleep(30)
        now = time.time() * 1000
        for did, c in list(clients.items()):
            for t in c['tasks']:
                try:
                    due_ms = int(t['dueDateTime'])
                except:
                    try:
                        from datetime import datetime
                        due_ms = datetime.fromisoformat(t['dueDateTime']).timestamp() * 1000
                    except:
                        continue
                diff30 = due_ms - 30 * 60 * 1000
                diff10 = due_ms - 10 * 60 * 1000
                tid = t.get('id')
                if tid not in c['notified30'] and diff30 <= now < due_ms:
                    c['notified30'].add(tid)
                    send_push(c['subscription'], '⏰ تذكير بقرب المهمة', f'متبقي ٣٠ دقيقة: "{t["text"]}"')
                if tid not in c['notified10'] and diff10 <= now < due_ms:
                    c['notified10'].add(tid)
                    send_push(c['subscription'], '⏰ تذكير أخير', f'متبقي ١٠ دقائق: "{t["text"]}"')

threading.Thread(target=checker, daemon=True).start()

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
