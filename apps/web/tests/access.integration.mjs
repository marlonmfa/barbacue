// Run against a disposable local database and the local web server only.
// ACCESS_TEST_URL=http://localhost:3097 ACCESS_TEST_PASSWORD=... DATABASE_URL=... node tests/access.integration.mjs
import assert from 'node:assert/strict';
import pg from 'pg';
const base = process.env.ACCESS_TEST_URL;
const database = process.env.DATABASE_URL;
assert(base && ['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Local test server required');
assert(database && ['localhost', '127.0.0.1'].includes(new URL(database).hostname), 'Disposable local database required');
const pool = new pg.Pool({ connectionString: database });
const suffix = Date.now().toString();
let assertions = 0;
async function request(path, { cookie, method = 'GET', body } = {}) {
  const response = await fetch(base + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { response, data: response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text() };
}
function status(result, expected) { assert.equal(result.response.status, expected, JSON.stringify(result.data).slice(0, 400)); assertions++; }
function cookie(result) { return result.response.headers.getSetCookie().map(v => v.split(';')[0]).join('; '); }
try {
  status(await request('/api/admin/staff'), 401);
  const master = await request('/api/admin/auth', { method: 'POST', body: { password: process.env.ACCESS_TEST_PASSWORD } }); status(master, 200); const admin = cookie(master);
  const created = await request('/api/admin/staff', { cookie: admin, method: 'POST', body: { name: 'Cozinha Teste', username: `cozinha${suffix}`, password: 'test-password-2026', role: 'kitchen', jobTitle: 'Chapeiro' } }); status(created, 201);
  assert(!('passwordHash' in created.data)); assertions++;
  const login = await request('/api/admin/auth', { method: 'POST', body: { username: `cozinha${suffix}`, password: 'test-password-2026' } }); status(login, 200); const kitchen = cookie(login);
  const deniedPaths = ['/api/admin/orders', '/api/admin/customers', '/api/admin/staff', '/api/admin/settings', '/api/admin/catalogs', '/api/admin/employees', '/api/admin/system'];
  for (const path of deniedPaths) status(await request(path, { cookie: kitchen }), 403);
  const home = await request('/', { cookie: kitchen }); assert([200, 307].includes(home.response.status)); assert(home.response.headers.get('location') === '/admin/kitchen' || home.data.includes('url=/admin/kitchen')); assertions++;
  const deniedPage = await request('/admin/orders', { cookie: kitchen }); status(deniedPage, 307); assert(deniedPage.response.headers.get('location').endsWith('/admin/kitchen')); assertions++;
  const inserted = await pool.query("INSERT INTO orders (customer_name,customer_phone,items,subtotal_cents,total_cents,status,notes) VALUES ('Cliente Teste','5547999999999',$1,3000,3000,'confirmed','Sem cebola') RETURNING id", [JSON.stringify([{name:'Burger teste', qty:1,priceCents:3000}])]);
  const id = inserted.rows[0].id;
  const queue = await request('/api/admin/kitchen', { cookie: kitchen }); status(queue, 200);
  assert(queue.data.some(t => t.id === id)); assertions++;
  assert(!('customerPhone' in queue.data[0]) && !('totalCents' in queue.data[0]) && !('priceCents' in queue.data[0].items[0])); assertions++;
  status(await request('/api/admin/kitchen', { cookie: kitchen, method:'PATCH', body:{id,status:'cancelled'} }), 422);
  status(await request('/api/admin/kitchen', { cookie: kitchen, method:'PATCH', body:{id,status:'ready'} }), 409);
  status(await request('/api/admin/kitchen', { cookie: kitchen, method:'PATCH', body:{id,status:'preparing'} }), 200);
  status(await request('/api/admin/kitchen', { cookie: kitchen, method:'PATCH', body:{id,status:'ready'} }), 200);
  status(await request(`/api/admin/staff/${created.data.id}`, { cookie:admin,method:'PATCH',body:{permissions:[]} }), 200);
  status(await request('/api/admin/kitchen', { cookie:kitchen }), 403);
  status(await request(`/api/admin/staff/${created.data.id}`, { cookie:admin,method:'PATCH',body:{permissions:['kitchen','orders']} }), 200);
  status(await request('/api/admin/orders', { cookie:kitchen }), 200);
  status(await request(`/api/admin/staff/${created.data.id}`, { cookie:admin,method:'PATCH',body:{active:false} }), 200);
  status(await request('/api/admin/kitchen', { cookie:kitchen }), 401);
  const register = await request('/api/account', { method:'POST',body:{mode:'register',name:'Cliente Teste',email:`cliente${suffix}@example.test`,password:'test-password-2026'} }); status(register,200); const member = cookie(register);
  status(await request('/api/admin/staff', { cookie:member }), 401);
  const offer = await request('/api/admin/coupons', { cookie:admin,method:'POST',body:{code:`CASA${suffix}`,discountType:'flat',discountValue:500,audience:'member'} }); status(offer,201);
  status(await request('/api/coupons', { method:'POST',body:{code:offer.data.code,subtotalCents:3000} }), 403);
  status(await request('/api/coupons', { cookie:member,method:'POST',body:{code:offer.data.code,subtotalCents:3000} }), 200);
  status(await request('/api/coupons', { cookie:'barbacue_customer_session=eyJuYW1lIjoiZmFrZSJ9',method:'POST',body:{code:offer.data.code,subtotalCents:3000} }), 403);
  const product = await pool.query("INSERT INTO products(name,price_cents,available) VALUES('Burger teste',3000,true) RETURNING id");
  const body = {customerName:'Cliente Teste',customerPhone:'5547999999999',deliveryAddress:'Rua de teste, 123',paymentMethod:'cash',items:[{productId:product.rows[0].id,qty:1}],couponCode:offer.data.code};
  const visitorOrder = await request('/api/orders',{method:'POST',body}); status(visitorOrder,201); assert.equal(visitorOrder.data.discountCents,0); assertions++;
  const memberOrder = await request('/api/orders',{cookie:member,method:'POST',body}); status(memberOrder,201); assert.equal(memberOrder.data.discountCents,500); assertions++;
  const count = await pool.query('SELECT used_count FROM coupons WHERE id=$1',[offer.data.id]); assert.equal(count.rows[0].used_count,1); assertions++;
  const visitorOffer = await request('/api/admin/coupons', {cookie:admin,method:'POST',body:{code:`VISITA${suffix}`,discountType:'percentage',discountValue:10,audience:'visitor'}}); status(visitorOffer,201);
  status(await request('/api/coupons',{cookie:member,method:'POST',body:{code:visitorOffer.data.code,subtotalCents:3000}}),403);
  status(await request('/api/coupons',{method:'POST',body:{code:visitorOffer.data.code,subtotalCents:3000}}),200);
  console.log(`Passed ${assertions} integration checks: access isolation, revocation, preparation, customer login and audience discounts.`);
} finally { await pool.end(); }
