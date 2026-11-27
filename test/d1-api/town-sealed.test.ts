import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import type { D1Binding, D1Statement } from "@/lib/d1/contracts";
import {
  adjustNativeSealedOpening, breakNativeSealedGlass, confirmNativeSealedOpening, confirmNativeWitness,
  loadNativeSealedPost, readNativeOwnQuote, readNativeSealedState, readNativeWitness,
  requestNativeSealedOpening, submitNativeSealedQuote, withdrawNativeSealedQuote,
} from "@/lib/town-jobs/native-sealed";
import { nativeTownPageFor, postNativeTown } from "@/lib/town-jobs/native-post";
import { loadNativeManagedTownJob, loadNativeTownDetail, askNativeTownQuestion, answerNativeTownQuestion,
  issueNativeTownAddendum, publishNativeTownAward, saveNativeTownRecommendation, sendNativeEmailInvite } from "@/lib/town-jobs/native-management";
import { nativePostsToExport, nativeRecordBundle, logNativeTownRecords } from "@/lib/town-jobs/native-records";
import { readVpsAdminInterests } from "@/lib/d1/vps-bid-inbox";
import { todayToronto } from "@/lib/town-jobs/rules";
import { newWitnessToken } from "@/lib/town-jobs/sealed-server";

it("keeps prices private until a valid second approver or one-use witness opens the box", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(readFileSync("d1/production-staging-copy-2026-11-05.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/customer-app-authority.sql", "utf8"));
    sqlite.exec(readFileSync("deploy/vps/town-sealed.sql", "utf8"));
    sqlite.exec("PRAGMA foreign_keys=ON; INSERT INTO _customer_app_authority VALUES(1,'native-v1')");
    const prepare = (sql: string, values: (string | number | null)[] = []): D1Statement => ({
      bind: (...args) => prepare(sql, args),
      first: async <T>() => (sqlite.prepare(sql).get(...values) ?? null) as T | null,
      all: async <T>() => {
        const results = sqlite.prepare(sql).all(...values) as T[];
        return { success:true,results,meta:{ changes:/^SELECT/.test(sql) ? 0 : Number(sqlite.prepare("SELECT changes() AS n").get()?.n) } };
      },
      run: async () => ({ success: true, results: [], meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } }),
    });
    const db: D1Binding = {
      prepare,
      async batch<T>(statements: D1Statement[]) {
        sqlite.exec("BEGIN");
        try {
          const rows = [];
          for (const statement of statements) rows.push(await statement.all<T>());
          sqlite.exec("COMMIT");
          return rows;
        } catch (error) {
          sqlite.exec("ROLLBACK");
          throw error;
        }
      },
    };
    sqlite.exec(`INSERT INTO organizations(id,name,slug,organization_type,status,profile_status) VALUES
      ('town','Town','town','public_buyer','active','approved'),('trade','Trade','trade','trade_company','active','approved'),
      ('other','Other','other','trade_company','active','approved');`);
    const admin = "00000000-0000-4000-8000-000000000091";
    const staffPeer = "00000000-0000-4000-8000-000000000092";
    for (const [id, org, role] of [["one", "town", "public_buyer"], ["two", "town", "public_buyer"], ["bidder", "trade", "trade"],
      ["outside", "other", "trade"], [admin, "", "admin"], [staffPeer, "", "trade"]]) {
      sqlite.prepare("INSERT INTO _auth_users(id) VALUES(?)").run(id);
      sqlite.prepare("INSERT INTO users_profile(id,email,primary_role,status) VALUES(?,?,?,'active')").run(id, id + "@example.test", role);
      if (org) sqlite.prepare("INSERT INTO organization_members(id,organization_id,user_id,role) VALUES(?,?,?,'owner')").run("m-" + id, org, id);
    }
    for (const id of ["job", "witness-job"]) {
      sqlite.prepare(`INSERT INTO rfp_posts(id,title,slug,status,source_type,deadline,buyer_key,buyer_name,post_kind,sealed,keep_alive_token,
        posted_by_user_id,posted_by_organization_id)
        VALUES(?,? ,?,'published','public_buyer_direct','2026-11-29','on/hamilton','Town','quote_request',1,?,'one','town')`)
        .run(id,id,id,id+"-token");
    }
    const job = await loadNativeSealedPost("job", db);
    if (!job) throw Error("Missing town job");
    const before = new Date("2026-11-28T00:00:00Z");
    const after = new Date("2026-11-30T12:00:00Z");
    sqlite.exec(`INSERT INTO case_studies(id,organization_id,submitted_by_user_id,title,slug,challenge,approach,outcome,status,visibility)
      VALUES('owned-project','trade','bidder','Private project','private-project','Repair it','Use a fitting','Repaired','published','private'),
        ('other-project','other','outside','Other private project','other-private-project','Repair it','Use a fitting','Repaired','published','private')`);
    const quote = { message:"Private work plan", amount:1500.27, kind:"firm" as const, notes:null, startDate:null, lang:"en" as const,
      caseStudyIds:["owned-project","other-project"] };
    expect(await submitNativeSealedQuote(job,"bidder","trade",quote,before,db)).toMatchObject({ok:true,action:"received",version:1});
    expect(await submitNativeSealedQuote(job,"bidder","trade",quote,before,db)).toMatchObject({ok:true,action:"replaced",version:2});
    expect(await readNativeOwnQuote(job.id,"bidder","trade",db)).toMatchObject({
      message:quote.message,quote_amount:1500.27,case_study_ids:["owned-project"],
    });
    expect(sqlite.prepare("SELECT count(*) AS n FROM case_study_share_links").get()?.n).toBe(0);
    expect(await readNativeOwnQuote(job.id,"outside","trade",db)).toBeNull();
    expect(await readNativeOwnQuote(job.id,"one","trade",db)).toBeNull();
    expect(await readNativeSealedState(job.id,"one",before,db)).toMatchObject({received:1,closed:false});
    expect(await readNativeSealedState(job.id,"outside",before,db)).toBeNull();
    expect(sqlite.prepare("SELECT count(*) AS n FROM rfp_interests").get()?.n).toBe(0);
    expect(await readVpsAdminInterests(admin,db)).toEqual([]);
    expect(await nativePostsToExport("outside","town",{rfpId:"job",from:null,to:null},db)).toEqual([]);
    const [exportPost] = await nativePostsToExport("one","town",{rfpId:"job",from:null,to:null},db);
    expect(await nativeRecordBundle("one","town",exportPost,db)).toMatchObject({responses:null,sealedCount:1});
    expect(() => sqlite.prepare("INSERT INTO rfp_interests(id,rfp_id,trade_organization_id) VALUES('bypass','job','trade')").run()).toThrow("sealed_quote_box_closed");
    expect(await breakNativeSealedGlass(job.id,"one","A detailed reason",db)).toEqual({ok:false,error:"not_admin"});
    expect(await breakNativeSealedGlass(job.id,admin,"A detailed reason",db)).toMatchObject({ok:true,count:1,quotes:[{message:quote.message}]});
    expect(sqlite.prepare("SELECT count(*) AS n FROM town_job_log WHERE event='sealed_break_glass'").get()?.n).toBe(1);
    expect(await requestNativeSealedOpening(job,"one",{name:null,email:null,hash:null},before,db)).toEqual({ok:false,error:"not_closed"});
    expect(await requestNativeSealedOpening(job,"one",{name:null,email:null,hash:null},after,db)).toMatchObject({ok:true,members:2});
    expect(await confirmNativeSealedOpening(job.id,"one",after,db)).toEqual({ok:false,error:"same_person"});
    expect(await confirmNativeSealedOpening(job.id,"outside",after,db)).toEqual({ok:false,error:"not_member"});
    expect(await confirmNativeSealedOpening(job.id,"two",after,db)).toEqual({ok:true,opened:1});
    expect(await confirmNativeSealedOpening(job.id,"two",after,db)).toEqual({ok:false,error:"already_open"});
    expect(sqlite.prepare("SELECT CAST(quote_amount AS REAL) AS amount FROM rfp_interests WHERE rfp_id='job'").get()?.amount).toBe(1500.27);
    expect(await nativeRecordBundle("one","town",exportPost,db)).toMatchObject({responses:[{company:"Trade",amount:1500.27}],sealedCount:null});
    expect(await readVpsAdminInterests(admin,db)).toMatchObject([{organizations:{name:"Trade"},rfp_posts:{title:"job"}}]);
    expect(await readVpsAdminInterests(staffPeer,db)).toEqual([]);
    expect(await logNativeTownRecords("one","town",["job"],{scope:"post"},db)).toBe(true);
    expect(await logNativeTownRecords("outside","town",["job"],{scope:"post"},db)).toBe(false);
    expect(await readNativeSealedState(job.id,"one",after,db)).toMatchObject({opening:{status:"opened",confirmed_by:"two",confirmed_method:"member"}});
    expect(sqlite.prepare("SELECT case_study_id,organization_id,length(token) AS len FROM case_study_share_links").all())
      .toEqual([{case_study_id:"owned-project",organization_id:"trade",len:32}]);
    const responseId = String(sqlite.prepare("SELECT id FROM rfp_interests WHERE rfp_id='job'").get()?.id);
    expect(await saveNativeTownRecommendation(job,"one",responseId,"Best available compliant quote",db)).toEqual({ok:true});
    sqlite.prepare("UPDATE rfp_interests SET status='picked' WHERE id=?").run(responseId);
    expect(await publishNativeTownAward(job,"one",{winnerName:"Trade Inc.",amount:"1500.27",amountPublic:false,awardDate:todayToronto()},db))
      .toMatchObject({ok:true});
    expect(sqlite.prepare("SELECT CAST(award_amount AS REAL) AS amount,award_amount_public AS public FROM town_job_results WHERE rfp_id='job'").get())
      .toMatchObject({amount:1500.27,public:0});

    const witnessJob = await loadNativeSealedPost("witness-job", db);
    if (!witnessJob) throw Error("Missing witnessed job");
    expect(await submitNativeSealedQuote(witnessJob,"bidder","trade",quote,before,db)).toMatchObject({ok:true,action:"received"});
    expect(await withdrawNativeSealedQuote(witnessJob,"bidder","trade",before,db)).toMatchObject({ok:true});
    expect(await readNativeOwnQuote(witnessJob.id,"bidder","trade",db)).toMatchObject({status:"withdrawn",message:null,quote_amount:null});
    sqlite.prepare("DELETE FROM organization_members WHERE user_id='two'").run();
    const first = newWitnessToken(), second = newWitnessToken();
    expect(await requestNativeSealedOpening(witnessJob,"one",{name:"Witness",email:"witness@example.test",hash:first.hash},after,db)).toMatchObject({ok:true,witness:true});
    expect(await readNativeWitness(witnessJob.id,first.token,after,db)).toMatchObject({ok:true,received:0});
    expect(await adjustNativeSealedOpening(witnessJob.id,"one",second.hash,after,db)).toMatchObject({ok:true});
    expect(await confirmNativeWitness(witnessJob.id,first.token,"Witness",after,db)).toEqual({ok:false,error:"bad_link"});
    expect(await confirmNativeWitness(witnessJob.id,second.token,"Witness",after,db)).toEqual({ok:true,opened:0});
    expect(await confirmNativeWitness(witnessJob.id,second.token,"Witness",after,db)).toEqual({ok:false,error:"bad_link"});
    expect(sqlite.prepare("SELECT count(*) AS n FROM rfp_interests WHERE rfp_id='witness-job'").get()?.n).toBe(0);
    sqlite.exec(`INSERT INTO regions(id,name,slug) VALUES('region','Ontario','ontario');
      INSERT INTO trade_categories(id,name,slug) VALUES('trade-cat','Painting','painting');
      INSERT INTO buyer_pages(buyer_key,buyer_name,province_code,organization_id,verified_method)
        VALUES('on/hamilton','Town','ON','town','email_domain')`);
    const page = await nativeTownPageFor("town","one",db);
    if (!page) throw Error("Missing verified town");
    const deadline = new Date(Date.now()+86400000*35);
    const posted = await postNativeTown("one","town","en","new-town",{
      title:"Painting at the municipal building",summary:"The town needs to refresh building walls.",scope:"Painting and touch up interior walls",
      categories:["painting"],regionSlug:"ontario",city:"Hamilton",province:"Ontario",
      contactVisibility:"pmrfp_mediated",deadline,acceptTerms:true,
    },page,{postKind:"quote_request",officialPortal:null,officialUrl:null,questionDeadline:null,sealed:false},
    {postedBy:"Town",schedule:()=>{}},db);
    if (!posted) throw Error("Could not post town job");
    expect(posted.status).toBe("published");
    expect(await loadNativeManagedTownJob("outside",posted.id,db)).toBeNull();
    const newJob = await loadNativeManagedTownJob("one",posted.id,db);
    if (!newJob) throw Error("Missing own town job");
    expect(await sendNativeEmailInvite(newJob,"outside","unauthorized@example.test","en",new Date(),db)).toEqual({state:"refused",reason:"blocked"});
    const question = await askNativeTownQuestion(newJob,"bidder","trade","How tall is the building?","en",db);
    if (!question.ok) throw Error("Could not submit question " + question.error);
    expect(await answerNativeTownQuestion(newJob,"outside",question.id,"Three floors",null,db)).toMatchObject({ok:false});
    expect(await answerNativeTownQuestion(newJob,"one",question.id,"Three floors","What is the building height?",db)).toMatchObject({ok:true});
    expect(await issueNativeTownAddendum(newJob,"one",{body:"Use a low-VOC paint."},db)).toMatchObject({ok:true,number:1});
    expect(await loadNativeTownDetail("one",newJob,db)).toMatchObject({
      questions:[{answer:"Three floors",public_question:"What is the building height?"}],addenda:[{number:1,body:"Use a low-VOC paint."}],
    });
  } finally {
    sqlite.close();
  }
});
