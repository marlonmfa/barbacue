const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),dotenv=require('dotenv');
let defaults={};try{defaults=dotenv.parse(fs.readFileSync('/Users/marlonalcantara/Repos/.env.default'));}catch{}
test('admin saves encrypted provider settings and preserves keys after switching',async({page})=>{
 expect((await page.request.post('/test-login',{data:{email:process.env.TEST_USER_EMAIL||defaults.TEST_USER_EMAIL||'teste@teste.com',password:process.env.TEST_USER_PASSWORD||defaults.TEST_USER_PASSWORD||'teste123'}})).ok()).toBeTruthy();
 await page.goto('/');await expect(page.getByLabel('Provedor de IA')).toHaveValue('anthropic');
 await page.getByLabel('Chave Anthropic').fill('sk-ant-fake-visual-test');await page.getByRole('button',{name:'Salvar configurações de IA'}).click();await expect(page.getByRole('status')).toHaveText('Configurações de IA salvas.');
 await page.reload();await expect(page.getByLabel('Chave Anthropic')).toHaveValue('');await expect(page.getByLabel('Chave Anthropic')).toHaveAttribute('placeholder',/Configurada/);
 await page.getByLabel('Provedor de IA').selectOption('openai');await page.getByRole('button',{name:'Salvar configurações de IA'}).click();await expect(page.getByRole('status')).toBeVisible();
 await page.reload();await expect(page.getByLabel('Provedor de IA')).toHaveValue('openai');
 await page.getByLabel('Provedor de IA').selectOption('anthropic');await page.getByRole('button',{name:'Salvar configurações de IA'}).click();await expect(page.getByRole('status')).toBeVisible();
 const data=await (await page.request.get('/api/admin/system')).json();expect(data.anthropicConfigured).toBe(true);expect(JSON.stringify(data)).not.toContain('sk-ant-fake-visual-test');
 await page.screenshot({path:'test-screenshots/ai-provider-2026-10-27.png',fullPage:true});
});
