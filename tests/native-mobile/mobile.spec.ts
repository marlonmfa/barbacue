import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const execute = promisify(execFile);
test('installed restaurant app supports its public customer flow', async ({}, info) => {
  const platform = info.project.name;
  const brand = process.env.RESTAURANT_BRAND ?? 'barbacue';
  expect(['barbacue','chelas','barbadog']).toContain(brand);
  const device = process.env[`RESTAURANT_NATIVE_${platform.toUpperCase()}_DEVICE`];
  test.skip(!device, 'A running device and the installed brand app are required');
  const root = path.resolve(process.cwd(), '../..');
  const output = info.outputPath('maestro');
  await mkdir(output, {recursive:true});
  const date = new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'});
  const result = await execute(process.env.RESTAURANT_MAESTRO_BIN ?? 'maestro', [
    '--device', device!, 'test', `${brand}.yaml`, '-e', `APP_ID=com.lanchesdobarba.${brand}`,
    '-e', `PLATFORM=${platform}`, '-e', `TEST_DATE=${date}`, '-e', `BRAND=${brand}`,
    '--test-output-dir', output, '--format','JUNIT','--output',path.join(output,'result.xml'),
  ], {cwd:process.cwd(),timeout:540000,maxBuffer:3000000,env:{...process.env,MAESTRO_CLI_NO_ANALYTICS:'1',MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED:'true'}})
    .catch(error=>{throw new Error(`${error.message}\n${error.stdout??''}\n${error.stderr??''}\nArtifacts: ${output}`)});
  await info.attach('maestro',{body:result.stdout,contentType:'text/plain'});
  const files = await readdir(output,{recursive:true});
  const screens = brand==='barbacue' ? ['inicio','cardapio','carrinho','validacao'] : ['inicio','cardapio','privacidade'];
  for (const screen of screens) {
    const name=`${brand}-${platform}-${screen}-${date}.png`;
    const found=files.filter(file=>path.basename(file)===name);
    expect(found).toHaveLength(1);
    const source=path.join(output,found[0]);
    expect((await readFile(source)).subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    await mkdir(path.join(root,'test-screenshots'),{recursive:true});
    await copyFile(source,path.join(root,'test-screenshots',name));
    await info.attach(name,{path:source,contentType:'image/png'});
  }
});
