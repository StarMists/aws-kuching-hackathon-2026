from pathlib import Path
import json, hashlib, textwrap, math, random
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from PIL import Image,ImageDraw,ImageFont,ImageFilter
from pypdf import PdfReader
out=Path(__file__).resolve().parent / 'synthetic-civic'
out.mkdir(parents=True,exist_ok=True)
LABEL='SYNTHETIC QA FIXTURE - FICTIONAL AGENCY AND PEOPLE - NOT AN OFFICIAL RECORD'
specs=[
 {'id':'circular-v1','title':'Serai Civic Access Pilot - Circular CVD-26-17','type':'circular','date':'2026-09-14','version':'1','family':'SERAI-ACCESS-2026','previous':None,'pages':[
'''Fictional Serai Civic Development Office\nCircular CVD-26-17, version 1. Issued 14 September 2026.\nSubject: Serai Civic Access Pilot, identifier SERAI-47.\nThe proposed public launch is 12 November 2026. The planning ceiling is RM 240,000. Three service counters are proposed. The intended pilot area is Taman Serai North.\nMira Tan is the programme lead. Arif Lim coordinates operations. The participating partner is the fictional Serai Transit Unit.\nThis circular is a proposal and does not constitute procurement approval.''',
'''Rationale and dependencies\nThe proposal seeks to shorten the first-visit intake process for residents. Queue counts were not supplied, so no measured time-saving claim is established.\nThe proposed launch depends on an accessibility walkthrough and procurement clearance. The procurement clearance reference is not recorded.\nMira Tan must obtain the accessibility sign-off. No completion date for that sign-off is recorded in this version.\nThe unique filing keyword is SERAI-47-PLUM-KITE.''',
'''Proposed delivery sequence\n14 September 2026: proposal issued.\n02 October 2026: steering meeting planned.\n30 October 2026: operational readiness review planned.\n12 November 2026: proposed public launch.\nNo contractor name, signed procurement approval, or attendance count is included.''' ]},
 {'id':'meeting-minutes','title':'Serai Pilot Steering Meeting Minutes M-2026-10-02','type':'meeting minutes','date':'2026-10-02','version':'1','family':'SERAI-MINUTES-20261002','previous':None,'pages':[
'''Fictional Serai Civic Development Office\nMeeting M-2026-10-02, held 02 October 2026, 09:30-10:15.\nAttendees named in this synthetic record: Mira Tan, Arif Lim, Jo Chan. No total attendance count is recorded.\nProposal: use Circular CVD-26-17 version 1 as the working launch plan.\nDecision D-02: retain the proposed 12 November 2026 launch and three-counter arrangement for planning only. No procurement commitment was approved.\nReason: the team wanted a working date for the readiness review.''',
'''Dissent, actions, and unresolved points\nJo Chan dissented from retaining 12 November because an accessible ramp test was not scheduled.\nAction A-17: Mira Tan to submit an accessibility walkthrough report by 30 October 2026. Status: unresolved.\nAction A-18: Arif Lim to obtain a procurement clearance reference by 28 October 2026. Status: unresolved.\nThe minute-taker did not record the final supplier, formal procurement approval, or a signed ramp assessment.\nA follow-up review is planned for 30 October 2026.''' ]},
 {'id':'circular-v2','title':'Serai Civic Access Pilot - Revised Circular CVD-26-17','type':'circular','date':'2026-10-05','version':'2','family':'SERAI-ACCESS-2026','previous':'circular-v1','pages':[
'''Fictional Serai Civic Development Office\nCircular CVD-26-17, version 2. Issued 05 October 2026.\nSubject: revision of Serai Civic Access Pilot, identifier SERAI-47.\nThis revision supersedes version 1 for the planning date, ceiling, and service-counter count. The revised proposed public launch is 19 November 2026. The revised planning ceiling is RM 210,000. Two service counters are proposed. Taman Serai North remains the intended pilot area.\nMira Tan remains the programme lead. Arif Lim remains operations coordinator.\nThe revised plan is still conditional. This circular is not procurement approval.''',
'''Reason for revision and impact\nThe launch is moved by seven days because the accessible-ramp inspection cannot occur until 03 November 2026. The ceiling is lowered by RM 30,000 and one proposed counter is removed.\nThe 02 October meeting decision D-02 should be revisited because its working date and counter count were based on version 1.\nAction A-17 remains unresolved: Mira Tan must submit the accessibility walkthrough report by 30 October 2026. This due date precedes the new inspection date and requires human clarification.\nAction A-18 remains unresolved. No procurement clearance reference is attached.''',
'''Revision log and scope\nOld planning launch: 12 November 2026. New planning launch: 19 November 2026.\nOld ceiling: RM 240,000. New ceiling: RM 210,000.\nOld counter count: three. New counter count: two.\nUnchanged: programme lead, operations coordinator, intended pilot area.\nUnique revision keyword: SERAI-47-EMBER-SPOON.\nNo source in this revised circular states the number of residents served or a measured waiting-time reduction.''' ]},
 {'id':'operations-note','title':'Serai Transit Operational Readiness Note O-11','type':'operational note','date':'2026-10-06','version':'1','family':'SERAI-OPS-11','previous':None,'pages':[
'''Fictional Serai Transit Unit\nOperational Readiness Note O-11, issued 06 October 2026 by Arif Lim.\nThe note schedules a staff rehearsal for 17 November 2026 at 14:00. The public launch is listed as 12 November 2026 and the layout lists three counters.\nThese launch/layout values conflict with revised Circular CVD-26-17 version 2, dated 05 October 2026, which proposes 19 November and two counters. This note gives no explanation for retaining the older values.\nThe note states: ramp access is operationally ready. No signed accessibility assessment is attached.\nHuman review is required before treating this readiness statement as formal accessibility clearance.\nThere is no procurement clearance reference in this note.''' ]}
]
W,H=A4
for spec in specs:
 name=spec['id']; pdf=out/(name+'.pdf'); txt=out/(name+'.txt')
 txt.write_text('\n\f\n'.join(LABEL+'\n'+p for p in spec['pages'])+'\n')
 c=canvas.Canvas(str(pdf),pagesize=A4); c.setTitle(spec['title']); c.setAuthor('Original synthetic QA fixture')
 for n,p in enumerate(spec['pages'],1):
  c.setFont('Helvetica-Bold',8); c.setFillColorRGB(.4,.1,.1); c.drawString(40,H-34,'SYNTHETIC QA FIXTURE / FICTIONAL / NOT AN OFFICIAL RECORD')
  c.setFillColorRGB(.1,.1,.1); c.setFont('Helvetica-Bold',14); c.drawString(40,H-64,spec['title'][:69])
  y=H-100;c.setFont('Helvetica',11)
  for paragraph in p.split('\n'):
   for line in textwrap.wrap(paragraph,width=85):c.drawString(40,y,line);y-=16
   y-=10
  c.setFont('Helvetica',9);c.drawString(40,30,f'{name} | source date {spec["date"]} | version {spec["version"]} | page {n}')
  c.showPage()
 c.save()
 assert len(PdfReader(pdf).pages)==len(spec['pages'])
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
font=ImageFont.truetype(fontpath,33);small=ImageFont.truetype(fontpath,23);bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',40)
photo_lines=[
'SYNTHETIC FIELD NOTE - NOT AN OFFICIAL RECORD',
'Fictional Serai Civic Development Office',
'Accessibility Walkthrough Field Slip F-23',
'Date: 07 October 2026',
'Location: Taman Serai North, Gate B',
'Inspector: Jo Chan (fictional)',
'Observation: west ramp width is 112 cm.',
'The temporary ramp is NOT signed off.',
'Action: request a signed ramp assessment.',
'Action owner: Mira Tan. Due: 30 October 2026.',
'Unique photo keyword: SERAI-47-LANTERN-PEAR.',
'No procurement approval is recorded.'
]
canvas_image=Image.new('RGB',(1700,1250),(114,111,103));paper=Image.new('RGB',(1500,1050),(247,244,231));d=ImageDraw.Draw(paper)
d.rectangle((25,25,1474,1024),outline=(128,125,115),width=2)
y=54
for i,line in enumerate(photo_lines):
 d.text((58,y),line,fill=(34,35,35),font=small if i==0 else font);y+=70
paper=paper.rotate(2.2,resample=Image.Resampling.BICUBIC,expand=True,fillcolor=(114,111,103));canvas_image.paste(paper,((1700-paper.width)//2,(1250-paper.height)//2));canvas_image=canvas_image.filter(ImageFilter.GaussianBlur(.18));canvas_image.save(out/'field-slip-photo.jpg',quality=92)
(out/'field-slip-photo.txt').write_text('\n'.join(photo_lines)+'\n')
c=canvas.Canvas(str(out/'field-slip-scanned.pdf'),pagesize=A4);c.setTitle('Synthetic scanned field slip F-23');c.drawImage(str(out/'field-slip-photo.jpg'),0,150,width=W,height=W*1250/1700);c.showPage();c.save()
assert not PdfReader(out/'field-slip-scanned.pdf').pages[0].extract_text().strip()
truth={
 'synthetic':True,'rights':'Original fixtures written for this project. Fictional people, agencies, documents, decisions and figures. No official government or company records.',
 'upload_files':[s['id']+'.pdf' for s in specs]+['field-slip-photo.jpg','field-slip-scanned.pdf'],
 'documents':[{k:v for k,v in s.items() if k!='pages'}|{'page_count':len(s['pages'])} for s in specs],
 'facts':[
  {'key':'initial_launch','value':'2026-11-12','source':'circular-v1','page':1},
  {'key':'revised_launch','value':'2026-11-19','source':'circular-v2','page':1},
  {'key':'initial_ceiling','value':240000,'currency':'MYR','source':'circular-v1','page':1},
  {'key':'revised_ceiling','value':210000,'currency':'MYR','source':'circular-v2','page':1},
  {'key':'revised_counters','value':2,'source':'circular-v2','page':1},
  {'key':'dissent','value':'Jo Chan objected because an accessible ramp test was not scheduled.','source':'meeting-minutes','page':2},
  {'key':'action_A17','value':'Mira Tan must submit accessibility walkthrough report by 2026-10-30; unresolved.','source':'circular-v2','page':2},
  {'key':'rehearsal','value':'2026-11-17T14:00:00','source':'operations-note','page':1},
  {'key':'ramp_width','value':'112 cm','source':'field-slip-photo.jpg','page':1},
  {'key':'photo_nonce','value':'SERAI-47-LANTERN-PEAR','source':'field-slip-photo.jpg','page':1}
 ],
 'contradictions':[
  {'field':'public launch','old':'12 November 2026','new':'19 November 2026','sources':['circular-v1:p1','meeting-minutes:p1','circular-v2:p1','operations-note:p1'],'interpretation':'Version 2 supersedes circular version 1. Operations note retains older values without explanation; human review required.'},
  {'field':'counter count','old':'three','new':'two','sources':['circular-v1:p1','meeting-minutes:p1','circular-v2:p1','operations-note:p1']},
  {'field':'accessibility','sources':['circular-v2:p2','operations-note:p1','field-slip-photo.jpg:p1'],'interpretation':'Operationally-ready statement is not signed clearance. Field slip says NOT signed off.'}
 ],
 'gaps':['Final contractor/supplier identity','Procurement clearance reference','Signed ramp assessment','Measured waiting-time reduction','Number of residents served','Total meeting attendance'],
 'timeline':[
  {'date':'2026-09-14','event':'Initial circular issued','source':'circular-v1:p1'},
  {'date':'2026-10-02','event':'Planning decision D-02 and dissent','source':'meeting-minutes:p1-2'},
  {'date':'2026-10-05','event':'Revision moves planning launch and changes ceiling/counters','source':'circular-v2:p1-3'},
  {'date':'2026-10-06','event':'Conflicting operational note issued','source':'operations-note:p1'},
  {'date':'2026-10-07','event':'Field slip records width and no sign-off','source':'field-slip-photo.jpg:p1'},
  {'date':'2026-10-28','event':'Unresolved procurement reference due','source':'meeting-minutes:p2'},
  {'date':'2026-10-30','event':'Unresolved accessibility report/readiness review due','source':'meeting-minutes:p2'},
  {'date':'2026-11-03','event':'Ramp inspection can occur','source':'circular-v2:p2'},
  {'date':'2026-11-17','event':'Staff rehearsal scheduled','source':'operations-note:p1'},
  {'date':'2026-11-19','event':'Revised conditional proposed launch','source':'circular-v2:p1'}
 ],
 'cases':{
 'related':'A service pilot proposed three counters and a November launch. A newer circular reduces its ceiling and moves launch after accessibility inspection, but an operational note still uses the old plan. Reconstruct the rule changes, dissent, unresolved approvals, and decisions requiring confirmation.',
 'unrelated':'A harbour lighthouse replacement in 2018 had a certified supplier and signed maritime permit. Find the approved supplier and permit number.'},
 'questions':[
  {'query':'What is the revised proposed launch for SERAI-47 and why did it change?','expected':['19 November 2026','accessible-ramp inspection','03 November 2026'],'sources':['circular-v2:p1-2']},
  {'query':'Who owns the unresolved accessibility report, and when is it due?','expected':['Mira Tan','30 October 2026','unresolved'],'sources':['meeting-minutes:p2','circular-v2:p2']},
  {'query':'Who is the approved contractor and what is their procurement approval number?','expected':['insufficient evidence'],'forbidden':['invented contractor','invented approval number']},
  {'query':'Does every document agree on the public launch and number of counters?','expected':['12 November','19 November','three','two','conflict','supersedes'],'sources':['circular-v2:p1','operations-note:p1']},
  {'query':'What width does the field-slip photo record for the west ramp?','expected':['112 cm'],'sources':['field-slip-photo.jpg:p1']}
 ]}
truth['sha256']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in out.iterdir() if p.is_file()}
(out/'truth.json').write_text(json.dumps(truth,indent=2)+'\n')
print(f'Created {len(list(out.iterdir()))} original synthetic fixture files at {out}')
