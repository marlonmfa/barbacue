import json,os,pathlib,shlex,urllib.request
from playwright.sync_api import sync_playwright
base='http://127.0.0.1:54675';control='http://127.0.0.1:54676/qa/state'
def state(v=None):
 return json.load(urllib.request.urlopen(urllib.request.Request(control,data=json.dumps(v).encode() if v is not None else None,headers={'Content-Type':'application/json'})))
def api(page,path):
 # Chrome accepts Secure cookies on its trusted loopback origin; the separate
 # Playwright HTTP client does not. Exercise the application's real cookie jar.
 return page.evaluate("async path=>{const r=await fetch(path);return {status:r.status,data:await r.json()}}",path)
email=state()['email'];defaults={} 
for line in pathlib.Path('/Users/marlonalcantara/Repos/.env.default').read_text().splitlines():
 if line.startswith('TEST_USER_PASSWORD='):defaults['TEST_USER_PASSWORD']=shlex.split(line.split('=',1)[1])[0]
password=os.environ.get('TEST_USER_PASSWORD',defaults.get('TEST_USER_PASSWORD','teste123'))
shots=pathlib.Path(__file__).resolve().parents[3]/'test-screenshots';shots.mkdir(exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome');context=browser.new_context(viewport={'width':1440,'height':1000});page=context.new_page()
 page.goto(base+'/admin/login');page.get_by_label('Usuário ou e-mail',exact=True).fill('local-'+email);page.get_by_label('Senha',exact=True).fill(password)
 page.get_by_role('button',name='Entrar',exact=True).click();page.wait_for_url(base+'/admin')
 assert api(page,'/api/admin/auth')['data']['session']['role']=='admin'
 native_cookie=next(c for c in context.cookies() if c['name']=='barbacue_admin')['value']
 context.add_cookies([{'name':'cogia_sessao','value':'central','url':base,'httpOnly':True}]);page.goto(base+'/admin/login');page.wait_for_url(base+'/admin')
 session=api(page,'/api/admin/auth')['data']['session'];assert session['name']=='Pessoa Cog QA' and session['role']=='cashier' and session['permissions']==['dashboard']
 assert api(page,'/api/admin/staff')['status']==403
 page.get_by_text('Pessoa Cog QA',exact=True).wait_for();page.screenshot(path=str(shots/'cog-sso-barbacue-staff-2026-10-25.png'),full_page=True)
 page.get_by_role('button',name='Sair',exact=True).click();page.get_by_role('button',name='Tentar sair novamente',exact=True).wait_for()
 assert api(page,'/api/admin/auth')['data']['session']['name']=='Pessoa Cog QA'
 page.screenshot(path=str(shots/'cog-sso-barbacue-logout-error-2026-10-25.png'),full_page=True)
 for token in ['invalid','unmapped','disabled']:
  context.add_cookies([{'name':'cogia_sessao','value':token,'url':base}]);page.reload()
  assert api(page,'/api/admin/auth')['data']['session']['name']=='Pessoa Nativa QA'
 state({'identityDown':True});context.add_cookies([{'name':'cogia_sessao','value':'central','url':base}]);page.reload()
 assert api(page,'/api/admin/auth')['data']['session']['name']=='Pessoa Nativa QA';state({'identityDown':False})
 assert next(c for c in context.cookies() if c['name']=='barbacue_admin')['value']==native_cookie
 page.get_by_text('Pessoa Nativa QA',exact=True).wait_for()
 page.screenshot(path=str(shots/'cog-sso-barbacue-native-2026-10-25.png'),full_page=True)
 # A first-password account cannot use Cog to skip the existing local flow.
 first=browser.new_context();first.add_cookies([{'name':'cogia_sessao','value':'first','url':base}]);setup=first.new_page()
 setup.goto(base+'/admin/login');setup.get_by_label('Usuário ou e-mail',exact=True).wait_for();assert api(setup,'/api/admin/auth')['status']==401
 setup.get_by_label('Usuário ou e-mail',exact=True).fill('first-'+email);setup.get_by_label('Senha',exact=True).fill(password);setup.get_by_role('button',name='Entrar',exact=True).click()
 setup.wait_for_url('**/admin/change-password');setup.get_by_role('heading',name='Crie sua nova senha',exact=True).wait_for();assert api(setup,'/api/admin/dashboard')['status']==403
 setup.screenshot(path=str(shots/'cog-sso-barbacue-first-password-2026-10-25.png'),full_page=True)
 # Existing customer account and native/social login are independent of staff.
 member=browser.new_context(viewport={'width':1440,'height':1000});customer=member.new_page();customer.goto(base+'/conta')
 customer.get_by_label('E-mail',exact=True).fill('customer-'+email);customer.get_by_label('Senha',exact=False).fill(password);customer.get_by_role('button',name='Entrar na minha conta',exact=True).click()
 customer.wait_for_url(base+'/');customer.get_by_text('Olá, Cliente Nativo QA',exact=True).wait_for();customer.wait_for_load_state('networkidle')
 assert api(customer,'/api/account')['data']['member']['name']=='Cliente Nativo QA'
 member_cookie=next(c for c in member.cookies() if c['name']=='barbacue_member')['value']
 member.add_cookies([{'name':'cogia_sessao','value':'member','url':base}]);customer.goto(base+'/conta');customer.wait_for_url(base+'/')
 customer.get_by_text('Olá, Cliente Cog QA',exact=True).wait_for();customer.wait_for_load_state('networkidle')
 assert api(customer,'/api/account')['data']['member']['name']=='Cliente Cog QA'
 assert api(customer,'/api/admin/auth')['status']==401
 customer.get_by_role('region',name='Seu acesso e ofertas').scroll_into_view_if_needed()
 customer.screenshot(path=str(shots/'cog-sso-barbacue-member-2026-10-25.png'))
 customer.get_by_role('button',name='Sair da conta',exact=True).click();customer.get_by_role('alert').filter(has_text='Não foi possível sair.').wait_for()
 assert api(customer,'/api/account')['data']['member']['name']=='Cliente Cog QA'
 member.add_cookies([{'name':'cogia_sessao','value':'invalid','url':base}]);customer.reload()
 assert api(customer,'/api/account')['data']['member']['name']=='Cliente Nativo QA'
 assert next(c for c in member.cookies() if c['name']=='barbacue_member')['value']==member_cookie
 # A confirmed logout clears only this browser's native scope and the presented Cog token.
 page.reload();page.get_by_role('button',name='Sair',exact=True).wait_for();state({'endFails':False});page.get_by_role('button',name='Sair',exact=True).click()
 page.wait_for_url('**/admin/login');page.get_by_label('Senha',exact=True).wait_for();assert api(page,'/api/admin/auth')['status']==401
 assert state()['staff']==4 and state()['members']==2
 browser.close()
print('PASS: actual Linux build/Cog staff+member priority/native fallback/role isolation/first password/logout/no provisioning')
