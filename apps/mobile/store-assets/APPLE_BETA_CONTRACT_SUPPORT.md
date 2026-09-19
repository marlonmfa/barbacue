# Apple Developer Support — TestFlight Beta Contract missing

Status: prepared locally; not sent.

Subject: External TestFlight review blocked for three apps — ENTITY_UNPROCESSABLE.BETA_CONTRACT_MISSING

Hello Apple Developer Support,

Please investigate and escalate to the App Store Connect / TestFlight account engineering team. External beta review submission is blocked for all three apps below. Please verify whether the TestFlight Beta Contract record is missing or detached for the team/apps, and repair or re-provision it if appropriate.

Signing Team ID configured in the iOS project: 3A3X2G4UPK.
Reproduced at: 2026-09-10T02:21:07.628840+00:00.

| App | App Store Connect ID | Bundle ID | Build number | Build ID | Error request ID |
|---|---|---|---|---|---|
| barbacue | 6782376058 | com.lanchesdobarba.barbacue | 14 | eb182444-9231-48ce-8ffa-33b2f55f255a | 1d16b1a1-39e5-4ced-a556-6944fdb424de |
| chelas | 6807118144 | com.lanchesdobarba.chelas | 3 | 1bf81396-d6e6-4da2-9b79-e85b65666588 | 555537b2-6665-4168-9d1c-ea2a4d665d6f |
| barbadog | 6807118285 | com.lanchesdobarba.barbadog | 3 | 33e5d155-abec-49c2-a8b2-5a28790d8bce | ce47b545-8960-4195-947b-09fbcee42718 |

Confirmed checks:

- All three builds have processingState VALID and externalBuildState READY_FOR_BETA_SUBMISSION.
- No betaAppReviewSubmissions exist for these builds.
- The apps have external beta groups, enabled public links, associated builds, beta descriptions, feedback contacts, review contact details and test instructions.
- In the previous authenticated App Store Connect session on September 9, 2026, Business > Agreements showed Free Apps Agreement Active (September 8, 2026–April 21, 2027). Paid Apps Agreement showed New; these are free restaurant apps with no Apple In-App Purchases.
- Barbacue production version was READY_FOR_SALE; Chelas and Barbadog production versions were WAITING_FOR_REVIEW in that session.
- The browser session has now expired; a fresh check for any Developer Account agreement banner is pending sign-in.

Reproduction:

POST https://api.appstoreconnect.apple.com/v1/betaAppReviewSubmissions
```json
{
  "data": {
    "type": "betaAppReviewSubmissions",
    "relationships": {
      "build": {
        "data": {
          "type": "builds",
          "id": "eb182444-9231-48ce-8ffa-33b2f55f255a"
        }
      }
    }
  }
}
```

Each build returns HTTP 422:
```json
{
  "status": "422",
  "code": "ENTITY_UNPROCESSABLE.BETA_CONTRACT_MISSING",
  "title": "Beta contract is missing for the app.",
  "detail": "Beta Contract is missing."
}
```

An Apple DTS engineer has directed developers with this same error to Developer Account Support: https://developer.apple.com/forums/thread/814565 .

Please confirm the account-side cause and required correction. If a specific agreement needs acceptance by the Account Holder, please identify its exact name and where it is available. Once corrected, please confirm whether the current builds can be resubmitted or new builds are necessary.

Thank you.
