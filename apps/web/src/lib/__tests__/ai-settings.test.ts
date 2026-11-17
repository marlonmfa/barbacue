import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptAI, decryptAI, mergeAISettings, publicAISettings, type AISettings } from '../ai-settings';
process.env.AI_ENCRYPTION_KEY = 'barbacue-test-encryption-key-at-least-32-chars';
test('AI configuration encrypts keys, masks responses and preserves credentials on blank edits', () => {
 const current: AISettings = { provider: 'anthropic', anthropicModel: 'claude-haiku-5-5', openaiModel: 'gpt-4o-mini', anthropicApiKey: 'sk-ant-fixture' };
 const bytes = encryptAI(current);
 assert.ok(!bytes.includes('sk-ant-fixture'));
 assert.deepEqual(decryptAI(bytes), current);
 assert.equal(mergeAISettings(current, { provider: 'openai', anthropicApiKey: '' }).anthropicApiKey, 'sk-ant-fixture');
 assert.equal(mergeAISettings(current, { provider: 'openai' }).provider, 'openai');
 assert.throws(() => mergeAISettings(current, { provider: 'invalid' }), /inválido/);
 assert.equal(publicAISettings(current).anthropicConfigured, true);
 assert.ok(!JSON.stringify(publicAISettings(current)).includes('sk-ant-fixture'));
 const broken = Buffer.from(bytes, 'base64'); broken[15] ^= 1;
 assert.throws(() => decryptAI(broken.toString('base64')));
});

test('DeepSeek: provider accepted, own key encrypted/masked, model kept', () => {
 const current: AISettings = { provider: 'anthropic', anthropicModel: 'claude-haiku-5-5', openaiModel: 'gpt-4o-mini' };
 const next = mergeAISettings(current, { provider: 'deepseek', deepseekApiKey: 'sk-deepseek-fixture', deepseekModel: 'deepseek-v4-pro' });
 assert.equal(next.provider, 'deepseek'); assert.equal(next.deepseekModel, 'deepseek-v4-pro');
 const bytes = encryptAI(next); assert.ok(!bytes.includes('sk-deepseek-fixture')); assert.deepEqual(decryptAI(bytes), next);
 const pub = publicAISettings(next); assert.equal(pub.deepseekConfigured, true); assert.equal(pub.deepseekModel, 'deepseek-v4-pro');
 assert.ok(!JSON.stringify(pub).includes('sk-deepseek-fixture'));
 assert.equal(mergeAISettings(next, { deepseekApiKey: '' }).deepseekApiKey, 'sk-deepseek-fixture');
});
