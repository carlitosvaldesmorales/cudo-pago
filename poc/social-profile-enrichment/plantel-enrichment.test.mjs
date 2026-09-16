import assert from 'node:assert/strict';
import { enrichPlantelForReview } from './plantel-enrichment.mjs';

const noCall = async () => { throw new Error('resolver should not be called'); };

const uploaded = await enrichPlantelForReview({FOTO_REF:'https://example.test/foto.jpg',RED_SOCIAL_REF:'@jugador'}, {resolve:noCall});
assert.equal(uploaded.review_enrichment.status,'USER_PHOTO_PRESENT');
assert.equal(uploaded.review_enrichment.selected_photo_source,'USER_UPLOAD');
assert.equal(uploaded.review_enrichment.blocking,false);

const empty = await enrichPlantelForReview({FOTO_REF:'',RED_SOCIAL_REF:''}, {resolve:noCall});
assert.equal(empty.review_enrichment.status,'NO_SOCIAL_REFERENCE');
assert.equal(empty.review_enrichment.blocking,false);

const profile = await enrichPlantelForReview({FOTO_REF:'',RED_SOCIAL_REF:'@jugador'}, {resolve:async()=>({provider:'instagram',kind:'profile',canonical_url:'https://www.instagram.com/jugador/',image_candidate:null,reason:'PROFILE_REFERENCE_PRESERVED_NO_IMAGE_PROMISE'})});
assert.equal(profile.review_enrichment.status,'SOCIAL_REFERENCE_ONLY');
assert.equal(profile.review_enrichment.photo_candidate,null);
assert.equal(profile.review_enrichment.blocking,false);

const post = await enrichPlantelForReview({FOTO_REF:'',RED_SOCIAL_REF:'https://www.instagram.com/p/ABC123/'}, {resolve:async()=>({provider:'instagram',kind:'post',canonical_url:'https://www.instagram.com/p/ABC123/',image_candidate:{source_url:'https://cdn.example.test/x.jpg',content_type:'image/jpeg',bytes:12345,source_host:'cdn.example.test'},reason:'PUBLIC_CONTENT_IMAGE_CANDIDATE_PASS'})});
assert.equal(post.review_enrichment.status,'SOCIAL_PHOTO_CANDIDATE');
assert.equal(post.review_enrichment.selected_photo_source,'SOCIAL_CANDIDATE_PENDING_REVIEW');
assert.equal(post.review_enrichment.photo_candidate.bytes,12345);
assert.equal(post.review_enrichment.blocking,false);

const failed = await enrichPlantelForReview({FOTO_REF:'',RED_SOCIAL_REF:'https://www.facebook.com/x/posts/y'}, {resolve:async()=>{throw new Error('provider unavailable');}});
assert.equal(failed.review_enrichment.status,'ENRICHMENT_ERROR_NON_BLOCKING');
assert.equal(failed.review_enrichment.blocking,false);
assert.equal(failed.review_enrichment.selected_photo_source,'NONE');

console.log(JSON.stringify({status:'PASS',cases:5,policy:'USER_UPLOAD_FIRST_SOCIAL_OPTIONAL_NON_BLOCKING'}));
