(()=>{
  window.CUDO_DATA_ENV={
    environment:'QA',
    source:'GOOGLE_FORMS_SHEETS_TEST',
    mock:false
  };
  window.cudoResolveDataUrl=async realUrl=>realUrl;
})();
