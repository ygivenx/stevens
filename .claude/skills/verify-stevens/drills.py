#!/usr/bin/env python3
import json, os, shutil, signal, subprocess, sys, time, urllib.request, urllib.error

ROOT = os.getcwd()
BASE = '/tmp/stevens-verify/drill15'
DATA = BASE + '/data'
FIRM, PERS = 18887, 18888
PASS, FAIL = 0, 0

def check(name, cond, detail=''):
    global PASS, FAIL
    if cond:
        print('PASS', name); PASS += 1
    else:
        print('FAIL', name, detail); FAIL += 1

def http(method, port, path, data=None, viewer=None, timeout=40):
    url = 'http://localhost:%d%s' % (port, path)
    body = json.dumps(data).encode() if data is not None else None
    headers = {}
    if data is not None: headers['Content-Type'] = 'application/json'
    if viewer: headers['X-Viewer-Id'] = viewer
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()

def state(port, viewer=None):
    s, b = http('GET', port, '/api/state', viewer=viewer)
    assert s == 200, 'state %d' % s
    return json.loads(b)

def set_fake(side, mode):
    with open('%s/%s/meta-fake.json' % (DATA, side), 'w') as f:
        json.dump({'mode': mode}, f)

def boot(env_extra, tag):
    for side in ('firm', 'personal'):
        d = DATA + '/' + side
        os.makedirs(d, exist_ok=True)
        if not os.path.exists(d + '/ledger.jsonl'):
            shutil.copyfile('fixtures/replay/%s.jsonl' % side, d + '/ledger.jsonl')
        json.dump({'mode': 'normal'}, open(d + '/meta-fake.json', 'w'))
        json.dump({'count': 0}, open(d + '/meta-calls.json', 'w'))
    env = dict(os.environ)
    env.update({'STEVENS_DATA_DIR': DATA, 'STEVENS_NOW': open('fixtures/replay/now.txt').read().strip(),
                'STEVENS_DEV': '1', 'STEVENS_AGENT_TOKEN': 'test-drill15',
                'STEVENS_FIRM_URL': 'http://localhost:%d' % FIRM, 'STEVENS_OWNER': 'p-alex',
                'STEVENS_VAULT_DIR': DATA + '/personal/vault', 'STEVENS_INBOX_DIR': DATA + '/personal/inbox',
                'STEVENS_CALENDAR_ICS': '', 'READWISE_TOKEN': '',
                'FIRM_PORT': str(FIRM), 'PERSONAL_PORT': str(PERS),
                'NODE_OPTIONS': '--disable-warning=ExperimentalWarning'})
    env.update(env_extra)
    os.makedirs(DATA + '/personal/vault', exist_ok=True)
    os.makedirs(DATA + '/personal/inbox', exist_ok=True)
    log = open(BASE + '/%s.log' % tag, 'a')
    procs = [subprocess.Popen(['npx', 'tsx', e], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, start_new_session=True, env=env)
             for e in ('server/firm/index.ts', 'server/personal/index.ts')]
    for port in (FIRM, PERS):
        for _ in range(60):
            try:
                s, _ = http('GET', port, '/api/health', timeout=5)
                if s == 200: break
            except Exception: pass
            time.sleep(2)
        else:
            kill(procs); raise RuntimeError(':%d never healthy (%s)' % (port, tag))
    return procs

def kill(procs):
    for p in procs:
        try: os.killpg(p.pid, signal.SIGTERM)
        except Exception: pass

shutil.rmtree(BASE, ignore_errors=True)
os.makedirs(BASE)
procs = boot({}, 'base')
try:
    time.sleep(8)
    y = state(PERS)
    check('seed-brief', any(m.get('briefId') for m in y['meetings']), json.dumps([m.get('briefId') for m in y['meetings']]))

    # Drill 1: firm down
    os.killpg(procs[0].pid, signal.SIGTERM)
    time.sleep(2)
    s, b = http('POST', PERS, '/api/ask', {'dealId': 'helios', 'question': 'Drill: firm is down?'})
    check('firmdown-ask-accepted', s == 202, '%d %s' % (s, b[:120]))
    qid = json.loads(b)['questionId']
    y = state(PERS)
    ans = [d for d in y['drafts'] if d['kind'] == 'answer' and d.get('questionId') == qid]
    check('firmdown-hold', len(ans) == 1 and ans[0]['verdict']['verdict'] == 'hold', json.dumps([d.get('verdict') for d in ans]))
    esc = [e for e in y['escalations'] if e['questionId'] == qid]
    check('firmdown-queued', len(esc) == 1 and esc[0]['status'] == 'queued', json.dumps(esc))
    check('firmdown-unreachable', y['firm']['reachable'] is False, json.dumps(y['firm']))
finally:
    kill(procs)

# Drill 1b: firm returns -> escalation sent (fresh pair, firm killed after ask... simpler: reboot pair, ask while down already queued; now boot with firm and wait for retry)
procs = boot({}, 'return')
try:
    time.sleep(8)
    sent = False
    for _ in range(90):
        y = state(PERS)
        if any(e['status'] == 'sent' for e in y['escalations']):
            sent = True; break
        time.sleep(2)
    check('firmup-sent', sent, 'escalation never sent after return')
finally:
    kill(procs)

# Drills 2-5: meta fake modes (personal only needs the fake; boot pair, flip personal fake)
procs = boot({}, 'meta')
try:
    time.sleep(6)
    set_fake('personal', 'fail')
    s, b = http('POST', PERS, '/api/ask', {'dealId': 'helios', 'question': 'Drill: writer fails?'})
    check('metafail-ask-500', s == 500, '%d %s' % (s, b[:100]))
    y = state(PERS)
    check('metafail-no-answer', not any(d.get('question') == 'Drill: writer fails?' for d in y['drafts']), 'ghost answer present')
    drill_path = DATA + '/personal/inbox/drill-talk.wav'
    shutil.copyfile('fixtures/personal/talk.wav', drill_path)
    with open(drill_path, 'ab') as f:
        f.write(b'drill15')
    hour_ago = time.time() - 3600
    os.utime(drill_path, (hour_ago, hour_ago))
    failed = False
    for _ in range(60):
        y = state(PERS)
        if any(i.get('originId') == 'drill-talk.wav' and i['status'] == 'failed' for i in y['items']):
            failed = True; break
        time.sleep(2)
    check('metafail-item-failed', failed, 'ingest failure not surfaced')
    set_fake('personal', 'garbage')
    s, b = http('POST', PERS, '/api/ask', {'dealId': 'helios', 'question': 'Drill: writer lies?'})
    y = state(PERS)
    blob = json.dumps(y['drafts'])
    check('metagarbage-closed', 'Invented' not in blob, 'garbage reached drafts')
    set_fake('personal', 'empty')
    s, b = http('POST', PERS, '/api/ask', {'dealId': 'helios', 'question': 'Drill: writer empty?'})
    check('metaempty-accepted', s == 202, '%d' % s)
    set_fake('personal', 'slow')
    t0 = time.time()
    s, b = http('POST', PERS, '/api/ask', {'dealId': 'helios', 'question': 'Drill: writer slow?'}, timeout=120)
    check('metaslow-completes', s == 202 and time.time() - t0 >= 4, '%d in %.1fs' % (s, time.time() - t0))
    set_fake('personal', 'normal')
finally:
    kill(procs)

# Drill 6: readwise down (bogus token -> live attempt fails)
shutil.rmtree(DATA, ignore_errors=True)
procs = boot({'READWISE_TOKEN': 'bogus-drill-token'}, 'readwise')
try:
    time.sleep(10)
    y = state(PERS)
    rw = [s for s in y['sourceStatus'] if s['id'] == 'readwise'][0]
    check('readwise-error', rw['lastError'] is not None, json.dumps(rw))
finally:
    kill(procs)

# Drill 7: CRM dead port (same code path as Postgres down)
shutil.rmtree(DATA, ignore_errors=True)
procs = boot({'FIRM_DATABASE_URL': 'postgres://drill@127.0.0.1:9/drill'}, 'crmdown')
try:
    time.sleep(10)
    f = state(FIRM, viewer='p-morgan')
    crm = [c for c in f['connectors'] if c['id'] == 'crm'][0]
    check('crm-error', crm.get('lastError') is not None, json.dumps(crm))
    check('crm-status-line', f['status']['line'].startswith('CRM unreachable since'), f['status']['line'])
    check('crm-snapshot-kept', len(f['deals']) == 3, '%d deals' % len(f['deals']))
finally:
    kill(procs)

print('RESULT %d pass %d fail' % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
