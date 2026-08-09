# AI Pass integration

This fork keeps provider access tied to the signed-in user's AI Pass OAuth account. The marker
`aipass_oauth` is resolved at request time to that user's current access token and is never sent to
AI Pass as a literal credential.

## Chat models

The AI Pass custom endpoint discovers chat models at runtime from:

```text
GET /v1/models?type=text&method=chat_completions
```

The canonical `/v1` API identifies the Bearer credential as an OAuth token or an API key. LibreChat
sends the signed-in user's OAuth token; no compatibility client-id header is required.

Keep the AI Pass endpoint's `models.fetch` setting enabled and avoid pinning the same models in
`modelSpecs`. Model specs are static shortcuts; leaving an old curated list there makes removed
models look current and hides new catalog entries behind an extra selector level. A short
`models.default` list may remain only as a temporary fallback when discovery is unavailable.
The client refreshes the catalog every minute and on focus/reconnect. LibreChat retains each
user's last successful AI Pass catalog for one day, so a brief AI Pass deployment does not collapse
the selector to the static fallback.

## Remaining balance

The account menu shows the user's authoritative remaining AI Pass balance. LibreChat obtains it
server-side from `GET /api/v1/usage/me/summary` with the user's encrypted OAuth credential and
returns only the normalized USD amounts to the browser. The OAuth access token is never exposed.
The value refreshes on window focus, reconnect, and every 30 seconds while chat is open.

## Image generation and editing

`AI Pass Image Studio` is enabled by default in the Docker configurations. Add it to a LibreChat
Agent from the Agent Builder's Tools list. It provides both text-to-image generation and
multi-image editing.

At tool initialization, LibreChat resolves the user's OAuth token and discovers the currently
available models separately:

```text
GET /v1/models?type=image&method=image_generation
GET /v1/models?type=image&method=image_edit
```

The agent can select only a model returned by the corresponding catalog. If catalog discovery is
temporarily unavailable, the stable defaults are `nano-banana-2` for generation and
`nano-banana-2-edit` for editing. Operators can pin alternatives with
`IMAGE_GEN_OAI_MODEL` and `IMAGE_EDIT_OAI_MODEL`.

The integration accepts either `url` or `b64_json` image responses and sends repeated AI
Pass-compatible `image` multipart fields for multi-image edits.

## Files and retrieval

LibreChat Agents already expose full-document context through the `context` capability. Those
documents are parsed and included in the request sent to the selected AI Pass chat model, so this
path keeps model usage on the user's account without requiring embeddings.

The stock LibreChat RAG container is different: it initializes one process-wide embedding API key.
It cannot safely resolve `aipass_oauth` independently for concurrent users, so do not set
`RAG_OPENAI_API_KEY=aipass_oauth`. Per-user AI Pass semantic RAG requires a request-scoped
credential extension in the RAG service before it can be enabled without misattributing usage.
