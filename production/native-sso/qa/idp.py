"""Synthetic central identity around the real reviewed Linux IDP, QA only."""
import os
from urllib.parse import urlencode,urlparse
assert os.environ.get('BARBACUE_DISPOSABLE_QA')=='1'
from fastapi import Request
from fastapi.responses import JSONResponse,RedirectResponse
from app import idp,cog_sso
state=dict(mode='valid',fail_logout=True)
cog_sso.configured=lambda:True
cog_sso.bootstrap_url=lambda destination:'/qa/bootstrap?'+urlencode({'destination':destination})
def identity(token):
 if token!='qa-central' or state['mode'] in ('absent','offline','revoked'):return None
 
 email=os.environ['TEST_USER_EMAIL']
 return ('missing-'+email if state['mode']=='unmapped' else 'disabled-'+email if state['mode']=='inactive' else 'first-'+email if state['mode']=='first' else email)
cog_sso.resolve=identity
def end(token):
 if state['fail_logout']:return False
 state['mode']='revoked';return True
cog_sso.end=end
app=idp.create_app()
@app.get('/qa/bootstrap')
def bootstrap(destination:str):
 assert urlparse(destination).netloc==urlparse(idp.ISSUER).netloc
 r=RedirectResponse(destination,303);r.set_cookie('cog_sso_checked','1',max_age=30,httponly=True,samesite='lax')
 if state['mode'] not in ('absent','offline','revoked'):r.set_cookie(cog_sso.COOKIE,'qa-central',httponly=True,samesite='lax')
 return r
@app.post('/qa/control')
async def control(request:Request):
 j=await request.json()
 if 'mode'in j:assert j['mode']in ('valid','unmapped','inactive','first','absent','offline','revoked');state['mode']=j['mode']
 if 'fail_logout'in j:state['fail_logout']=j['fail_logout'] is True
 return JSONResponse(state)

@app.get('/qa/control')
def current_state():return JSONResponse(state)
