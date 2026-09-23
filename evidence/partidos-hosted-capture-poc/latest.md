# CUDO Partidos Hosted Capture POC

decision: FAIL
run_id: 35850832969
execution_plane: GitHub_hosted
marker: CUDO-QA-HOSTED-PARTIDO-35850832969
production_write: false
form_submit_confirmed: true
postflight: null
error: Error: Sheets read 'PUBLICO_EXPORT'!A:AZ HTTP 429: Quota exceeded for quota metric 'Read requests' and limit 'Read requests per minute per user' of service 'sheets.googleapis.com' for consumer 'project_number:257090036200'.     at readValues (file:///work/qa-v8-google/tools/prove_partidos_hosted_capture.mjs:63:19)     at process.processTicksAndRejections (node:internal/process/task_queues:105:5)     at async Promise.all (index 3)     at async stageSnapshot (file:///work/qa-v8-google/tools/prove_partidos_hosted_capture.mjs:70:36)     at async waitForStages (file:///work/qa-v8-google/tools/prove_partidos_hosted_capture.mjs:88:10)     at async main (file:///work/qa-v8-google/tools/prove_partidos_hosted_capture.mjs:205:25)
