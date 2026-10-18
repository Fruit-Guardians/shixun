import urllib.request,urllib.error,json,pathlib
op=urllib.request.build_opener(urllib.request.ProxyHandler({}));base='http://127.0.0.1:5173'
def call(path,body=None,headers={}):
 data=json.dumps(body).encode() if body is not None else None
 try:
  r=op.open(urllib.request.Request(base+path,data=data,headers=headers));return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
raw=pathlib.Path('.sites-runtime/drive-report.md').read_text();data=dict(raw=raw,date='2026-10-16',topic='全球技术社区',sourceFileId='1AA9Z4C-qdLryYO4Vwsr5cvaqfkt1nrsX')
h={'Content-Type':'application/json','X-Sites-Report-Sync':'google-drive'}
assert call('/api/sync',data)[0]==403
assert call('/api/sync',data,{**h,'Origin':'https://other.example'})[0]==403
assert call('/api/reports',data,{'Content-Type':'application/json'})[0]==401
status,b=call('/api/sync',data,h);assert status==200;b=json.loads(b);assert b['status']=='unchanged'
assert call('/api/reports/'+b['id'])[1].decode()==raw
bad={**data,'date':'2026-02-30'};assert call('/api/sync',bad,h)[0]==400
status,payload=call('/api/reports');assert status==200;report=json.loads(payload);assert report['drive']['status']=='imported';assert len(report['reports'])==3
print('7 API checks passed: origin, browser/auth rejection, invalid date, readback, idempotence, Drive status.')
