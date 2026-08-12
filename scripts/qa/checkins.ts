import { Client } from "pg";
import { buildQuery, querySchema } from "./api/_lib/query";
const uri = JSON.parse(require("fs").readFileSync("/tmp/neon_uri.json","utf8")).uri;

const results: any[] = [];
function log(name:string, expected:string, actual:string, pass:boolean){ results.push({name,expected,actual,pass}); }

async function asUser(c:any, id:string, fn:()=>Promise<any>, rollback=false){
  await c.query("BEGIN");
  await c.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:"authenticated"})]);
  await c.query("SELECT set_config('role','authenticated',true)");
  try { const r = await fn(); await c.query(rollback?"ROLLBACK":"COMMIT"); return r; }
  catch(e){ await c.query("ROLLBACK"); throw e; }
}
const run = (c:any, input:any) => { const q = buildQuery(querySchema.parse(input)); return c.query(q.text,q.params); };

(async()=>{
  const c = new Client({connectionString:uri}); await c.connect();
  const {rows:[pick]} = await c.query("select client_id, week_start from public.weekly_checkins order by week_start desc limit 1");
  const {rows:[other]} = await c.query("select user_id from public.profiles where user_id <> $1 and user_id not in (select coach_id from public.invitations where accepted_user_id=$1) limit 1",[pick.client_id]);
  const {rows:[coach]} = await c.query("select coach_id from public.invitations where accepted_user_id=$1 limit 1",[pick.client_id]);

  // 1 client reads own checkins
  let r = await asUser(c, pick.client_id, ()=>run(c,{table:"weekly_checkins",action:"select",columns:"id,week_start,weight_kg",filters:[{op:"eq",column:"client_id",value:pick.client_id}],order:[{column:"week_start",ascending:false}],limit:10}));
  log("client reads own check-ins",">0 rows",`${r.rowCount} rows`, r.rowCount>0);

  // 2 stranger blocked
  r = await asUser(c, other.user_id, ()=>run(c,{table:"weekly_checkins",action:"select",filters:[{op:"eq",column:"client_id",value:pick.client_id}]}));
  log("unrelated user reads check-ins","0 rows",`${r.rowCount} rows`, r.rowCount===0);

  // 3 coach reads client checkins
  if(coach){ r = await asUser(c, coach.coach_id, ()=>run(c,{table:"weekly_checkins",action:"select",filters:[{op:"eq",column:"client_id",value:pick.client_id}]}));
    log("coach reads client check-ins",">0 rows",`${r.rowCount} rows`, r.rowCount>0); }

  // 4 upsert (rolled back)
  const wk = "2020-01-06";
  r = await asUser(c, pick.client_id, async()=>{
    await run(c,{table:"weekly_checkins",action:"upsert",values:{client_id:pick.client_id,week_start:wk,weight_kg:80,details:{}},onConflict:"client_id,week_start",columns:"id,weight_kg"});
    return run(c,{table:"weekly_checkins",action:"upsert",values:{client_id:pick.client_id,week_start:wk,weight_kg:81.5,details:{}},onConflict:"client_id,week_start",columns:"id,weight_kg"});
  }, true);
  log("client upserts check-in twice","single row, weight 81.5",`${r.rowCount} row(s), weight ${r.rows[0]?.weight_kg}`, r.rowCount===1 && Number(r.rows[0].weight_kg)===81.5);

  // 5 stranger cannot insert for someone else
  let blocked=false, msg="";
  try{ await asUser(c, other.user_id, ()=>run(c,{table:"weekly_checkins",action:"insert",values:{client_id:pick.client_id,week_start:wk,weight_kg:70,details:{}}}), true); }
  catch(e:any){ blocked=true; msg=e.message.slice(0,40); }
  log("stranger writes another user's check-in","rejected by RLS", blocked?`rejected: ${msg}`:"allowed", blocked);

  // 6 maybeSingle shape
  r = await asUser(c, pick.client_id, ()=>run(c,{table:"weekly_checkins",action:"select",columns:"submitted_at",filters:[{op:"eq",column:"client_id",value:pick.client_id},{op:"eq",column:"week_start",value:pick.week_start}]}));
  log("maybeSingle lookup by week","exactly 1 row",`${r.rowCount} rows`, r.rowCount===1);

  // 7 review drafts read by coach + not-null filter
  if(coach){ r = await asUser(c, coach.coach_id, ()=>run(c,{table:"weekly_review_drafts",action:"select",columns:"id,week_start,published_at",filters:[{op:"eq",column:"coach_id",value:coach.coach_id}],order:[{column:"week_start",ascending:false}]}));
    log("coach lists review drafts","no error, rows>=0",`${r.rowCount} rows`, true);
    r = await asUser(c, coach.coach_id, ()=>run(c,{table:"weekly_review_drafts",action:"select",columns:"id",filters:[{op:"not_is",column:"published_at",value:null}]}));
    log("published-only filter (not is null)","no error",`${r.rowCount} rows`, true);
    // 8 coach updates draft (rolled back)
    const {rows:d} = await c.query("select id from public.weekly_review_drafts where coach_id=$1 limit 1",[coach.coach_id]);
    if(d[0]){ r = await asUser(c, coach.coach_id, ()=>run(c,{table:"weekly_review_drafts",action:"update",values:{voice_memo:"qa test"},filters:[{op:"eq",column:"id",value:d[0].id}],columns:"id,voice_memo"}), true);
      log("coach updates own draft","1 row updated",`${r.rowCount} row(s)`, r.rowCount===1); }
  }

  // 9 injection guard
  let guard=false; try{ buildQuery(querySchema.parse({table:"weekly_checkins",action:"select",columns:"id; drop table x"})); }catch{ guard=true; }
  log("SQL injection via column list","rejected", guard?"rejected":"accepted", guard);
  let guard2=false; try{ buildQuery(querySchema.parse({table:"auth.users",action:"select"})); }catch{ guard2=true; }
  log("non-allow-listed table","rejected", guard2?"rejected":"accepted", guard2);

  await c.end();
  console.table(results.map(r=>({QA:r.name,Expected:r.expected,Actual:r.actual,Result:r.pass?"PASS":"FAIL"})));
  console.log(results.every(r=>r.pass)?"ALL PASS":"FAILURES PRESENT");
})();
