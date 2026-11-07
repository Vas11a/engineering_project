# API reference

Prefix: /api/v1. Private endpoints require Authorization: tma <initData> (or explicit local development auth). JSON errors use { error: { code, message } }. Invalid input returns 400; missing auth 401; missing/unowned resources 404.

## Library and catalog

| Method           | Path                                                               | Body/result                      |
| ---------------- | ------------------------------------------------------------------ | -------------------------------- |
| GET              | /users/me                                                          | { user }                         |
| GET/POST         | /sets                                                              | List { sets } / create { set }   |
| GET/PATCH/DELETE | /sets/:setId                                                       | Read/update { set }, delete 204  |
| GET/POST         | /sets/:setId/cards                                                 | List { cards } / create { card } |
| PATCH/DELETE     | /sets/:setId/cards/:cardId                                         | Update { card }, delete 204      |
| GET              | /public-sets?q=&sourceLanguage=&targetLanguage=&page=1&pageSize=12 | { sets, total, page, pageSize }  |
| GET              | /public-sets/:setId                                                | { set, cards }                   |
| POST             | /public-sets/:setId/copy                                           | Independent personal { set }     |

Set input: title, description (optional nullable), sourceLanguage, targetLanguage. PATCH also accepts visibility PRIVATE/PUBLIC. Card input: sourceText, translation, explanation (optional nullable), examples (optional array), creationSource (optional MANUAL/AI). Unknown fields are rejected. Limits: title120, description500, source/translation250, explanation1000, at most five examples of500 characters.

Catalog still requires Telegram identity. Private sets are not exposed.

## Study and progress

| Method | Path                        | Body/result                                                                                                            |
| ------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | /study/due?setId=           | { dueCount, newCount, totalCount }                                                                                     |
| POST   | /study/sessions             | { setId?, mode, limit? } → { session }                                                                                 |
| GET    | /study/sessions/:id         | { session }, for resume                                                                                                |
| POST   | /study/sessions/:id/reveal  | Current flashcard { translation, explanation, examples }                                                               |
| POST   | /study/sessions/:id/answers | { cardId, submittedValue?, confidence?, responseTimeMs? } → { isCorrect, translation, explanation, examples, session } |
| POST   | /study/sessions/:id/abandon | { session } marked abandoned                                                                                           |
| GET    | /progress                   | Totals, accuracy, recent sessions and per-set progress                                                                 |

Modes: FLASHCARDS, TRANSLATION, MULTIPLE_CHOICE, MIXED. Limit1–50, default10. No eligible cards returns409. Flashcard confidence:1 Again,2 Good,3 Easy. Other modes submit the translation or selected option.

Session shape: { id, mode, status, total, answered, correct, current }. Status ACTIVE/COMPLETED/ABANDONED. Current is { cardId, sourceText, mode, options? } or null after completion/abandonment. Correct answers are not exposed before submission except flashcard reveal.

## AI and bot

POST /ai/card-content accepts { sourceText, sourceLanguage, targetLanguage }, returns draft { translation, explanation, examples } and never saves a card. Errors: AI_NOT_CONFIGURED503, AI_RATE_LIMIT429 with Retry-After, AI_TIMEOUT504, AI_UNAVAILABLE502.

POST /telegram/webhook accepts Telegram Update JSON with X-Telegram-Bot-Api-Secret-Token instead of Mini App auth. Invalid secret403. Completed duplicates are acknowledged without another reply; updates leased by another worker return503 for retry.

GET /health and GET /ready have no /api/v1 prefix. The latter returns503 if PostgreSQL is unavailable.
