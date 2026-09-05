function installReviewTrigger_(formId) {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'handleReviewSubmitQA')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('handleReviewSubmitQA')
    .forForm(FormApp.openById(formId))
    .onFormSubmit()
    .create();
}
