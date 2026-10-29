# Daily Instagram posts — 2050 Connect

Every morning around **8:00 AM Kigali time** this robot makes a new picture and caption for each app and publishes it to that app's Instagram account:

| Account | What it posts |
|---|---|
| 2050 Connect | Websites, apps, management systems, portfolio, plans |
| EasyBuy Africa | Every other day: a real product from easybuyrw.com (live photo + price). Other days: a service post (delivery, MoMo, Ship from China, Sell on EasyBuy…) |
| Vamos Travel | Taxi app, car rental, tours, stays, Visit Rwanda packages… |
| Work Smart | One business tool or business type per day |
| Find me | Activities, safety, how it works, countries |
| Find it | Categories, selling tips, safety tips |

## Where things are
- `content/*.json` — the post ideas for each app (30 per app; they rotate).
- `posts/YYYY-MM-DD/` — the pictures and captions that were published each day.
- `state/state.json` — log of what was posted (with links).
- Which Instagram account belongs to which app: `IG_USERNAMES` at the top of `scripts/daily.js`. Each Instagram account must be a Business/Creator account linked to a Facebook Page.
- The login is the repository secret **IG_ACCOUNTS** (Settings → Secrets and variables → Actions): a long-lived Facebook user token from the Meta app "2050 Connect Autopost". The robot turns it into Page tokens (which don't expire) and keeps them encrypted in `state/tokens.enc`.

## Run it by hand
Actions tab → **Daily Instagram posts** → **Run workflow**. Tick *Preview only* to make pictures without posting.

If a day fails, GitHub emails rw2050connect@gmail.com.
