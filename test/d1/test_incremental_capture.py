import json,unittest
from test_migrate import FixtureMixin
import migrate as m
import rebuild_snapshot as rebuild
import incremental_capture as inc
import capture_state as state

class IncrementalTests(FixtureMixin,unittest.TestCase):
    def setup_delta(self,replaced=None,ids=None):
        self.base=self.snapshot(self.seed(),'base.jsonl');self.original,_,sha=m.read_snapshot(self.base,self.cat)
        self.header={'kind':'capture-meta','catalog_sha256':m.digest(m.CATALOG.read_bytes()),'base_source_sha256':sha,'base_candidate_sha256':'b'*64,'base_receipt_digest':'c'*64,'tables':sorted(self.specs),'ids':ids if ids is not None else ['2','9'],'replaced_tables':replaced or ['_auth_users']}
        auth=next(iter(self.seed()['_auth_users'].values()))
        return [{'table':'_auth_users','replacement':True,'row':auth}]
    def delta(self,records,name='delta.jsonl'):
        body=''.join(m.canonical(r)+'\n' for r in [self.header,*records]);p=self.root/name;p.write_text(body+m.canonical({'kind':'capture-footer','sha256':m.digest(body.encode())})+'\n');return p
    def raw(self,table,row):return rebuild.denormalize(row,self.specs[table])
    def test_coalesced_updates_deletes_new_keys_and_auth_refresh(self):
        records=self.setup_delta();old=self.original;new=self.seed(2)
        profile=next(iter(new['users_profile'].values()));old_region=next(iter(old['regions'].values()));new_region=next(iter(new['regions'].values()))
        records.extend([{'table':'users_profile','key':[profile['id']],'row':self.raw('users_profile',profile)},{'table':'regions','key':[old_region['id']],'row':None},{'table':'regions','key':[new_region['id']],'row':self.raw('regions',new_region)}])
        report=inc.reconstruct(self.base,self.delta(records),self.root/'next.jsonl')
        actual,meta,_=m.read_snapshot(self.root/'next.jsonl',self.cat);self.assertEqual(actual,new);self.assertEqual(report['capturedReceipts'],2);self.assertEqual(report['sourceWrites'],0);self.assertFalse(meta['change_capture']['bootstrap'])
        self.assertEqual(meta['change_capture']['ids'],['2','9']);self.assertEqual(m.read_snapshot(self.base,self.cat)[0],old)
    def test_truncate_replaces_whole_table_including_empty_result(self):
        records=self.setup_delta(['_auth_users','regions']);inc.reconstruct(self.base,self.delta(records),self.root/'empty.jsonl')
        self.assertEqual(m.read_snapshot(self.root/'empty.jsonl',self.cat)[0]['regions'],{})
        new=next(iter(self.seed(2)['regions'].values()));records.append({'table':'regions','replacement':True,'row':self.raw('regions',new)})
        inc.reconstruct(self.base,self.delta(records,'filled.delta'),self.root/'filled.jsonl');self.assertEqual(len(m.read_snapshot(self.root/'filled.jsonl',self.cat)[0]['regions']),1)
    def test_same_transaction_full_check_verifies_all_source_fields(self):
        records=self.setup_delta();rows=self.original
        for table,items in rows.items():
            records.extend({'full_check':True,'table':table,'row':self.raw(table,row)} for row in items.values())
        report=inc.reconstruct(self.base,self.delta(records),self.root/'checked.jsonl',True);self.assertTrue(report['sameTransactionFullComparison']);self.assertGreater(report['fullVerificationBytes'],0)
        field='full_name' if 'full_name' in records[-1]['row'] else 'name'
        records[-1]['row']={**records[-1]['row'],field:'wrong'}
        with self.assertRaises(ValueError):inc.reconstruct(self.base,self.delta(records,'bad.delta'),self.root/'bad.jsonl',True)
        self.assertFalse((self.root/'bad.jsonl').exists())
    def test_receipt_order_duplicates_missing_auth_and_wrong_parent_fail_closed(self):
        for n,update in enumerate([{'ids':['9','2']},{'ids':['2','2']},{'ids':['0']},{'ids':[str(2**63)]},{'replaced_tables':[]},{'base_source_sha256':'f'*64},{'base_receipt_digest':'bad'}]):
            records=self.setup_delta();self.header.update(update)
            with self.assertRaises(ValueError):inc.reconstruct(self.base,self.delta(records,str(n)+'.delta'),self.root/(str(n)+'.jsonl'))
    def test_duplicate_missing_and_mismatched_rows_are_never_treated_as_valid_deletes(self):
        records=self.setup_delta();auth=records[0]
        with self.assertRaises(ValueError):inc.reconstruct(self.base,self.delta([auth,auth]),self.root/'duplicate.jsonl')
        for n,row in enumerate([{'table':'regions','key':['x']},{'table':'regions','key':[None],'row':None},{'table':'regions','key':['wrong'],'row':self.raw('regions',next(iter(self.seed()['regions'].values())))}]):
            with self.assertRaises(ValueError):inc.reconstruct(self.base,self.delta([auth,row],str(n)+'.delta'),self.root/(str(n)+'.jsonl'))
    def test_incomplete_capture_and_invalid_foreign_keys_do_not_publish_snapshot(self):
        records=self.setup_delta();path=self.delta(records);path.write_text('\n'.join(path.read_text().splitlines()[:-1])+'\n')
        with self.assertRaises(ValueError):inc.reconstruct(self.base,path,self.root/'truncated.jsonl')
        # Omitting the prior Auth ID must fail the existing full FK validator.
        with self.assertRaises(ValueError):inc.reconstruct(self.base,self.delta([],'missing-auth.delta'),self.root/'missing-auth.jsonl')
        self.assertFalse((self.root/'missing-auth.jsonl').exists())
    def test_source_sql_is_consistent_keyed_read_only_and_rewind_guarded(self):
        checkpoint={'id':1,'protocol':1,'source_sha256':'a'*64,'candidate_sha256':'b'*64,'catalog_sha256':m.digest(m.CATALOG.read_bytes()),'receipt_digest':'c'*64}
        sql=inc.source_sql(self.cat,checkpoint)
        for fragment in ['REPEATABLE READ READ ONLY','acknowledged_at IS NULL','id::text ORDER BY id','jsonb_populate_record',"'enabled',g.tgenabled",'75000',"'c"+'c'*63+"'",'d1_migration_auth_ids_20261022']:self.assertIn(fragment,sql)
        for fragment in ['MAX(id)','id>','UPDATE public.','DELETE FROM']:self.assertNotIn(fragment,sql)
        self.assertNotRegex(sql,r'(?m)^\s*(?:INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|CREATE\s|TRUNCATE\s)')
    def test_receipt_digest_partial_ack_recovery_excludes_only_exact_new_receipts(self):
        calls=[]
        from types import SimpleNamespace
        def runner(*args,**kwargs):calls.append(kwargs['input'].decode());return SimpleNamespace(returncode=0,stdout=json.dumps({'receiptDigest':'c'*64,'acknowledgedReceipts':11}).encode())
        state.source_digest(runner,['2','9'],'b'*64);self.assertIn('ARRAY[2,9]',calls[0]);self.assertIn("destination_sha256='"+'b'*64+"'",calls[0]);self.assertIn('NOT(id=ANY',calls[0])
        with self.assertRaises(ValueError):state.source_digest(runner,['1);DELETE'],'b'*64)
