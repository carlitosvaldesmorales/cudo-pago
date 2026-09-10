import worker from './telegram-migration-entry.js';
import { handlePublicResultsTableView } from './worker/public-results-table-view.js';

const NEXT_WEBHOOK_PATH = '/webhook/telegram-next';

async function normalizeDestinationResultsCommand(request) {
  const url = new URL(request.url);
  if (url.pathname !== NEXT_WEBHOOK_PATH || request.method !== 'POST') return request;

  let update;
  try {
    update = await request.clone().json();
  } catch {
    return request;
  }

  const message = update?.message;
  const text = String(message?.text || '').trim();
  if (!message?.from?.id || !message?.chat?.id || !/^\/resultados(?:@\w+)?$/i.test(text)) {
    return request;
  }

  // On the destination bot, /resultados means the public results view.
  // The administrative registry remains available from the explicit
  // "Resultados registrados" button inside the dirigente/admin portal.
  const normalized = {
    ...update,
    callback_query: {
      from: message.from,
      message,
      data: 'tp:public-results'
    }
  };

  return new Request(request.url, {
    method: request.method,
    headers: new Headers(request.headers),
    body: JSON.stringify(normalized)
  });
}

export default {
  async fetch(request, env, ctx) {
    const normalized = await normalizeDestinationResultsCommand(request);
    const allResults = await handlePublicResultsTableView(normalized.clone(), env);
    if (allResults) return allResults;
    return worker.fetch(normalized, env, ctx);
  }
};
