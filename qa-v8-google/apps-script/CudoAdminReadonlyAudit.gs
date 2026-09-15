function cudoAdminReadonlyAudit() {
  const forms = [
    { key: 'EQUIPO', id: '1Ila0fWY-bAq5Biuzn5Hp1_CdcDiiLXex91x62zKCUkk' },
    { key: 'PARTIDO', id: '1ZujRoboJGqqkKQJBwJeD1UNMiIYnDzstSWL24n_TtCA' },
    { key: 'TABLA', id: '1teEHaQ1xRGJX3Y0sFsF7Y_j67usO-wssXgzCqpPYfUc' },
    { key: 'REVIEW', id: '1YHuKTdApT0dawISYNAolVjn1HlpI7cuBQOs8T7cRgnw' },
    { key: 'MAINTENANCE', id: '1vry-EQ7V_DvD6ZF64OaHk4KXtTjtvonIfnnYaG1rruw' },
  ];

  function safe(call) {
    try { return { supported: true, value: call() }; }
    catch (err) { return { supported: false, error: String(err && err.message ? err.message : err) }; }
  }

  const result = {};
  forms.forEach(function(entry) {
    const form = FormApp.openById(entry.id);
    result[entry.key] = {
      formId: form.getId(),
      title: form.getTitle(),
      publishedUrl: form.getPublishedUrl(),
      destinationId: form.getDestinationId(),
      accepting: form.isAcceptingResponses(),
      collectsEmail: safe(function() { return form.collectsEmail(); }),
      limitOneResponsePerUser: safe(function() { return form.hasLimitOneResponsePerUser(); }),
      respondAgainLink: safe(function() { return form.hasRespondAgainLink(); }),
      requiresLogin: safe(function() { return form.requiresLogin(); }),
      supportsAdvancedResponderPermissions: safe(function() { return form.supportsAdvancedResponderPermissions(); }),
      published: safe(function() { return form.isPublished(); }),
      confirmation: form.getConfirmationMessage(),
      items: form.getItems().map(function(item, index) {
        const row = { index: index, title: item.getTitle(), type: String(item.getType()) };
        try {
          if (item.getType() === FormApp.ItemType.LIST) {
            row.choices = item.asListItem().getChoices().map(function(choice) { return choice.getValue(); });
          } else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
            row.choices = item.asMultipleChoiceItem().getChoices().map(function(choice) { return choice.getValue(); });
          } else if (item.getType() === FormApp.ItemType.CHECKBOX) {
            row.choices = item.asCheckboxItem().getChoices().map(function(choice) { return choice.getValue(); });
          }
        } catch (err) {
          row.choiceAuditError = String(err && err.message ? err.message : err);
        }
        return row;
      })
    };
  });
  return result;
}
