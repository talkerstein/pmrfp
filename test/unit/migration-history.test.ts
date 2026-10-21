import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

function check(input: string) {
  return spawnSync(process.execPath,['scripts/check-migration-history.mjs'],{input,encoding:'utf8'});
}
describe('production migration history verification',()=>{
  it('accepts a CLI table with matching versions and formatting',()=>{
    const result=check('Local | Remote | Time\n`20261021000001` | `20261021000001` | 2026-10-21\n');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Verified 1 migration versions');
  });
  it.each(['20261021000001 | | date\n',' | 20261021000001 | date\n','20261021000001 | 20261021000010 | date\n','Connection failed\n'])('rejects unresolved histories or invalid output: %s',input=>{
    expect(check(input).status).not.toBe(0);
  });
});
