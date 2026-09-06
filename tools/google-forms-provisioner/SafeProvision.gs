function provisionAllQASafe(){
  const keys=['QA_NOTICIAS','QA_EQUIPOS','QA_PLANTEL','QA_PARTIDOS','QA_TABLA','QA_GALERIA'];
  const results={},errors=[];
  keys.forEach(key=>{
    try{
      // Reconcile every form against FORM_SPEC first. For PARTIDOS this deliberately
      // removes any prior navigation/page breaks; ensurePartidosBranchingQA() runs
      // immediately afterwards and reapplies the two human branches deterministically.
      results[key]=provisionForm_(CUDO_FORMS_CONFIG[key]);
    }catch(err){
      const msg=String(err&&err.message?err.message:err);
      results[key]={ERROR:msg};errors.push(`${key}: ${msg}`);
    }
  });
  if(errors.length)throw new Error(`Provisionamiento QA seguro incompleto (${errors.length}/${keys.length} con error):\n${errors.join('\n')}`);
  return results;
}
