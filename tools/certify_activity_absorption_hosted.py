#!/usr/bin/env python3
import json, os, re, signal, subprocess, time, urllib.request
from pathlib import Path
import yaml

ROOT=Path(__file__).resolve().parents[1]
CONTRACT=ROOT/'.arke/CUDO_ACTIVITY_ABSORPTION_CERTIFIER_CONTRACT_V1.yaml'
OUTDIR=ROOT/'evidence/hosted-activity-certifier'
TMP=Path('/tmp/cudo-hosted-certifier')
PORT=4177
IMAGE='mcr.microsoft.com/playwright/python:v1.44.0-jammy'

def run(cmd, check=True, timeout=None, cwd=None):
    cp=subprocess.run(cmd,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=timeout)
    if check and cp.returncode:
        raise RuntimeError(f"rc={cp.returncode} {' '.join(cmd)}\n{cp.stdout[-6000:]}")
    return cp

def wait_http(url, seconds=45):
    end=time.time()+seconds
    while time.time()<end:
        try:
            with urllib.request.urlopen(url,timeout=3) as r:
                if r.status==200:return
        except Exception: pass
        time.sleep(1)
    raise RuntimeError('target did not become ready')

def verify_ollama(model):
    with urllib.request.urlopen('http://127.0.0.1:11434/api/tags',timeout=10) as r:
        data=json.load(r)
    names={str(x.get('name')) for x in data.get('models') or []}
    if model not in names: raise RuntimeError(f'model missing: {model}')

REVIEWER=r"""
import json, os, re, urllib.request
from pathlib import Path
from urllib.parse import urljoin,urlparse
import gymnasium as gym
import browsergym.core

m=json.loads(Path('/tmp/mission.json').read_text())
base=os.environ['TARGET_URL']; model=os.environ['OLLAMA_MODEL']
origin=urlparse(base); allowed='/preview-v8/'
groups=m['semantic_groups']; required=m['required_branch_groups']; primary=m['required_primary_context']
min_branches=int(m['minimum_branch_groups_on_one_surface']); max_pages=int(m['maximum_same_origin_pages'])
action_terms=['registrar','agregar','comprar','compra','vender','venta','guardar','cerrar','conciliar','resultado','actualizar','asignar']

def norm(x): return re.sub(r'\s+',' ',str(x or '')).strip().lower()
def hits(text):
    low=norm(text); return {k:[t for t in vals if norm(t) in low] for k,vals in groups.items()}

env=gym.make('browsergym/openended',task_kwargs={'start_url':base,'goal':m['human_goal']},headless=True,viewport={'width':1280,'height':900})
try:
    env.reset(seed=0); page=env.unwrapped.page
    queue=[urljoin(base,p) for p in m['discovery_paths']]; seen=set(); pages=[]
    while queue and len(pages)<max_pages:
        u=queue.pop(0); p=urlparse(u)
        if p.netloc!=origin.netloc or not p.path.startswith(allowed): continue
        u=p._replace(fragment='').geturl()
        if u in seen: continue
        seen.add(u)
        try:
            resp=page.goto(u,wait_until='domcontentloaded',timeout=20000); page.wait_for_timeout(650)
            body=page.locator('body').inner_text(timeout=8000)
            labels=page.locator('button,a[href],input[type=submit],input[type=button]').evaluate_all(
                "els=>els.map(e=>(e.innerText||e.value||e.getAttribute('aria-label')||'').trim()).filter(Boolean)")
            hrefs=page.locator('a[href]').evaluate_all("els=>els.map(e=>e.href).filter(Boolean)")
            gh=hits(body); branches=[g for g in required if gh.get(g)]
            actions=[x for x in labels if any(t in norm(x) for t in action_terms)]
            rec={'url':u,'status':resp.status if resp else None,'title':page.title(),'visible_excerpt':body[:7000],
                 'group_hits':gh,'required_branch_groups_visible':branches,'required_branch_count':len(branches),
                 'primary_event_context_visible':bool(gh.get(primary)),'actionable_labels':actions[:30],
                 'actionable_label_count':len(actions)}
            pages.append(rec)
            for h in hrefs:
                hp=urlparse(h)
                if hp.netloc==origin.netloc and hp.path.startswith(allowed):
                    c=hp._replace(fragment='').geturl()
                    if c not in seen and c not in queue: queue.append(c)
        except Exception as e:
            pages.append({'url':u,'error':str(e),'required_branch_count':0,'primary_event_context_visible':False,'actionable_label_count':0})
    scored=sorted(pages,key=lambda x:(1 if x.get('primary_event_context_visible') else 0,int(x.get('required_branch_count') or 0),int(x.get('actionable_label_count') or 0)),reverse=True)
    best=scored[0] if scored else None
    deterministic=bool(best and best.get('primary_event_context_visible') and int(best.get('required_branch_count') or 0)>=min_branches and int(best.get('actionable_label_count') or 0)>=2)
    failure=None
    if not best: failure='NO_CUDO_WEB_SURFACE_DISCOVERED'
    elif not best.get('primary_event_context_visible'): failure='NO_PRIMARY_EVENT_CONTEXT_VISIBLE'
    elif int(best.get('required_branch_count') or 0)<min_branches: failure='NO_SINGLE_CUDO_WEB_SURFACE_EXPOSES_REQUIRED_EVENT_STATE'
    elif int(best.get('actionable_label_count') or 0)<2: failure='INTEGRATED_SURFACE_NOT_OPERABLE'
    if best:
        page.goto(best['url'],wait_until='domcontentloaded',timeout=20000); page.wait_for_timeout(500)
        page.screenshot(path='/evidence/reviewer.png',full_page=True)
    evidence=[{k:r.get(k) for k in ('url','title','primary_event_context_visible','required_branch_groups_visible','actionable_labels','visible_excerpt','error')} for r in scored[:10]]
    prompt=f"""You are the independent human-first certifier for an amateur sports club web system.
You do not have source code, PR context, architecture documentation, or the builder's explanation.
Judge only the browser-visible evidence and the canonical human mission.

CANONICAL HUMAN MISSION:
{m['human_goal']}

VISIBLE CUDO WEB EVIDENCE:
{json.dumps(evidence,ensure_ascii=False,indent=2)}

DETERMINISTIC OBSERVATION:
pass={str(deterministic).lower()}
first_failure={failure or 'none'}

Return ONLY valid JSON with exactly these keys:
verdict: "PASS" or "FAIL"
real_world_context: string
integrated_surface_found: boolean
branches_visible: array of strings
can_operate_without_module_reconstruction: boolean
double_entry_risk: boolean
technical_language_needed: boolean
unresolved_confusion: array of strings
first_failure: string
reason: string

PASS is allowed only if deterministic acceptance is green and a normal club administrator can satisfy the canonical human mission from the visible CUDO Web surface. If visible evidence does not prove the whole mission, return FAIL."""
    req=urllib.request.Request('http://127.0.0.1:11434/api/chat',data=json.dumps({'model':model,'stream':False,'format':'json','messages':[{'role':'user','content':prompt}],'options':{'temperature':0}}).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(req,timeout=300) as r: ollama=json.load(r)
    verdict=json.loads((ollama.get('message') or {}).get('content') or '{}')
    required_keys=['verdict','real_world_context','integrated_surface_found','branches_visible','can_operate_without_module_reconstruction','double_entry_risk','technical_language_needed','unresolved_confusion','first_failure','reason']
    missing=[k for k in required_keys if k not in verdict]
    if missing: raise RuntimeError('structured verdict missing '+','.join(missing))
    semantic=((deterministic and verdict['verdict']=='PASS') or ((not deterministic) and verdict['verdict']=='FAIL'))
    decision='PASS' if deterministic and verdict['verdict']=='PASS' and semantic and verdict['integrated_surface_found'] is True and verdict['can_operate_without_module_reconstruction'] is True and verdict['technical_language_needed'] is False and len(verdict['unresolved_confusion'])==0 else 'FAIL'
    report={'schema_version':'CUDO_HOSTED_HUMAN_CERTIFIER_RESULT_V1','decision':decision,'deterministic_acceptance_pass':deterministic,
            'model_verdict':verdict['verdict'],'semantic_consistency_pass':semantic,'first_demonstrated_failure':failure or verdict.get('first_failure'),
            'reviewer_engine':'BrowserGym_OpenEndedTask','local_model':model,'execution_host':'github_hosted_ephemeral',
            'production_write':False,'reviewer_source_code_access':False,'reviewer_pr_context_access':False,'reviewer_repo_mounted':False,
            'paid_model_api_used':False,'paid_browser_api_used':False,'pages_visited':pages,'best_integrated_candidate':best,'verdict':verdict}
    Path('/evidence/result.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2))
finally:
    env.close()
"""

def main():
    c=yaml.safe_load(CONTRACT.read_text())
    model=c['reviewer']['local_model']; verify_ollama(model)
    TMP.mkdir(parents=True,exist_ok=True); OUTDIR.mkdir(parents=True,exist_ok=True)
    mission={'human_goal':c['mission']['human_goal'],'semantic_groups':c['semantic_groups'],
             'required_primary_context':c['deterministic_acceptance']['required_primary_context'],
             'required_branch_groups':c['deterministic_acceptance']['required_branch_groups'],
             'minimum_branch_groups_on_one_surface':c['deterministic_acceptance']['minimum_branch_groups_on_one_surface'],
             'maximum_same_origin_pages':c['target']['maximum_same_origin_pages'],'discovery_paths':c['target']['discovery_paths']}
    (TMP/'mission.json').write_text(json.dumps(mission,ensure_ascii=False,indent=2))
    (TMP/'reviewer.py').write_text(REVIEWER)
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT,start_new_session=True)
    try:
        base=f'http://127.0.0.1:{PORT}{c["target"]["web_root"]}'; wait_http(base)
        run(['docker','pull',IMAGE],timeout=600)
        ev=TMP/'evidence'; ev.mkdir(exist_ok=True)
        cp=run(['docker','run','--rm','--network=host','-e',f'TARGET_URL={base}','-e',f'OLLAMA_MODEL={model}',
                '-e','ANONYMIZED_TELEMETRY=false','-v',f'{TMP/"reviewer.py"}:/tmp/reviewer.py:ro',
                '-v',f'{TMP/"mission.json"}:/tmp/mission.json:ro','-v',f'{ev}:/evidence',IMAGE,'bash','-lc',
                "pip install --no-cache-dir 'browsergym-core==0.14.3' >/tmp/browsergym-install.log && python /tmp/reviewer.py"],timeout=1200)
        result=json.loads((ev/'result.json').read_text())
        result['source_contract']=str(CONTRACT.relative_to(ROOT)); result['source_arke_sha']='2d48d6b7f3d41a9c24804730e71c40b87b093767'
        result['candidate_commit']=run(['git','rev-parse','HEAD']).stdout.strip()
        result['control_expected_current_result']=c['mission']['expected_current_control_result']
        result['control_expectation_met']=result['decision']==c['mission']['expected_current_control_result']
        (OUTDIR/'latest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
        if (ev/'reviewer.png').exists(): (OUTDIR/'latest.png').write_bytes((ev/'reviewer.png').read_bytes())
        (OUTDIR/'latest.md').write_text(
            '# CUDO Hosted Activity Absorption Certifier\n\n'
            f"decision: {result['decision']}\n"
            f"deterministic_acceptance_pass: {str(result['deterministic_acceptance_pass']).lower()}\n"
            f"model_verdict: {result['model_verdict']}\n"
            f"semantic_consistency_pass: {str(result['semantic_consistency_pass']).lower()}\n"
            f"execution_host: {result['execution_host']}\n"
            f"local_model: {result['local_model']}\n"
            'paid_credits_used: 0\nproduction_write: false\n'
            f"source_arke_sha: {result['source_arke_sha']}\n\n"
            f"reason: {(result.get('verdict') or {}).get('reason','')}\n")
        print(cp.stdout[-12000:]); print(json.dumps(result,ensure_ascii=False,indent=2))
    finally:
        try: os.killpg(server.pid,signal.SIGTERM)
        except Exception: pass

if __name__=='__main__': main()
