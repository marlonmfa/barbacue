"""Google Chrome against the actual native entrypoint and isolated Linux candidate."""
import json,os,pathlib,shlex,urllib.request
from playwright.sync_api import sync_playwright
BASE='http://127.0.0.1:54750';OTHER='http://localhost:54750';CONTROL='http://127.0.0.1:54752'
def state(value=None):
 req=urllib.request.Request(CONTROL,data=json.dumps(value).encode() if value is not None else None,headers={'Content-Type':'application/json'})
 return json.load(urllib.request.urlopen(req,timeout=10))
def api(page,path):
 return page.evaluate("async p=>{const r=await fetch(p,{cache:'no-store'});return {status:r.status,data:await r.json()}}",path)
def cookies(context):return '; '.join(c['name']+'='+c['value'] for c in context.cookies())
def clear_checked(context):context.clear_cookies(name='barbacue_cog_checked')
def staff(page,name):page.get_by_text(name,exact=True).wait_for()
shots=pathlib.Path(__file__).resolve().parents[3]/'test-screenshots';shots.mkdir(exist_ok=True)
def shot(page,name,full=True):page.screenshot(path=str(shots/('cog-barbacue-federation-'+name+'-2026-10-26.png')),full_page=full)
email=state()['email'];password=os.environ['TEST_USER_PASSWORD']
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome')
 state({'mode':'absent','revoked':False,'failLogout':True})
 context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page()
 page.goto(BASE+'/admin/login');page.get_by_label('Usuário ou e-mail',exact=True).fill('local-'+email)
 page.get_by_label('Senha',exact=True).fill(password);page.get_by_role('button',name='Entrar',exact=True).click()
 page.wait_for_url(BASE+'/admin');staff(page,'Pessoa Nativa QA')
 native=next(c['value'] for c in context.cookies() if c['name']=='barbacue_admin')
 for mode in ['unmapped','inactive','unverified','wrong-state','wrong-nonce','wrong-audience','offline','first']:
  state({'mode':mode});clear_checked(context);page.goto(BASE+'/admin/login');page.wait_for_url(BASE+'/admin');staff(page,'Pessoa Nativa QA')
  assert next(c['value'] for c in context.cookies() if c['name']=='barbacue_admin')==native
 state({'mode':'valid'});clear_checked(context);page.goto(BASE+'/admin/login');page.wait_for_url(BASE+'/admin');staff(page,'Pessoa Cog QA')
 account=api(page,'/api/admin/auth')['data']['session'];assert account['role']=='cashier' and account['permissions']==['dashboard']
 assert api(page,'/api/admin/staff')['status']==403
 grant=next(c for c in context.cookies() if c['name']=='barbacue_cog_grant');assert grant['httpOnly'] and grant['sameSite']=='Lax'
 assert 'barbacue_cog_grant' not in page.evaluate('document.cookie');shot(page,'staff-priority')
 # Reject another origin before logout or any mutation; retain all cookies.
 calls=state()['calls']
 response=page.request.delete(BASE+'/api/admin/auth',headers={'Cookie':cookies(context),'Origin':'https://other.example'})
 assert response.status==403 and state()['calls']==calls
 old_view=api(page,'/api/auth/cog/session')['data']['view']
 state({'mode':'offline'});page.evaluate("window.dispatchEvent(new Event('focus'))");staff(page,'Pessoa Nativa QA')
 response=page.request.post(BASE+'/api/admin/orders',headers={'Cookie':cookies(context),'X-Cog-View':old_view},data={})
 assert response.status==409;shot(page,'staff-native-fallback')
 # An encrypted grant cannot move between brand origins.
 other=browser.new_context();other.add_cookies([{'name':'barbacue_cog_grant','value':grant['value'],'url':OTHER},
  {'name':'barbacue_cog_checked','value':'1','url':OTHER}])
 denied=other.new_page();denied.goto(OTHER+'/admin/login');denied.get_by_label('Senha',exact=True).wait_for()
 assert api(denied,'/api/admin/auth')['status']==401
 state({'mode':'valid'});clear_checked(context);context.clear_cookies(name='barbacue_cog_grant')
 page.goto(BASE+'/admin/login');page.wait_for_url(BASE+'/admin');staff(page,'Pessoa Cog QA')
 page.get_by_role('button',name='Sair',exact=True).click();page.get_by_role('button',name='Tentar sair novamente',exact=True).wait_for()
 staff(page,'Pessoa Cog QA');shot(page,'logout-error')
 assert next(c['value'] for c in context.cookies() if c['name']=='barbacue_admin')==native
 state({'failLogout':False});page.get_by_role('button',name='Tentar sair novamente',exact=True).click()
 page.wait_for_url('**/admin/login');page.get_by_label('Senha',exact=True).wait_for()
 assert not any(c['name'] in ['barbacue_admin','barbacue_cog_grant'] for c in context.cookies())
 # Native first-password restriction remains mandatory; opening it never revokes Cog.
 state({'mode':'first','revoked':False});first=browser.new_context();setup=first.new_page();setup.goto(BASE+'/admin/login')
 setup.get_by_label('Usuário ou e-mail',exact=True).fill('first-'+email);setup.get_by_label('Senha',exact=True).fill(password)
 calls=state()['calls'];setup.get_by_role('button',name='Entrar',exact=True).click();setup.wait_for_url('**/admin/change-password')
 setup.get_by_role('heading',name='Crie sua nova senha',exact=True).wait_for();assert state()['calls']==calls
 assert api(setup,'/api/admin/dashboard')['status']==403;shot(setup,'first-password')
 # Customer uses its own local account and cannot become staff.
 state({'mode':'absent'});member=browser.new_context(viewport={'width':1440,'height':1000});customer=member.new_page()
 customer.goto(BASE+'/conta');customer.get_by_label('E-mail',exact=True).fill('customer-'+email)
 customer.get_by_label('Senha',exact=False).fill(password);customer.get_by_role('button',name='Entrar na minha conta',exact=True).click()
 customer.wait_for_url(BASE+'/');customer.get_by_text('Olá, Cliente Nativo QA',exact=True).wait_for()
 native_member=next(c['value'] for c in member.cookies() if c['name']=='barbacue_member')
 state({'mode':'member'});clear_checked(member);customer.goto(BASE+'/conta');customer.wait_for_url(BASE+'/')
 customer.get_by_text('Olá, Cliente Cog QA',exact=True).wait_for();assert api(customer,'/api/admin/auth')['status']==401
 customer.get_by_role('region',name='Seu acesso e ofertas').scroll_into_view_if_needed();shot(customer,'member-priority',False)
 state({'mode':'offline'});customer.evaluate("window.dispatchEvent(new Event('focus'))");customer.get_by_text('Olá, Cliente Nativo QA',exact=True).wait_for()
 assert next(c['value'] for c in member.cookies() if c['name']=='barbacue_member')==native_member
 # A fresh browser on the second configured origin completes its own flow.
 state({'mode':'valid','revoked':False});mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,device_scale_factor=1)
 phone=mobile.new_page();phone.goto(OTHER+'/admin/login');phone.wait_for_url(OTHER+'/admin');staff(phone,'Pessoa Cog QA')
 assert api(phone,'/api/admin/auth')['data']['session']['role']=='cashier'
 assert not any(c['name']=='barbacue_admin' for c in mobile.cookies())
 shot(phone,'barbadog-mobile',False)
 assert state()['counts']=={'staff':4,'members':2}
 browser.close()
print('PASS: native standalone entrypoint / both brand origins / code+PKCE+RS256 / staff+member isolation / native fallback / first password / logout / six Chrome screenshots')
