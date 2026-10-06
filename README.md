# price-watcher

Every 30 minutes from 06:00 to 22:00 (Bogotá; cron-job.org triggers the GitHub workflow), sends a phone notification with each watched coin's price
and how it compares with your buy price. Silent at night. Free: GitHub Actions + DexScreener + ntfy.

## Get the notifications

1. Install **ntfy** on your phone (App Store / Google Play).
2. Tap **+**, subscribe to your private topic (the name is in the GitHub secret `NTFY_TOPIC`; Claude gave it to you).
   Anyone with the topic name can read it, so don't share it.

## Watch a coin

Edit `watchlist.json` (on GitHub: open the file → pencil icon → Commit changes):

```json
[
  { "symbol": "ORBIO", "chain": "robinhood", "address": "0xaa07a0e9209e16ac99708c3ec70159c6ef3128a3", "buyPrice": 0.0713, "investedUsd": 200 }
]
```

- `chain`: `solana`, `robinhood`, `bsc`, `base` or `ethereum`
- `address`: the coin's contract
- `buyPrice`: what you paid per coin, in USD; `investedUsd` (optional) adds the current value
- `"active": false` pauses one coin without deleting it

A coin at +100% or −50% vs your buy price sends a louder notification. Saving the watchlist also sends an update right away (during the hours).

## Test

- On GitHub: Actions → price-watch → Run workflow → tick "Send now" → Run.
- Locally: `DRY_RUN=1 FORCE=1 node watch.mjs` prints the message without sending.

## Cost

Free. A private repo gets 2,000 Actions minutes a month; this uses about 1,000 (33 short runs a day, each billed as 1 minute).

## Trigger (cron-job.org)

GitHub's built-in schedule skipped most runs and delayed the rest by hours, so cron-job.org starts the workflow instead.

1. GitHub → Settings → Developer settings → Fine-grained tokens → Generate: repository access "Only select" → price-watcher, permission Actions: Read and write.
2. cron-job.org → Create cronjob:
   - URL `https://api.github.com/repos/mateobadillo/price-watcher/actions/workflows/watch.yml/dispatches`
   - Schedule: custom, minutes 0 and 30, hours 6–22, timezone America/Bogota
   - Advanced: method POST, body `{"ref":"main"}`, headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`
3. "Test run" must answer 204.

When the token expires, runs stop with 401: make a new token and paste it into the cron job.
