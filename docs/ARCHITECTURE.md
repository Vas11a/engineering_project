# Architecture and adaptive learning

Telegram supplies signed launch data in Authorization: tma <initData>. Express verifies its HMAC and age, resolves the user and scopes private resources to that identity. A development identity is opt-in and forbidden in production. Bot webhooks use an independent secret header.

React calls only Express. Prisma/PostgreSQL and AI/Telegram requests run on the backend. Application queries use pooled PostgreSQL; migrations use a direct connection. There is no browser-readable server credential.

## Entities

- User: Telegram identity/profile.
- VocabularySet: owner, language pair, visibility and original-set reference.
- Card: text, translation, explanation, examples and creation source.
- CardProgress: per-user scheduling state.
- StudySession: mode, lifecycle and durable question queue.
- StudyAnswer: outcome and timing.
- BotUpdate: delivery receipt with recovery lease.
- AiRateLimit: shared hourly generation quota.

Public copies receive independent set/card IDs; learning history is not copied. Later original changes do not propagate. Publication requires a nonempty valid set and never grants editing rights.

## Learning sessions

Sessions choose due reviewed cards before new cards. Only personal library cards participate; copy a public set before studying it. Question snapshots and multiple-choice distractors persist in PostgreSQL. Insufficient distinct choices fall back to typed translation. Correct answers remain hidden until submission, except flashcard reveal.

Typed answers normalize Unicode NFKC, whitespace and case. Spelling, accents and punctuation still matter. Flashcards use self-assessment (Again incorrect; Good/Easy correct). Multiple choice is graded against the stored translation.

Answer recording, progress updates and session transitions are atomic. Retry protection prevents the same answer from advancing twice. The frontend retains the active session ID per user and fetches server state when reopening.

## Deterministic scheduling

The pure scheduler accepts previous progress, correctness, confidence and an explicit clock. It uses no random values, AI or response-time heuristics.

| Outcome                    | Next review                                                         |
| -------------------------- | ------------------------------------------------------------------- |
| Incorrect                  | 10 minutes; streak resets, interval zero                            |
| First consecutive correct  | 1 day                                                               |
| Second consecutive correct | 3 days                                                              |
| Further correct            | Previous interval × ease, at least one day growth, at most 365 days |

Ease begins at 2.5, stays between 1.3 and 3, increases slightly for Easy correct answers and decreases for hard/incorrect answers. Learned means interval at least seven days. Due means a reviewed card whose next-review date has arrived; new means no progress record. Accuracy derives from recorded answers.

This is an understandable, testable initial spaced-repetition algorithm for the engineering project; it does not claim to reproduce a validated scientific memory model.
